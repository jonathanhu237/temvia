package domain

import "testing"

func TestName(t *testing.T) {
	got, err := NewName(" \u0065\u0301  Ada  ")
	if err != nil || got != "é  Ada" {
		t.Fatalf("NewName() = %q, %v", got, err)
	}
	for _, value := range []string{"", "\nname", "\u2028name"} {
		if _, err := NewName(value); err == nil {
			t.Errorf("NewName(%q) accepted invalid value", value)
		}
	}
}

func TestEmail(t *testing.T) {
	got, err := NewEmail(" Ada.Example+tag@Example.COM ")
	if err != nil || got.Display != "Ada.Example+tag@Example.COM" || got.Canonical != "ada.example+tag@example.com" {
		t.Fatalf("NewEmail() = %#v, %v", got, err)
	}
	for _, value := range []string{"a..b@example.com", "a@example..com", "Ada <a@example.com>", "a@-example.com", "é@example.com"} {
		if _, err := NewEmail(value); err == nil {
			t.Errorf("NewEmail(%q) accepted invalid value", value)
		}
	}
}

func TestPassword(t *testing.T) {
	got, err := NewPassword("12345678901234e\u0301")
	if err != nil || got != "12345678901234é" {
		t.Fatalf("NewPassword() = %q, %v", got, err)
	}
	for _, value := range []string{"short", "123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789"} {
		if _, err := NewPassword(value); err == nil {
			t.Errorf("NewPassword(%q) accepted invalid value", value)
		}
	}
}
