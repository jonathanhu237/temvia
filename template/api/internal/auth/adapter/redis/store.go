package redis

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"time"

	"example.com/temvia/api/internal/config"
	redisv9 "github.com/redis/go-redis/v9"
)

type Store struct {
	client           *redisv9.Client
	operationTimeout time.Duration
	idleTimeout      time.Duration
	absoluteTimeout  time.Duration
	globalCapacity   int
	globalRefill     time.Duration
	emailCapacity    int
	emailRefill      time.Duration
}

func NewStore(cfg config.Config) *Store {
	return &Store{
		client: redisv9.NewClient(&redisv9.Options{
			Addr:         cfg.RedisAddr,
			Password:     cfg.RedisPassword,
			DB:           0,
			MaxRetries:   1,
			DialTimeout:  cfg.RedisOperationTimeout,
			ReadTimeout:  cfg.RedisOperationTimeout,
			WriteTimeout: cfg.RedisOperationTimeout,
		}),
		operationTimeout: cfg.RedisOperationTimeout,
		idleTimeout:      cfg.SessionIdleTimeout,
		absoluteTimeout:  cfg.SessionAbsoluteTimeout,
		globalCapacity:   cfg.LoginGlobalCapacity,
		globalRefill:     cfg.LoginGlobalRefillInterval,
		emailCapacity:    cfg.LoginEmailCapacity,
		emailRefill:      cfg.LoginEmailRefillInterval,
	}
}

func (s *Store) Close() error { return s.client.Close() }

func (s *Store) Create(ctx context.Context, sessionID, userID string) error {
	key := sessionKey(sessionID)
	operationCtx, cancel := s.operationContext(ctx)
	defer cancel()
	result, err := createSessionScript.Run(operationCtx, s.client, []string{key}, userID, s.idleTimeout.Milliseconds(), s.absoluteTimeout.Milliseconds()).Int64()
	if err != nil {
		return err
	}
	if result != 1 {
		return fmt.Errorf("session credential collision")
	}
	return nil
}

func (s *Store) ResolveAndTouch(ctx context.Context, sessionID string) (string, error) {
	operationCtx, cancel := s.operationContext(ctx)
	defer cancel()
	values, err := resolveSessionScript.Run(operationCtx, s.client, []string{sessionKey(sessionID)}, s.idleTimeout.Milliseconds()).Slice()
	if err != nil {
		return "", err
	}
	if len(values) == 0 || asInt64(values[0]) != 1 || len(values) < 2 {
		return "", nil
	}
	var userID string
	switch value := values[1].(type) {
	case string:
		userID = value
	case []byte:
		userID = string(value)
	default:
		return "", fmt.Errorf("redis returned malformed session value")
	}
	return userID, nil
}

func (s *Store) Delete(ctx context.Context, sessionID string) error {
	operationCtx, cancel := s.operationContext(ctx)
	defer cancel()
	return s.client.Del(operationCtx, sessionKey(sessionID)).Err()
}

func (s *Store) Allow(ctx context.Context, canonicalEmail string) (bool, error) {
	globalTTL := bucketTTL(s.globalCapacity, s.globalRefill)
	emailTTL := bucketTTL(s.emailCapacity, s.emailRefill)
	operationCtx, cancel := s.operationContext(ctx)
	defer cancel()
	result, err := allowLoginScript.Run(operationCtx, s.client, []string{globalLimiterKey(), emailLimiterKey(canonicalEmail)}, s.globalCapacity, s.globalRefill.Milliseconds(), s.emailCapacity, s.emailRefill.Milliseconds(), globalTTL.Milliseconds(), emailTTL.Milliseconds()).Int64()
	if err != nil {
		return false, err
	}
	return result == 1, nil
}

func (s *Store) ResetEmail(ctx context.Context, canonicalEmail string) error {
	operationCtx, cancel := s.operationContext(ctx)
	defer cancel()
	return s.client.Del(operationCtx, emailLimiterKey(canonicalEmail)).Err()
}

func (s *Store) operationContext(parent context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(parent, s.operationTimeout)
}

func bucketTTL(capacity int, refill time.Duration) time.Duration {
	return time.Duration(capacity+1) * refill
}

func sessionKey(sessionID string) string {
	raw, err := base64.RawURLEncoding.DecodeString(sessionID)
	if err != nil {
		raw = []byte(sessionID)
	}
	sum := sha256.Sum256(raw)
	return "temvia:v1:session:" + hex.EncodeToString(sum[:])
}

func globalLimiterKey() string { return "temvia:v1:limit:login:global" }

func emailLimiterKey(canonicalEmail string) string {
	sum := sha256.Sum256([]byte(canonicalEmail))
	return "temvia:v1:limit:login:email:" + hex.EncodeToString(sum[:])
}

func asInt64(value interface{}) int64 {
	switch value := value.(type) {
	case int64:
		return value
	case uint64:
		return int64(value)
	case int:
		return int64(value)
	default:
		return 0
	}
}
