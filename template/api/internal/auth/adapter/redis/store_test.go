package redis

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"strings"
	"testing"
	"time"
)

func TestSessionKeyHashesRawCredential(t *testing.T) {
	raw := []byte(strings.Repeat("x", 32))
	credential := base64.RawURLEncoding.EncodeToString(raw)
	sum := sha256.Sum256(raw)
	want := "temvia:v1:session:" + hex.EncodeToString(sum[:])
	if got := sessionKey(credential); got != want {
		t.Fatalf("sessionKey() = %q, want %q", got, want)
	}
	if strings.Contains(sessionKey(credential), credential) {
		t.Fatal("session key contains raw credential")
	}
}

func TestBucketTTLLeavesFiniteStateLifetime(t *testing.T) {
	if got, want := bucketTTL(10, 6*time.Second), 66*time.Second; got != want {
		t.Fatalf("bucketTTL() = %s, want %s", got, want)
	}
}
