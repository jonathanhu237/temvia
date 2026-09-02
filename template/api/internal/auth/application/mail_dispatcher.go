package application

import (
	"context"
	"crypto/subtle"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"html"
	"strings"
	"time"

	"example.com/temvia/api/internal/auth/domain"
)

type MailDispatcher struct {
	outbox        MailOutboxStore
	mailer        Mailer
	random        RandomSource
	tokenKey      []byte
	invitationKey []byte
	publicURL     string
	pollInterval  time.Duration
	lease         time.Duration
	retryInitial  time.Duration
	retryMax      time.Duration
	maxAttempts   int
	now           func() time.Time
}

func NewMailDispatcher(outbox MailOutboxStore, mailer Mailer, random RandomSource, tokenKey []byte, publicURL string, pollInterval, lease, retryInitial, retryMax time.Duration, invitationKeys ...[]byte) *MailDispatcher {
	dispatcher := &MailDispatcher{
		outbox:       outbox,
		mailer:       mailer,
		random:       random,
		tokenKey:     append([]byte(nil), tokenKey...),
		publicURL:    strings.TrimRight(publicURL, "/"),
		pollInterval: pollInterval,
		lease:        lease,
		retryInitial: retryInitial,
		retryMax:     retryMax,
		maxAttempts:  10,
		now:          time.Now,
	}
	if len(invitationKeys) > 0 {
		dispatcher.invitationKey = append([]byte(nil), invitationKeys[0]...)
	}
	return dispatcher
}

func (d *MailDispatcher) Run(ctx context.Context) {
	if d.pollInterval <= 0 {
		d.pollInterval = time.Second
	}
	ticker := time.NewTicker(d.pollInterval)
	defer ticker.Stop()
	for {
		if err := d.ProcessOnce(ctx); err != nil && ctx.Err() != nil {
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// ProcessOnce performs one bounded claim/send/ack cycle. SMTP is called only
// after the claim transaction has committed.
func (d *MailDispatcher) ProcessOnce(ctx context.Context) error {
	if d.outbox == nil || d.mailer == nil || d.random == nil {
		return ErrDependencyUnavailable
	}
	if err := d.outbox.SweepMail(ctx); err != nil {
		return dependencyError(err)
	}
	if err := d.outbox.CleanupMail(ctx); err != nil {
		return dependencyError(err)
	}
	leaseToken, err := newLeaseToken(d.random)
	if err != nil {
		return dependencyError(err)
	}
	job, err := d.outbox.ClaimMail(ctx, leaseToken, d.lease)
	if err != nil {
		return dependencyError(err)
	}
	if job == nil {
		return nil
	}
	if !d.now().Before(job.ExpiresAt) {
		ackCtx, cancel := d.deliveryContext(ctx)
		defer cancel()
		discarded, discardErr := d.outbox.DiscardMail(ackCtx, job.ID, job.LeaseToken, "expired")
		if discardErr != nil {
			return dependencyError(discardErr)
		}
		if !discarded {
			return nil
		}
		return nil
	}
	message, err := d.compose(*job)
	if err != nil {
		ackCtx, cancel := d.deliveryContext(ctx)
		defer cancel()
		errorCode := "invalid_reset"
		if job.Kind == MailUserInvitation {
			errorCode = "invalid_invitation"
		}
		discarded, discardErr := d.outbox.DiscardMail(ackCtx, job.ID, job.LeaseToken, errorCode)
		if discardErr != nil {
			return dependencyError(discardErr)
		}
		if !discarded {
			return nil
		}
		return nil
	}
	deliveryCtx, cancelDelivery := d.deliveryContext(ctx)
	defer cancelDelivery()
	sendErr := d.mailer.Send(deliveryCtx, message)
	ackCtx, cancelAck := d.deliveryContext(ctx)
	defer cancelAck()
	if sendErr == nil {
		marked, err := d.outbox.MarkMailSent(ackCtx, job.ID, job.LeaseToken)
		if err != nil {
			return dependencyError(err)
		}
		// A false result means another worker already changed the row or the
		// lease expired. The SMTP send is still valid; there is no safe local
		// state transition left to make.
		if !marked {
			return nil
		}
		return nil
	}
	return d.handleDeliveryFailure(ackCtx, *job, sendErr)
}

// deliveryContext deliberately detaches a claimed SMTP operation and its
// conditional ack from the signal context. Once a job is leased, shutdown
// must stop new claims while allowing this active operation to drain within
// the lease window. A lease is always longer than the configured SMTP timeout
// in production configuration, so this also gives abandoned sends a bound.
func (d *MailDispatcher) deliveryContext(ctx context.Context) (context.Context, context.CancelFunc) {
	base := context.WithoutCancel(ctx)
	lease := d.lease
	if lease <= 0 {
		lease = 30 * time.Second
	}
	return context.WithTimeout(base, lease)
}

func (d *MailDispatcher) compose(job MailJob) (OutgoingMail, error) {
	message := OutgoingMail{
		MessageID: "temvia-outbox-" + job.ID + "@temvia",
		Kind:      job.Kind,
		Name:      job.Name,
		To:        job.Email,
		Locale:    job.Locale,
	}
	if job.Kind == MailPasswordReset {
		if len(job.ResetSelector) != domain.PasswordResetSelectorBytes || len(job.VerifierDigest) != domain.PasswordResetVerifierBytes {
			return OutgoingMail{}, ErrInvalidPasswordResetToken
		}
		material, err := domain.NewPasswordResetMaterial(d.tokenKey, job.ResetSelector)
		if err != nil || subtle.ConstantTimeCompare(material.VerifierDigest, job.VerifierDigest) != 1 {
			return OutgoingMail{}, ErrInvalidPasswordResetToken
		}
		token, err := domain.NewPasswordResetToken(d.tokenKey, job.ResetSelector)
		if err != nil {
			return OutgoingMail{}, ErrInvalidPasswordResetToken
		}
		link := d.publicURL + "/reset-password#token=" + token
		return resetMail(message, link, job.Locale, job.ExpiresAt), nil
	}
	if job.Kind == MailPasswordChanged {
		return changedMail(message, job.CreatedAt, job.Locale), nil
	}
	if job.Kind == MailUserInvitation {
		if len(job.ResetSelector) != 16 || len(job.VerifierDigest) != 32 || len(d.invitationKey) != 32 {
			return OutgoingMail{}, ErrInvitationInvalid
		}
		material, err := domain.NewInvitationMaterial(d.invitationKey, job.ResetSelector)
		if err != nil || subtle.ConstantTimeCompare(material.VerifierDigest, job.VerifierDigest) != 1 {
			return OutgoingMail{}, ErrInvitationInvalid
		}
		token, err := domain.NewInvitationToken(d.invitationKey, job.ResetSelector)
		if err != nil {
			return OutgoingMail{}, ErrInvitationInvalid
		}
		link := d.publicURL + "/accept-invitation#token=" + token
		return invitationMail(message, link, job.Locale, job.ExpiresAt), nil
	}
	return OutgoingMail{}, fmt.Errorf("unsupported mail kind")
}

func (d *MailDispatcher) handleDeliveryFailure(ctx context.Context, job MailJob, err error) error {
	var deliveryErr *MailDeliveryError
	if (job.Kind == MailPasswordReset || job.Kind == MailUserInvitation) && !d.now().Before(job.ExpiresAt) {
		discarded, updateErr := d.outbox.DiscardMail(ctx, job.ID, job.LeaseToken, "expired")
		if updateErr != nil {
			return dependencyError(updateErr)
		}
		if !discarded {
			return nil
		}
		return nil
	}
	if errors.As(err, &deliveryErr) && deliveryErr.Temporary && job.Attempts < d.maxAttempts && d.now().Before(job.ExpiresAt) {
		delay, jitterErr := d.retryDelay(job.Attempts)
		if jitterErr != nil {
			delay = d.retryInitial
		}
		if delay <= 0 {
			delay = d.retryInitial
			if delay <= 0 {
				delay = time.Second
			}
		}
		if d.retryMax > 0 && delay > d.retryMax {
			delay = d.retryMax
		}
		retried, updateErr := d.outbox.RetryMail(ctx, job.ID, job.LeaseToken, delay, "temporary")
		if updateErr != nil {
			return dependencyError(updateErr)
		}
		if !retried {
			return nil
		}
		return nil
	}
	code := "permanent"
	if deliveryErr != nil {
		switch deliveryErr.Code {
		case "temporary", "permanent", "expired", "superseded", "invalid_reset", "invalid_invitation", "dependency":
			code = deliveryErr.Code
		}
	}
	deadLettered, updateErr := d.outbox.DeadLetterMail(ctx, job.ID, job.LeaseToken, code)
	if updateErr != nil {
		return dependencyError(updateErr)
	}
	if !deadLettered {
		return nil
	}
	return nil
}

func (d *MailDispatcher) retryDelay(attempt int) (time.Duration, error) {
	if d.retryInitial <= 0 {
		return 0, nil
	}
	if attempt < 1 {
		attempt = 1
	}
	delay := d.retryInitial
	for i := 1; i < attempt && delay < d.retryMax; i++ {
		if delay > d.retryMax/2 {
			delay = d.retryMax
			break
		}
		delay *= 2
	}
	if d.retryMax > 0 && delay > d.retryMax {
		delay = d.retryMax
	}
	if delay <= 1 {
		return delay, nil
	}
	var raw [8]byte
	if err := d.random.Read(raw[:]); err != nil {
		return 0, err
	}
	return time.Duration(binary.BigEndian.Uint64(raw[:]) % uint64(delay)), nil
}

func newLeaseToken(random RandomSource) (string, error) {
	var raw [16]byte
	if err := random.Read(raw[:]); err != nil {
		return "", err
	}
	// UUIDv4 layout gives database UUID parsing plus an unpredictable lease.
	raw[6] = (raw[6] & 0x0f) | 0x40
	raw[8] = (raw[8] & 0x3f) | 0x80
	encoded := hex.EncodeToString(raw[:])
	return encoded[0:8] + "-" + encoded[8:12] + "-" + encoded[12:16] + "-" + encoded[16:20] + "-" + encoded[20:32], nil
}

func resetMail(message OutgoingMail, link string, locale domain.Locale, expiresAt time.Time) OutgoingMail {
	expiry := formatMailExpiry(expiresAt)
	if locale == domain.LocaleChinese {
		message.Subject = "重置 Temvia 密码"
		message.Text = "Temvia · 账户安全\n\n密码恢复\n\n您好，" + message.Name + "：\n\n我们收到了一次重置 Temvia 密码的请求。请使用下面的链接设置新密码。\n\n到期时间：" + expiry + "\n\n设置新密码：\n" + link + "\n\n如果这不是您发起的请求，可以忽略这封邮件。只有完成重置流程后，密码才会改变。"
		message.HTML = mailFrame(locale, "密码恢复", resetMailBody(locale, message.Name, link, expiry))
		return message
	}
	message.Subject = "Reset your Temvia password"
	message.Text = "Temvia · ACCOUNT SECURITY\n\nPASSWORD RECOVERY\n\nHello " + message.Name + ",\n\nWe received a request to reset your Temvia password. Use the link below to choose a new password.\n\nExpires at: " + expiry + "\n\nSet a new password:\n" + link + "\n\nIf you did not request this, you can safely ignore this email. Your password will not change unless you complete the reset."
	message.HTML = mailFrame(locale, "PASSWORD RECOVERY", resetMailBody(locale, message.Name, link, expiry))
	return message
}

func invitationMail(message OutgoingMail, link string, locale domain.Locale, expiresAt time.Time) OutgoingMail {
	expiry := formatMailExpiry(expiresAt)
	safeName := html.EscapeString(message.Name)
	safeLink := html.EscapeString(link)
	safeExpiry := html.EscapeString(expiry)
	if locale == domain.LocaleChinese {
		message.Subject = "加入 Temvia 管理后台"
		message.Text = "Temvia · 管理员邀请\n\n您好，" + message.Name + "：\n\n您收到了一封 Temvia 管理后台邀请。请使用下面的一次性链接设置密码并激活账户。\n\n到期时间：" + expiry + "\n\n接受邀请：\n" + link + "\n\n如果您不认识邀请方，可以忽略这封邮件。"
		message.HTML = mailFrame(locale, "管理员邀请", `<span style="display:inline-block;padding:6px 10px;border:1px solid #C7D2FE;border-radius:999px;color:#4338CA;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;line-height:16px;">管理员邀请</span>
<h1 style="margin:18px 0 16px;color:#101828;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:30px;font-weight:700;letter-spacing:-0.5px;line-height:38px;">接受你的邀请</h1>
<p style="margin:0 0 16px;color:#344054;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;">您好，`+safeName+`：</p>
<p style="margin:0 0 28px;color:#475467;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;">您被邀请加入 Temvia 管理后台。请设置密码以激活您的账户。</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="padding:16px 18px;border-left:4px solid #5B5CE2;background:#EEF0FF;"><p style="margin:0 0 5px;color:#4338CA;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;line-height:16px;">到期时间</p><p style="margin:0;color:#101828;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;line-height:28px;">`+safeExpiry+`</p><p style="margin:5px 0 0;color:#475467;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;">链接只能使用一次。</p></td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;"><tr><td bgcolor="#5B5CE2" style="border-radius:6px;background:#5B5CE2;"><a href="`+safeLink+`" style="display:inline-block;padding:13px 22px;border:1px solid #5B5CE2;border-radius:6px;color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;line-height:24px;text-decoration:none;">接受邀请</a></td></tr></table>
<p style="margin:0 0 8px;color:#667085;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;">按钮无法打开？请将下面的链接复制到浏览器：</p><p style="margin:0 0 28px;color:#4338CA;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,&quot;Liberation Mono&quot;,&quot;Courier New&quot;,monospace;font-size:12px;line-height:19px;word-break:break-all;">`+safeLink+`</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:15px 16px;border-left:4px solid #D97706;background:#FFFAEB;"><p style="margin:0;color:#7A2E0C;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;"><strong>不是您发起的请求？</strong><br>可以忽略这封邮件。</p></td></tr></table>`)
		return message
	}
	message.Subject = "You are invited to Temvia"
	message.Text = "Temvia · ADMIN INVITATION\n\nHello " + message.Name + ",\n\nYou have been invited to the Temvia administration app. Use the one-time link below to set your password and activate your account.\n\nExpires at: " + expiry + "\n\nAccept invitation:\n" + link + "\n\nIf you do not recognize this invitation, you can safely ignore this email."
	message.HTML = mailFrame(locale, "ADMIN INVITATION", `<span style="display:inline-block;padding:6px 10px;border:1px solid #C7D2FE;border-radius:999px;color:#4338CA;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;line-height:16px;">ADMIN INVITATION</span>
<h1 style="margin:18px 0 16px;color:#101828;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:30px;font-weight:700;letter-spacing:-0.5px;line-height:38px;">Accept your invitation</h1>
<p style="margin:0 0 16px;color:#344054;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;">Hello `+safeName+`,</p>
<p style="margin:0 0 28px;color:#475467;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;">You have been invited to the Temvia administration app. Set a password to activate your account.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="padding:16px 18px;border-left:4px solid #5B5CE2;background:#EEF0FF;"><p style="margin:0 0 5px;color:#4338CA;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;line-height:16px;">EXPIRES AT</p><p style="margin:0;color:#101828;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;line-height:28px;">`+safeExpiry+`</p><p style="margin:5px 0 0;color:#475467;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;">This link can be used once.</p></td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;"><tr><td bgcolor="#5B5CE2" style="border-radius:6px;background:#5B5CE2;"><a href="`+safeLink+`" style="display:inline-block;padding:13px 22px;border:1px solid #5B5CE2;border-radius:6px;color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;line-height:24px;text-decoration:none;">Accept invitation</a></td></tr></table>
<p style="margin:0 0 8px;color:#667085;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;">Button not working? Copy and paste this link into your browser:</p><p style="margin:0 0 28px;color:#4338CA;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,&quot;Liberation Mono&quot;,&quot;Courier New&quot;,sans-serif;font-size:12px;line-height:19px;word-break:break-all;">`+safeLink+`</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:15px 16px;border-left:4px solid #D97706;background:#FFFAEB;"><p style="margin:0;color:#7A2E0C;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;"><strong>Did not expect this?</strong><br>You can safely ignore this email.</p></td></tr></table>`)
	return message
}

func resetMailBody(locale domain.Locale, name, link, expiry string) string {
	safeName := html.EscapeString(name)
	safeLink := html.EscapeString(link)
	safeExpiry := html.EscapeString(expiry)
	if locale == domain.LocaleChinese {
		return `<span style="display:inline-block;padding:6px 10px;border:1px solid #C7D2FE;border-radius:999px;color:#4338CA;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;line-height:16px;">密码恢复</span>
<h1 style="margin:18px 0 16px;color:#101828;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:30px;font-weight:700;letter-spacing:-0.5px;line-height:38px;">重置你的密码</h1>
<p style="margin:0 0 16px;color:#344054;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;">您好，` + safeName + `：</p>
<p style="margin:0 0 28px;color:#475467;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;">我们收到了一次重置 Temvia 密码的请求。请使用下面的按钮设置新密码。</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="padding:16px 18px;border-left:4px solid #5B5CE2;background:#EEF0FF;"><p style="margin:0 0 5px;color:#4338CA;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;line-height:16px;">到期时间</p><p style="margin:0;color:#101828;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;line-height:28px;">` + safeExpiry + `</p><p style="margin:5px 0 0;color:#475467;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;">链接只能使用一次。</p></td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;"><tr><td bgcolor="#5B5CE2" style="border-radius:6px;background:#5B5CE2;"><a href="` + safeLink + `" style="display:inline-block;padding:13px 22px;border:1px solid #5B5CE2;border-radius:6px;color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;line-height:24px;text-decoration:none;">设置新密码</a></td></tr></table>
<p style="margin:0 0 8px;color:#667085;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;">按钮无法打开？请将下面的链接复制到浏览器：</p>
<p style="margin:0 0 28px;color:#4338CA;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,&quot;Liberation Mono&quot;,&quot;Courier New&quot;,monospace;font-size:12px;line-height:19px;word-break:break-all;">` + safeLink + `</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:15px 16px;border-left:4px solid #D97706;background:#FFFAEB;"><p style="margin:0;color:#7A2E0C;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;"><strong>不是你发起的请求？</strong><br>可以忽略这封邮件。只有完成重置流程后，密码才会改变。</p></td></tr></table>`
	}
	return `<span style="display:inline-block;padding:6px 10px;border:1px solid #C7D2FE;border-radius:999px;color:#4338CA;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;line-height:16px;">PASSWORD RECOVERY</span>
<h1 style="margin:18px 0 16px;color:#101828;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:30px;font-weight:700;letter-spacing:-0.5px;line-height:38px;">Reset your password</h1>
<p style="margin:0 0 16px;color:#344054;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;">Hello ` + safeName + `,</p>
<p style="margin:0 0 28px;color:#475467;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;">We received a request to reset your Temvia password. Use the button below to choose a new password.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="padding:16px 18px;border-left:4px solid #5B5CE2;background:#EEF0FF;"><p style="margin:0 0 5px;color:#4338CA;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;line-height:16px;">EXPIRES AT</p><p style="margin:0;color:#101828;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;line-height:28px;">` + safeExpiry + `</p><p style="margin:5px 0 0;color:#475467;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;">This link can be used once.</p></td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;"><tr><td bgcolor="#5B5CE2" style="border-radius:6px;background:#5B5CE2;"><a href="` + safeLink + `" style="display:inline-block;padding:13px 22px;border:1px solid #5B5CE2;border-radius:6px;color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;line-height:24px;text-decoration:none;">Set a new password</a></td></tr></table>
<p style="margin:0 0 8px;color:#667085;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;">Button not working? Copy and paste this link into your browser:</p>
<p style="margin:0 0 28px;color:#4338CA;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,&quot;Liberation Mono&quot;,&quot;Courier New&quot;,monospace;font-size:12px;line-height:19px;word-break:break-all;">` + safeLink + `</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:15px 16px;border-left:4px solid #D97706;background:#FFFAEB;"><p style="margin:0;color:#7A2E0C;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;"><strong>Did not request this?</strong><br>You can safely ignore this email. Your password will not change unless you complete the reset.</p></td></tr></table>`
}

func mailFrame(locale domain.Locale, badge, body string) string {
	lang := "en"
	sectionLabel := "ACCOUNT SECURITY"
	footerTitle := "Temvia · Account security"
	footerCopy := "This message was sent automatically."
	if locale == domain.LocaleChinese {
		lang = "zh-CN"
		sectionLabel = "账户安全"
		footerTitle = "Temvia · 账户安全"
		footerCopy = "这是一封自动发送的邮件。"
	}
	return `<!DOCTYPE html>
<html lang="` + html.EscapeString(lang) + `">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F4F6F8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4F6F8" style="width:100%;background:#F4F6F8;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td bgcolor="#101828" style="padding:28px 36px;background:#101828;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="top"><p style="margin:0;color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:800;letter-spacing:1px;line-height:24px;">TEMVIA</p><p style="margin:7px 0 0;color:#98A2B3;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;line-height:16px;">` + html.EscapeString(sectionLabel) + `</p></td><td align="right" valign="top"><span style="display:inline-block;padding:5px 8px;border:1px solid #475467;border-radius:4px;color:#D0D5DD;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1px;line-height:14px;">` + html.EscapeString(badge) + `</span></td></tr></table></td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:40px 40px 36px;background:#FFFFFF;">` + body + `</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:22px 40px 30px;border-top:1px solid #EAECF0;background:#FFFFFF;"><p style="margin:0 0 5px;color:#344054;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;line-height:20px;">` + html.EscapeString(footerTitle) + `</p><p style="margin:0;color:#98A2B3;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;">` + html.EscapeString(footerCopy) + `</p></td></tr>
</table></td></tr></table>
</body></html>`
}

func changedMailBody(locale domain.Locale, name, when string) string {
	safeName := html.EscapeString(name)
	safeWhen := html.EscapeString(when)
	if locale == domain.LocaleChinese {
		return `<span style="display:inline-block;padding:6px 10px;border:1px solid #C7D2FE;border-radius:999px;color:#4338CA;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;line-height:16px;">密码已更新</span>
<h1 style="margin:18px 0 16px;color:#101828;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:30px;font-weight:700;letter-spacing:-0.5px;line-height:38px;">你的密码已修改</h1>
<p style="margin:0 0 16px;color:#344054;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;">您好，` + safeName + `：</p>
<p style="margin:0 0 28px;color:#475467;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;">你的 Temvia 密码已成功更新。以下是这次修改的记录时间。</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;"><tr><td style="padding:17px 18px;border-left:4px solid #5B5CE2;background:#EEF0FF;"><p style="margin:0 0 5px;color:#4338CA;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;line-height:16px;">修改时间（UTC）</p><p style="margin:0;color:#101828;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,&quot;Liberation Mono&quot;,&quot;Courier New&quot;,monospace;font-size:17px;font-weight:700;line-height:26px;word-break:break-word;">` + safeWhen + `</p></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:16px 16px;border-left:4px solid #D97706;background:#FFFAEB;"><p style="margin:0;color:#7A2E0C;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;"><strong>不是你发起的操作？</strong><br>请立即联系管理员。请不要通过邮件提供密码。</p></td></tr></table>`
	}
	return `<span style="display:inline-block;padding:6px 10px;border:1px solid #C7D2FE;border-radius:999px;color:#4338CA;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;line-height:16px;">PASSWORD UPDATED</span>
<h1 style="margin:18px 0 16px;color:#101828;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:30px;font-weight:700;letter-spacing:-0.5px;line-height:38px;">Your password was changed</h1>
<p style="margin:0 0 16px;color:#344054;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;">Hello ` + safeName + `,</p>
<p style="margin:0 0 28px;color:#475467;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;">Your Temvia password was successfully updated. The change was recorded at the time shown below.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;"><tr><td style="padding:17px 18px;border-left:4px solid #5B5CE2;background:#EEF0FF;"><p style="margin:0 0 5px;color:#4338CA;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;line-height:16px;">CHANGED AT (UTC)</p><p style="margin:0;color:#101828;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,&quot;Liberation Mono&quot;,&quot;Courier New&quot;,monospace;font-size:17px;font-weight:700;line-height:26px;word-break:break-word;">` + safeWhen + `</p></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:16px 16px;border-left:4px solid #D97706;background:#FFFAEB;"><p style="margin:0;color:#7A2E0C;font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;"><strong>Did not make this change?</strong><br>Contact your administrator immediately. Never share your password by email.</p></td></tr></table>`
}

func changedMail(message OutgoingMail, changedAt time.Time, locale domain.Locale) OutgoingMail {
	when := changedAt.UTC().Format("2006-01-02 15:04:05 UTC")
	if locale == domain.LocaleChinese {
		message.Subject = "Temvia 密码已修改"
		message.Text = "Temvia · 账户安全\n\n密码已更新\n\n您好，" + message.Name + "：\n\n你的 Temvia 密码已于 " + when + " 修改。\n\n如果这不是您发起的操作，请立即联系管理员。请不要通过邮件提供密码。"
		message.HTML = mailFrame(locale, "安全状态 · 已确认", changedMailBody(locale, message.Name, when))
		return message
	}
	message.Subject = "Your Temvia password was changed"
	message.Text = "Temvia · ACCOUNT SECURITY\n\nPASSWORD UPDATED\n\nHello " + message.Name + ",\n\nYour Temvia password was changed at " + when + ".\n\nIf you did not make this change, contact your administrator immediately. Never share your password by email."
	message.HTML = mailFrame(locale, "SECURITY STATUS · CONFIRMED", changedMailBody(locale, message.Name, when))
	return message
}

func formatMailExpiry(expiresAt time.Time) string {
	return expiresAt.UTC().Format("2006-01-02 15:04:05 UTC")
}
