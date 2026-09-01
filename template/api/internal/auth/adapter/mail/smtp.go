package mail

import (
	"context"
	"errors"
	stdmail "net/mail"
	"strconv"

	"example.com/temvia/api/internal/auth/application"
	"example.com/temvia/api/internal/config"
	gomail "github.com/wneessen/go-mail"
)

type SMTPMailer struct {
	client      *gomail.Client
	fromAddress string
	fromName    string
}

func NewSMTPMailer(cfg config.Config) (*SMTPMailer, error) {
	port, err := strconv.Atoi(cfg.SMTPPort)
	if err != nil {
		return nil, err
	}
	options := []gomail.Option{gomail.WithPort(port), gomail.WithTimeout(cfg.SMTPTimeout)}
	switch cfg.SMTPSecurity {
	case "none":
		options = append(options, gomail.WithTLSPolicy(gomail.NoTLS))
	case "starttls":
		options = append(options, gomail.WithTLSPolicy(gomail.TLSMandatory))
	case "tls":
		options = append(options, gomail.WithSSL())
	default:
		return nil, errors.New("unsupported SMTP security mode")
	}
	if cfg.SMTPUsername != "" || cfg.SMTPPassword != "" {
		options = append(options, gomail.WithSMTPAuth(gomail.SMTPAuthPlain), gomail.WithUsername(cfg.SMTPUsername), gomail.WithPassword(cfg.SMTPPassword))
	}
	client, err := gomail.NewClient(cfg.SMTPHost, options...)
	if err != nil {
		return nil, err
	}
	return &SMTPMailer{client: client, fromAddress: cfg.SMTPFromAddress, fromName: cfg.SMTPFromName}, nil
}

func (m *SMTPMailer) Send(ctx context.Context, outgoing application.OutgoingMail) error {
	message := gomail.NewMsg()
	message.FromMailAddress(&stdmail.Address{Name: m.fromName, Address: m.fromAddress})
	message.ToMailAddress(&stdmail.Address{Name: outgoing.Name, Address: outgoing.To})
	message.Subject(outgoing.Subject)
	message.SetMessageIDWithValue(outgoing.MessageID)
	message.SetBodyString(gomail.TypeTextPlain, outgoing.Text)
	message.AddAlternativeString(gomail.TypeTextHTML, outgoing.HTML)
	if err := m.client.DialAndSendWithContext(ctx, message); err != nil {
		return classifySMTPError(err)
	}
	return nil
}

func classifySMTPError(err error) error {
	var sendErr *gomail.SendError
	if errors.As(err, &sendErr) {
		code := sendErr.ErrorCode()
		if code >= 400 && code < 500 {
			return &application.MailDeliveryError{Code: "temporary", Temporary: true}
		}
		if code >= 500 && code < 600 {
			return &application.MailDeliveryError{Code: "permanent", Temporary: false}
		}
	}
	// Connection, context, and protocol failures without a reply code are
	// retried by the bounded outbox policy. The original SMTP text is never
	// retained or returned to an HTTP caller.
	return &application.MailDeliveryError{Code: "temporary", Temporary: true}
}

var _ application.Mailer = (*SMTPMailer)(nil)
