package mail

import (
	"context"
	"errors"
	"testing"
	"time"

	"example.com/temvia/api/internal/auth/application"
	"example.com/temvia/api/internal/config"
)

func TestNewSMTPMailerSupportsConfiguredTransportModes(t *testing.T) {
	for _, mode := range []string{"none", "starttls", "tls"} {
		t.Run(mode, func(t *testing.T) {
			mailer, err := NewSMTPMailer(config.Config{
				SMTPHost: "127.0.0.1", SMTPPort: "2525", SMTPSecurity: mode,
				SMTPFromAddress: "no-reply@example.com", SMTPFromName: "Temvia", SMTPTimeout: time.Second,
			})
			if err != nil || mailer == nil {
				t.Fatalf("NewSMTPMailer(%q) = %#v, %v", mode, mailer, err)
			}
		})
	}
	if _, err := NewSMTPMailer(config.Config{SMTPHost: "127.0.0.1", SMTPPort: "2525", SMTPSecurity: "invalid", SMTPTimeout: time.Second}); err == nil {
		t.Fatal("invalid SMTP transport mode accepted")
	}
}

func TestClassifySMTPErrorRedactsProtocolDetails(t *testing.T) {
	err := classifySMTPError(errors.New("535 5.7.8 authentication secret@example.com failed"))
	var delivery *application.MailDeliveryError
	if !errors.As(err, &delivery) || !delivery.Temporary || delivery.Code != "temporary" {
		t.Fatalf("classified error = %#v, %v", delivery, err)
	}
	if errors.Is(err, context.Canceled) || err.Error() != "mail delivery temporary" {
		t.Fatalf("classified error leaked details: %v", err)
	}
}
