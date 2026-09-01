package config

import (
	"testing"
	"time"
)

func env(values map[string]string) Lookup {
	return func(key string) string { return values[key] }
}

func TestLoadDefaultsAndModes(t *testing.T) {
	values := map[string]string{"POSTGRES_PASSWORD": "pg-secret", "REDIS_PASSWORD": "redis-secret", "PASSWORD_RESET_TOKEN_KEY": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}
	c, err := Load(env(values))
	if err != nil {
		t.Fatal(err)
	}
	if c.CookieName != "temvia_session" || c.SecureCookie || c.Origin != "http://localhost:5173" {
		t.Fatalf("development config = %#v", c)
	}
	values["APP_PUBLIC_URL"] = "http://LOCALHOST:05173/"
	c, err = Load(env(values))
	if err != nil || c.PublicURL != "http://LOCALHOST:05173" || c.Origin != "http://localhost:5173" {
		t.Fatalf("normalized development URL = %#v, %v", c, err)
	}
	values["APP_PUBLIC_URL"] = "http://192.0.2.10:5173"
	c, err = Load(env(values))
	if err != nil || !c.WarnInsecurePublicURL {
		t.Fatalf("non-loopback development warning = %t, %v", c.WarnInsecurePublicURL, err)
	}
	values["APP_ENV"] = "production"
	values["APP_PUBLIC_URL"] = "https://example.com"
	values["SMTP_TLS_MODE"] = "starttls"
	values["MAIL_FROM_ADDRESS"] = "no-reply@example.com"
	c, err = Load(env(values))
	if err != nil {
		t.Fatal(err)
	}
	if c.CookieName != "__Host-temvia_session" || !c.SecureCookie {
		t.Fatalf("production cookie config = %#v", c)
	}
}

func TestLoadRejectsInvalidConfiguration(t *testing.T) {
	base := map[string]string{"POSTGRES_PASSWORD": "pg-secret", "REDIS_PASSWORD": "redis-secret", "PASSWORD_RESET_TOKEN_KEY": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}
	for name, change := range map[string]func(map[string]string){
		"missing postgres secret": func(v map[string]string) { delete(v, "POSTGRES_PASSWORD") },
		"missing redis secret":    func(v map[string]string) { delete(v, "REDIS_PASSWORD") },
		"production http":         func(v map[string]string) { v["APP_ENV"] = "production" },
		"bad duration":            func(v map[string]string) { v["SETUP_LINK_TTL"] = "nope" },
		"idle after absolute":     func(v map[string]string) { v["SESSION_IDLE_TIMEOUT"] = "13h" },
		"idle pool above open":    func(v map[string]string) { v["DB_MAX_IDLE_CONNS"] = "11" },
		"bad port":                func(v map[string]string) { v["POSTGRES_PORT"] = "postgres" },
		"bad redis address":       func(v map[string]string) { v["REDIS_ADDR"] = "redis" },
		"container below redis":   func(v map[string]string) { v["REDIS_CONTAINER_MEMORY_LIMIT"] = "64mb" },
		"unsafe database name":    func(v map[string]string) { v["POSTGRES_DB"] = "database/name" },
		"unsafe database user":    func(v map[string]string) { v["POSTGRES_USER"] = "user@example" },
	} {
		t.Run(name, func(t *testing.T) {
			values := map[string]string{}
			for key, value := range base {
				values[key] = value
			}
			change(values)
			if _, err := Load(env(values)); err == nil {
				t.Fatal("Load accepted invalid configuration")
			}
		})
	}
}

func TestLoadPasswordRecoveryAndSMTPInventory(t *testing.T) {
	values := map[string]string{
		"POSTGRES_PASSWORD":                "pg-secret",
		"REDIS_PASSWORD":                   "redis-secret",
		"PASSWORD_RESET_TOKEN_KEY":         "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
		"PASSWORD_RESET_MIN_RESPONSE_TIME": "250ms",
		"SMTP_TLS_MODE":                    "starttls",
		"SMTP_DELIVERY_TIMEOUT":            "5s",
		"MAIL_OUTBOX_LEASE_TTL":            "10s",
		"MAIL_FROM_ADDRESS":                "security@example.com",
	}
	c, err := Load(env(values))
	if err != nil {
		t.Fatal(err)
	}
	if c.PasswordResetResponseMin != 250*time.Millisecond || c.SMTPTimeout != 5*time.Second || c.MailOutboxLeaseDuration != 10*time.Second || c.SMTPFromAddress != "security@example.com" {
		t.Fatalf("loaded recovery config = %#v", c)
	}
	for key, value := range map[string]string{
		"PASSWORD_RESET_TOKEN_KEY": "not-base64",
		"SMTP_TLS_MODE":            "none",
		"MAIL_FROM_ADDRESS":        "bad\r\n@example.com",
	} {
		copyValues := map[string]string{}
		for name, original := range values {
			copyValues[name] = original
		}
		copyValues[key] = value
		if key == "SMTP_TLS_MODE" {
			copyValues["APP_ENV"] = "production"
		}
		if _, err := Load(env(copyValues)); err == nil {
			t.Errorf("Load accepted invalid %s=%q", key, value)
		}
	}
	values["APP_ENV"] = "production"
	values["APP_PUBLIC_URL"] = "https://example.com"
	values["SMTP_TLS_MODE"] = "starttls"
	values["MAIL_FROM_ADDRESS"] = "no-reply@example.com"
	if _, err := Load(env(values)); err != nil {
		t.Fatalf("production SMTP config rejected: %v", err)
	}
	values["MAIL_FROM_ADDRESS"] = "no-reply@temvia.test"
	if _, err := Load(env(values)); err == nil {
		t.Fatal("production reserved .test sender accepted")
	}
	values["MAIL_FROM_ADDRESS"] = "no-reply@example.com"
	values["MAIL_OUTBOX_LEASE_TTL"] = "5s"
	if _, err := Load(env(values)); err == nil {
		t.Fatal("outbox lease shorter than delivery timeout accepted")
	}
}

func TestCanonicalOrigin(t *testing.T) {
	for input, want := range map[string]string{
		"http://LOCALHOST:05173": "http://localhost:5173",
		"https://example.com":    "https://example.com:443",
		"http://[::1]:8080":      "http://[::1]:8080",
	} {
		got, err := CanonicalOrigin(input)
		if err != nil || got != want {
			t.Errorf("CanonicalOrigin(%q) = %q, %v; want %q", input, got, err, want)
		}
	}
	for _, input := range []string{"null", "ftp://example.com", "https://example.com/", "https://example.com?", "https://example.com#", "https://user@example.com"} {
		if _, err := CanonicalOrigin(input); err == nil {
			t.Errorf("CanonicalOrigin(%q) accepted invalid Origin", input)
		}
	}
}
