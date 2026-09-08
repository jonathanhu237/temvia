package redis

import (
	"context"
	"example.com/temvia/api/internal/config"
	"os"
	"testing"
	"time"
)

func TestOnlineSessionsIntegration(t *testing.T) {
	addr, password := os.Getenv("TEST_REDIS_ADDR"), os.Getenv("TEST_REDIS_PASSWORD")
	if addr == "" || password == "" {
		t.Skip("isolated test Redis required")
	}
	s := NewStore(config.Config{RedisAddr: addr, RedisPassword: password, RedisOperationTimeout: time.Second, SessionIdleTimeout: time.Hour, SessionAbsoluteTimeout: 2 * time.Hour})
	defer s.Close()
	ctx := context.Background()
	defer deleteIntegrationKeys(ctx, s)
	deleteIntegrationKeys(ctx, s)
	for _, id := range []string{"fresh", "stale", "logout"} {
		if err := s.CreateVersioned(ctx, id, "alice", 2); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.client.HSet(ctx, sessionKey("stale"), sessionLastSeenAt, time.Now().Add(-6*time.Minute).UnixMilli()).Err(); err != nil {
		t.Fatal(err)
	}
	if err := s.Delete(ctx, "logout"); err != nil {
		t.Fatal(err)
	}
	before, err := s.client.HGet(ctx, sessionKey("fresh"), sessionLastSeenAt).Result()
	if err != nil {
		t.Fatal(err)
	}
	items, err := s.ValidSessions(ctx)
	if err != nil || len(items) != 2 || items[0].UserID != "alice" || items[0].AuthVersion != 2 || items[1].UserID != "alice" || items[1].AuthVersion != 2 {
		t.Fatalf("items=%+v err=%v", items, err)
	}
	after, _ := s.client.HGet(ctx, sessionKey("fresh"), sessionLastSeenAt).Result()
	if before != after {
		t.Fatal("listing touched session")
	}
	if userID, version, err := s.ResolveVersioned(ctx, "fresh"); err != nil || userID != "alice" || version != 2 {
		t.Fatalf("read-only resolution = %q, %d, %v", userID, version, err)
	}
	if latest, _ := s.client.HGet(ctx, sessionKey("fresh"), sessionLastSeenAt).Result(); latest != after {
		t.Fatal("read-only resolution touched session")
	}
}
