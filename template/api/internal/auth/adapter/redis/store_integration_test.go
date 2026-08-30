package redis

import (
	"context"
	"encoding/base64"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"example.com/temvia/api/internal/config"
)

func TestStoreIntegrationSessionsAndLimiter(t *testing.T) {
	addr := os.Getenv("TEST_REDIS_ADDR")
	password := os.Getenv("TEST_REDIS_PASSWORD")
	if addr == "" || password == "" {
		t.Skip("TEST_REDIS_ADDR and TEST_REDIS_PASSWORD are not set")
	}
	store := NewStore(config.Config{
		RedisAddr:                 addr,
		RedisPassword:             password,
		RedisOperationTimeout:     time.Second,
		SessionIdleTimeout:        150 * time.Millisecond,
		SessionAbsoluteTimeout:    2 * time.Second,
		LoginGlobalCapacity:       1,
		LoginGlobalRefillInterval: time.Hour,
		LoginEmailCapacity:        1,
		LoginEmailRefillInterval:  time.Hour,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := store.client.Ping(ctx).Err(); err != nil {
		_ = store.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		deleteIntegrationKeys(cleanupCtx, store)
		_ = store.Close()
	})
	deleteIntegrationKeys(ctx, store)

	credential := base64.RawURLEncoding.EncodeToString([]byte(strings.Repeat("s", 32)))
	if err := store.Create(ctx, credential, "user-1"); err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if userID, err := store.ResolveAndTouch(ctx, credential); err != nil || userID != "user-1" {
		t.Fatalf("ResolveAndTouch() = %q, %v", userID, err)
	}
	time.Sleep(200 * time.Millisecond)
	if userID, err := store.ResolveAndTouch(ctx, credential); err != nil || userID != "" {
		t.Fatalf("ResolveAndTouch(expired) = %q, %v", userID, err)
	}

	const email = "ada@example.com"
	if allowed, err := store.Allow(ctx, email); err != nil || !allowed {
		t.Fatalf("Allow(first) = %t, %v", allowed, err)
	}
	if allowed, err := store.Allow(ctx, email); err != nil || allowed {
		t.Fatalf("Allow(second) = %t, %v", allowed, err)
	}
	keys, err := store.client.Keys(ctx, "temvia:v1:*").Result()
	if err != nil {
		t.Fatal(err)
	}
	if len(keys) == 0 {
		t.Fatal("integration flow created no Redis keys")
	}
	for _, key := range keys {
		if strings.Contains(key, email) {
			t.Fatalf("Redis key contains plaintext email: %s", key)
		}
		if ttl, err := store.client.PTTL(ctx, key).Result(); err != nil || ttl <= 0 {
			t.Fatalf("key %s TTL = %s, %v", key, ttl, err)
		}
	}
}

func TestStoreIntegrationAbsoluteExpiryDeleteRaceAndLimiterConcurrency(t *testing.T) {
	addr := os.Getenv("TEST_REDIS_ADDR")
	password := os.Getenv("TEST_REDIS_PASSWORD")
	if addr == "" || password == "" {
		t.Skip("TEST_REDIS_ADDR and TEST_REDIS_PASSWORD are not set")
	}
	store := NewStore(config.Config{
		RedisAddr:                 addr,
		RedisPassword:             password,
		RedisOperationTimeout:     time.Second,
		SessionIdleTimeout:        120 * time.Millisecond,
		SessionAbsoluteTimeout:    350 * time.Millisecond,
		LoginGlobalCapacity:       5,
		LoginGlobalRefillInterval: 300 * time.Millisecond,
		LoginEmailCapacity:        5,
		LoginEmailRefillInterval:  300 * time.Millisecond,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := store.client.Ping(ctx).Err(); err != nil {
		_ = store.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		deleteIntegrationKeys(cleanupCtx, store)
		_ = store.Close()
	})
	deleteIntegrationKeys(ctx, store)

	absoluteCredential := base64.RawURLEncoding.EncodeToString([]byte(strings.Repeat("a", 32)))
	if err := store.Create(ctx, absoluteCredential, "user-absolute"); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		time.Sleep(100 * time.Millisecond)
		if userID, err := store.ResolveAndTouch(ctx, absoluteCredential); err != nil || userID != "user-absolute" {
			t.Fatalf("ResolveAndTouch(before absolute expiry) = %q, %v", userID, err)
		}
	}
	time.Sleep(170 * time.Millisecond)
	if userID, err := store.ResolveAndTouch(ctx, absoluteCredential); err != nil || userID != "" {
		t.Fatalf("ResolveAndTouch(after absolute expiry) = %q, %v", userID, err)
	}

	raceCredential := base64.RawURLEncoding.EncodeToString([]byte(strings.Repeat("r", 32)))
	if err := store.Create(ctx, raceCredential, "user-race"); err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	errorsFromRace := make(chan error, 2)
	var race sync.WaitGroup
	race.Add(2)
	go func() {
		defer race.Done()
		<-start
		_, err := store.ResolveAndTouch(ctx, raceCredential)
		errorsFromRace <- err
	}()
	go func() {
		defer race.Done()
		<-start
		errorsFromRace <- store.Delete(ctx, raceCredential)
	}()
	close(start)
	race.Wait()
	close(errorsFromRace)
	for err := range errorsFromRace {
		if err != nil {
			t.Fatalf("delete/touch race error = %v", err)
		}
	}
	if userID, err := store.ResolveAndTouch(ctx, raceCredential); err != nil || userID != "" {
		t.Fatalf("ResolveAndTouch(after delete race) = %q, %v", userID, err)
	}

	const attempts = 20
	var allowed atomic.Int32
	errorsFromLimiter := make(chan error, attempts)
	start = make(chan struct{})
	var limiter sync.WaitGroup
	for range attempts {
		limiter.Add(1)
		go func() {
			defer limiter.Done()
			<-start
			ok, err := store.Allow(ctx, "concurrent@example.com")
			if err != nil {
				errorsFromLimiter <- err
				return
			}
			if ok {
				allowed.Add(1)
			}
		}()
	}
	close(start)
	limiter.Wait()
	close(errorsFromLimiter)
	for err := range errorsFromLimiter {
		t.Fatalf("concurrent limiter error = %v", err)
	}
	if got := allowed.Load(); got != 5 {
		t.Fatalf("concurrent limiter allowed = %d, want 5", got)
	}
	time.Sleep(350 * time.Millisecond)
	if ok, err := store.Allow(ctx, "concurrent@example.com"); err != nil || !ok {
		t.Fatalf("Allow(after refill) = %t, %v", ok, err)
	}
}

func deleteIntegrationKeys(ctx context.Context, store *Store) {
	var cursor uint64
	for {
		keys, next, err := store.client.Scan(ctx, cursor, "temvia:v1:*", 100).Result()
		if err != nil {
			return
		}
		if len(keys) > 0 {
			_ = store.client.Del(ctx, keys...).Err()
		}
		cursor = next
		if cursor == 0 {
			return
		}
	}
}
