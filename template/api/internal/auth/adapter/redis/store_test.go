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

func TestAsInt64ParsesRedisBulkStrings(t *testing.T) {
	for _, value := range []interface{}{"7", []byte("8")} {
		if got := asInt64(value); got <= 0 {
			t.Fatalf("asInt64(%T) = %d, want positive version", value, got)
		}
	}
	if got := asInt64("not-a-number"); got != 0 {
		t.Fatalf("asInt64(malformed) = %d, want 0", got)
	}
}
