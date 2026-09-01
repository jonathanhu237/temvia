package application

import (
	"bytes"
	"context"
	"errors"
	"html"
	"strings"
	"testing"
	"time"

	"example.com/temvia/api/internal/auth/domain"
)

type dispatcherOutboxFake struct {
	job       *MailJob
	sent      bool
	retried   bool
	dead      bool
	discarded bool
	delay     time.Duration
	errorCode string
}

func (f *dispatcherOutboxFake) ClaimMail(_ context.Context, leaseToken string, _ time.Duration) (*MailJob, error) {
	if f.job == nil {
		return nil, nil
	}
	job := *f.job
	job.LeaseToken = leaseToken
	f.job = &job
	return &job, nil
}

func (f *dispatcherOutboxFake) MarkMailSent(context.Context, string, string) (bool, error) {
	f.sent = true
	return true, nil
}

func (f *dispatcherOutboxFake) RetryMail(_ context.Context, _, _ string, delay time.Duration, code string) (bool, error) {
	f.retried = true
	f.delay = delay
	f.errorCode = code
	return true, nil
}

func (f *dispatcherOutboxFake) DeadLetterMail(_ context.Context, _, _, code string) (bool, error) {
	f.dead = true
	f.errorCode = code
	return true, nil
}

func (f *dispatcherOutboxFake) DiscardMail(_ context.Context, _, _, code string) (bool, error) {
	f.discarded = true
	f.errorCode = code
	return true, nil
}

func (f *dispatcherOutboxFake) SweepMail(context.Context) error   { return nil }
func (f *dispatcherOutboxFake) CleanupMail(context.Context) error { return nil }

type dispatcherMailerFake struct {
	message OutgoingMail
	err     error
}

func (f *dispatcherMailerFake) Send(_ context.Context, message OutgoingMail) error {
	f.message = message
	return f.err
}

type cancellationAwareMailer struct {
	started chan struct{}
	release chan struct{}
}

func (m *cancellationAwareMailer) Send(ctx context.Context, _ OutgoingMail) error {
	close(m.started)
	select {
	case <-m.release:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func TestMailDispatcherReconstructsResetLinkAndUsesStableMessageID(t *testing.T) {
	key := bytes.Repeat([]byte{0x61}, domain.PasswordResetVerifierBytes)
	material, err := domain.NewPasswordResetMaterial(key, bytes.Repeat([]byte{0x17}, domain.PasswordResetSelectorBytes))
	if err != nil {
		t.Fatal(err)
	}
	created := time.Unix(100, 0)
	outbox := &dispatcherOutboxFake{job: &MailJob{
		ID:             "00000000-0000-4000-8000-000000000001",
		Kind:           MailPasswordReset,
		Name:           "Ada",
		Email:          "ada@example.com",
		Locale:         domain.LocaleEnglish,
		ResetSelector:  material.Selector,
		VerifierDigest: material.VerifierDigest,
		CreatedAt:      created,
		ExpiresAt:      created.Add(45 * time.Minute),
	}}
	mailer := &dispatcherMailerFake{}
	dispatcher := NewMailDispatcher(outbox, mailer, &fakeRandom{value: 9}, key, "https://admin.example", time.Second, 30*time.Second, 5*time.Second, time.Minute)
	dispatcher.now = func() time.Time { return created.Add(time.Minute) }
	if err := dispatcher.ProcessOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !outbox.sent || outbox.retried || outbox.dead || outbox.discarded {
		t.Fatalf("ack state = %#v", outbox)
	}
	if mailer.message.MessageID != "temvia-outbox-00000000-0000-4000-8000-000000000001@temvia" {
		t.Fatalf("Message-ID = %q", mailer.message.MessageID)
	}
	if !strings.Contains(mailer.message.Text, "45 minutes") || !strings.Contains(mailer.message.Text, "https://admin.example/reset-password#token=v1.") {
		t.Fatalf("reset message = %q", mailer.message.Text)
	}
	assertResetMailHTML(t, mailer.message.HTML, mailer.message.Text, "https://admin.example/reset-password#token=v1.")
	start := strings.Index(mailer.message.Text, "https://admin.example/reset-password#token=")
	link := strings.Fields(mailer.message.Text[start:])[0]
	token := strings.TrimPrefix(link, "https://admin.example/reset-password#token=")
	selector, digest, ok := domain.ParsePasswordResetToken(token)
	if !ok || !bytes.Equal(selector, material.Selector) || !bytes.Equal(digest, material.VerifierDigest) {
		t.Fatalf("reconstructed token = %q, %x, %x, %t", token, selector, digest, ok)
	}
}

func TestMailTemplatesRenderBilingualSecurityLayouts(t *testing.T) {
	name := `Ada <admin> & "owner"`
	link := "https://admin.example/reset-password#token=v1.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&source=mail"
	changedAt := time.Date(2026, time.September, 1, 12, 34, 56, 0, time.FixedZone("CST", 8*60*60))
	secretPassword := "NeverPutThis1!"
	secretToken := "v1.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

	for _, test := range []struct {
		name         string
		locale       domain.Locale
		resetTitle   string
		changedTitle string
		resetCopy    string
		expiry       string
		singleUse    string
		changedCopy  string
		footer       string
	}{
		{name: "english", locale: domain.LocaleEnglish, resetTitle: "Reset your password", changedTitle: "Your password was changed", resetCopy: "Did not request this?", expiry: "45 minutes", singleUse: "This link can be used once.", changedCopy: "Did not make this change?", footer: "Account security"},
		{name: "chinese", locale: domain.LocaleChinese, resetTitle: "重置你的密码", changedTitle: "你的密码已修改", resetCopy: "不是你发起的请求？", expiry: "45 分钟", singleUse: "链接只能使用一次。", changedCopy: "不是你发起的操作？", footer: "账户安全"},
	} {
		t.Run(test.name, func(t *testing.T) {
			reset := resetMail(OutgoingMail{Name: name}, link, test.locale, 45*time.Minute)
			changed := changedMail(OutgoingMail{Name: name}, changedAt, test.locale)
			assertEmailSafeHTML(t, reset.HTML)
			assertEmailSafeHTML(t, changed.HTML)
			if !strings.Contains(reset.HTML, "<a href=\""+html.EscapeString(link)+"\"") {
				t.Fatal("reset HTML is missing the CTA link")
			}
			if got := strings.Count(reset.HTML, `href="`); got != 1 {
				t.Fatalf("reset HTML contains %d href attributes, want CTA only", got)
			}
			if got := strings.Count(reset.HTML, html.EscapeString(link)); got != 2 {
				t.Fatalf("reset link appears %d times in HTML, want CTA plus fallback", got)
			}
			if strings.Contains(changed.HTML, `href="`) {
				t.Fatal("changed notification unexpectedly contains a link")
			}
			if strings.Contains(reset.HTML, link) || strings.Contains(reset.HTML, name) {
				t.Fatal("reset HTML contains an unescaped dynamic value")
			}
			if !strings.Contains(reset.HTML, html.EscapeString(name)) || !strings.Contains(changed.HTML, html.EscapeString(name)) {
				t.Fatal("HTML omitted the escaped recipient name")
			}
			if !strings.Contains(reset.HTML, test.resetTitle) || !strings.Contains(reset.HTML, test.resetCopy) || !strings.Contains(reset.HTML, test.expiry) || !strings.Contains(reset.HTML, test.singleUse) {
				t.Fatalf("reset HTML lacks the %s security content", test.name)
			}
			if !strings.Contains(reset.HTML, test.footer) || !strings.Contains(reset.HTML, "TEMVIA") {
				t.Fatalf("reset HTML lacks the branded footer/header: %s", test.name)
			}
			if !strings.Contains(changed.HTML, test.changedTitle) || !strings.Contains(changed.HTML, test.changedCopy) || !strings.Contains(changed.HTML, "2026-09-01 04:34:56 UTC") {
				t.Fatalf("changed HTML lacks the %s security content", test.name)
			}
			if strings.Contains(changed.HTML, secretPassword) || strings.Contains(changed.HTML, secretToken) || strings.Contains(changed.HTML, "#token=") || strings.Contains(changed.Text, secretPassword) || strings.Contains(changed.Text, secretToken) {
				t.Fatal("changed notification contains a secret")
			}
			if !strings.Contains(reset.Text, link) || !strings.Contains(changed.Text, "2026-09-01 04:34:56 UTC") {
				t.Fatalf("plain-text alternative lost its security details: reset=%q changed=%q", reset.Text, changed.Text)
			}
		})
	}
}

func assertEmailSafeHTML(t *testing.T, value string) {
	t.Helper()
	if !strings.HasPrefix(value, "<!DOCTYPE html>") || !strings.Contains(value, `<table role="presentation" width="600"`) {
		t.Fatal("HTML is not a complete 600px table document")
	}
	for _, forbidden := range []string{"<style", "<script", "<img", "<svg", "src=", "@import", "url("} {
		if strings.Contains(strings.ToLower(value), forbidden) {
			t.Fatalf("HTML contains forbidden external/active content %q", forbidden)
		}
	}
	if !strings.Contains(value, `style="`) || !strings.Contains(value, "#101828") || !strings.Contains(value, "#5B5CE2") || !strings.Contains(value, "#EEF0FF") {
		t.Fatal("HTML is missing the inline security dossier styling")
	}
}

func assertResetMailHTML(t *testing.T, value, text, linkPrefix string) {
	t.Helper()
	assertEmailSafeHTML(t, value)
	if !strings.Contains(value, "PASSWORD RECOVERY") || !strings.Contains(value, "LINK EXPIRY") || !strings.Contains(value, "Did not request this?") || !strings.Contains(value, "Button not working?") {
		t.Fatal("reset HTML is missing the recovery structure")
	}
	if !strings.Contains(text, linkPrefix) {
		t.Fatalf("plain-text reset message is missing %q", linkPrefix)
	}
}

func TestMailDispatcherDiscardsStaleResetAndDoesNotSend(t *testing.T) {
	key := bytes.Repeat([]byte{0x61}, domain.PasswordResetVerifierBytes)
	material, err := domain.NewPasswordResetMaterial(key, bytes.Repeat([]byte{0x17}, domain.PasswordResetSelectorBytes))
	if err != nil {
		t.Fatal(err)
	}
	outbox := &dispatcherOutboxFake{job: &MailJob{
		ID:             "00000000-0000-4000-8000-000000000002",
		Kind:           MailPasswordReset,
		Name:           "Ada",
		Email:          "ada@example.com",
		Locale:         domain.LocaleChinese,
		ResetSelector:  material.Selector,
		VerifierDigest: bytes.Repeat([]byte{0xff}, domain.PasswordResetVerifierBytes),
		CreatedAt:      time.Unix(100, 0),
		ExpiresAt:      time.Now().Add(time.Hour),
	}}
	mailer := &dispatcherMailerFake{}
	dispatcher := NewMailDispatcher(outbox, mailer, &fakeRandom{value: 9}, key, "https://admin.example", time.Second, time.Second, time.Second, time.Minute)
	if err := dispatcher.ProcessOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !outbox.discarded || outbox.errorCode != "invalid_reset" || mailer.message != (OutgoingMail{}) {
		t.Fatalf("stale reset handling = %#v, %#v", outbox, mailer.message)
	}
}

func TestMailDispatcherDiscardsExpiredJobBeforeSMTP(t *testing.T) {
	created := time.Unix(100, 0)
	outbox := &dispatcherOutboxFake{job: &MailJob{
		ID:        "00000000-0000-4000-8000-000000000004",
		Kind:      MailPasswordChanged,
		Name:      "Ada",
		Email:     "ada@example.com",
		Locale:    domain.LocaleEnglish,
		CreatedAt: created,
		ExpiresAt: created.Add(time.Minute),
	}}
	mailer := &dispatcherMailerFake{}
	dispatcher := NewMailDispatcher(outbox, mailer, &fakeRandom{value: 9}, bytes.Repeat([]byte{0x61}, 32), "https://admin.example", time.Second, time.Second, time.Second, time.Minute)
	dispatcher.now = func() time.Time { return created.Add(2 * time.Minute) }

	if err := dispatcher.ProcessOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !outbox.discarded || outbox.errorCode != "expired" || mailer.message != (OutgoingMail{}) {
		t.Fatalf("expired job handling = %#v, %#v", outbox, mailer.message)
	}
}

func TestMailDispatcherDrainsActiveSendAfterShutdown(t *testing.T) {
	job := &MailJob{
		ID:        "00000000-0000-4000-8000-000000000005",
		Kind:      MailPasswordChanged,
		Name:      "Ada",
		Email:     "ada@example.com",
		Locale:    domain.LocaleEnglish,
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(time.Hour),
	}
	outbox := &dispatcherOutboxFake{job: job}
	mailer := &cancellationAwareMailer{started: make(chan struct{}), release: make(chan struct{})}
	dispatcher := NewMailDispatcher(outbox, mailer, &fakeRandom{value: 9}, bytes.Repeat([]byte{0x61}, 32), "https://admin.example", time.Hour, time.Second, time.Second, time.Minute)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		dispatcher.Run(ctx)
		close(done)
	}()
	select {
	case <-mailer.started:
	case <-time.After(time.Second):
		t.Fatal("dispatcher did not start SMTP send")
	}
	cancel()
	close(mailer.release)
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("dispatcher did not drain active send")
	}
	if !outbox.sent || outbox.retried || outbox.dead {
		t.Fatalf("shutdown drain state = %#v", outbox)
	}
}

func TestMailDispatcherRetriesTemporaryAndDeadLettersPermanentFailures(t *testing.T) {
	job := &MailJob{
		ID:        "00000000-0000-4000-8000-000000000003",
		Kind:      MailPasswordChanged,
		Name:      "Ada",
		Email:     "ada@example.com",
		Locale:    domain.LocaleEnglish,
		Attempts:  1,
		CreatedAt: time.Unix(100, 0),
		ExpiresAt: time.Now().Add(time.Hour),
	}
	for _, test := range []struct {
		name      string
		err       error
		wantRetry bool
		wantDead  bool
		wantCode  string
	}{
		{name: "temporary", err: &MailDeliveryError{Code: "temporary", Temporary: true}, wantRetry: true, wantCode: "temporary"},
		{name: "permanent", err: &MailDeliveryError{Code: "permanent", Temporary: false}, wantDead: true, wantCode: "permanent"},
		{name: "unknown failure", err: errors.New("connection failed"), wantDead: true, wantCode: "permanent"},
	} {
		t.Run(test.name, func(t *testing.T) {
			outbox := &dispatcherOutboxFake{job: job}
			mailer := &dispatcherMailerFake{err: test.err}
			dispatcher := NewMailDispatcher(outbox, mailer, &fakeRandom{value: 9}, bytes.Repeat([]byte{0x61}, 32), "https://admin.example", time.Second, time.Second, 5*time.Second, time.Minute)
			if err := dispatcher.ProcessOnce(context.Background()); err != nil {
				t.Fatal(err)
			}
			if outbox.retried != test.wantRetry || outbox.dead != test.wantDead || outbox.errorCode != test.wantCode {
				t.Fatalf("failure state = %#v", outbox)
			}
			if test.wantRetry && (outbox.delay <= 0 || outbox.delay > time.Minute) {
				t.Fatalf("retry delay = %s", outbox.delay)
			}
		})
	}
}

func TestMailDispatcherKeepsZeroJitterFallbackWithinRetryCap(t *testing.T) {
	job := &MailJob{
		ID:        "00000000-0000-4000-8000-000000000006",
		Kind:      MailPasswordChanged,
		Name:      "Ada",
		Email:     "ada@example.com",
		Locale:    domain.LocaleEnglish,
		Attempts:  1,
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(time.Hour),
	}
	outbox := &dispatcherOutboxFake{job: job}
	dispatcher := NewMailDispatcher(outbox, &dispatcherMailerFake{err: &MailDeliveryError{Code: "temporary", Temporary: true}}, &fakeRandom{value: 0}, bytes.Repeat([]byte{0x61}, 32), "https://admin.example", time.Second, time.Second, 5*time.Millisecond, 10*time.Millisecond)

	if err := dispatcher.ProcessOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !outbox.retried || outbox.delay <= 0 || outbox.delay > 10*time.Millisecond {
		t.Fatalf("zero-jitter retry delay = %s, state=%#v", outbox.delay, outbox)
	}
}
