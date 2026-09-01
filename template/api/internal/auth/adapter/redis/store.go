package redis

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strconv"
	"time"

	"example.com/temvia/api/internal/config"
	redisv9 "github.com/redis/go-redis/v9"
)

type Store struct {
	client              *redisv9.Client
	operationTimeout    time.Duration
	idleTimeout         time.Duration
	absoluteTimeout     time.Duration
	globalCapacity      int
	globalRefill        time.Duration
	emailCapacity       int
	emailRefill         time.Duration
	resetGlobalCapacity int
	resetGlobalRefill   time.Duration
	resetEmailCapacity  int
	resetEmailRefill    time.Duration
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
		operationTimeout:    cfg.RedisOperationTimeout,
		idleTimeout:         cfg.SessionIdleTimeout,
		absoluteTimeout:     cfg.SessionAbsoluteTimeout,
		globalCapacity:      cfg.LoginGlobalCapacity,
		globalRefill:        cfg.LoginGlobalRefillInterval,
		emailCapacity:       cfg.LoginEmailCapacity,
		emailRefill:         cfg.LoginEmailRefillInterval,
		resetGlobalCapacity: cfg.PasswordResetGlobalCapacity,
		resetGlobalRefill:   cfg.PasswordResetGlobalRefill,
		resetEmailCapacity:  cfg.PasswordResetEmailCapacity,
		resetEmailRefill:    cfg.PasswordResetEmailRefill,
	}
}

func (s *Store) Close() error { return s.client.Close() }

func (s *Store) Create(ctx context.Context, sessionID, userID string) error {
	return s.CreateVersioned(ctx, sessionID, userID, 1)
}

func (s *Store) CreateVersioned(ctx context.Context, sessionID, userID string, authVersion int64) error {
	if authVersion <= 0 {
		return fmt.Errorf("invalid authentication version")
	}
	key := sessionKey(sessionID)
	operationCtx, cancel := s.operationContext(ctx)
	defer cancel()
	result, err := createSessionScript.Run(operationCtx, s.client, []string{key}, userID, s.idleTimeout.Milliseconds(), s.absoluteTimeout.Milliseconds(), authVersion).Int64()
	if err != nil {
		return err
	}
	if result != 1 {
		return fmt.Errorf("session credential collision")
	}
	return nil
}

func (s *Store) ResolveAndTouch(ctx context.Context, sessionID string) (string, error) {
	userID, _, err := s.resolveAndTouch(ctx, sessionID)
	return userID, err
}

func (s *Store) ResolveAndTouchVersioned(ctx context.Context, sessionID string) (string, int64, error) {
	return s.resolveAndTouch(ctx, sessionID)
}

func (s *Store) resolveAndTouch(ctx context.Context, sessionID string) (string, int64, error) {
	operationCtx, cancel := s.operationContext(ctx)
	defer cancel()
	values, err := resolveSessionScript.Run(operationCtx, s.client, []string{sessionKey(sessionID)}, s.idleTimeout.Milliseconds()).Slice()
	if err != nil {
		return "", 0, err
	}
	if len(values) == 0 || asInt64(values[0]) != 1 || len(values) < 2 {
		return "", 0, nil
	}
	var userID string
	switch value := values[1].(type) {
	case string:
		userID = value
	case []byte:
		userID = string(value)
	default:
		return "", 0, fmt.Errorf("redis returned malformed session value")
	}
	if len(values) < 3 {
		return "", 0, nil
	}
	authVersion := asInt64(values[2])
	if authVersion <= 0 {
		return "", 0, nil
	}
	return userID, authVersion, nil
}

func (s *Store) Delete(ctx context.Context, sessionID string) error {
	operationCtx, cancel := s.operationContext(ctx)
	defer cancel()
	return s.client.Del(operationCtx, sessionKey(sessionID)).Err()
}

func (s *Store) Allow(ctx context.Context, canonicalEmail string) (bool, error) {
	return s.allowBuckets(ctx, canonicalEmail, "login", s.globalCapacity, s.globalRefill, s.emailCapacity, s.emailRefill)
}

func (s *Store) AllowPasswordReset(ctx context.Context, canonicalEmail string) (bool, error) {
	return s.allowBuckets(ctx, canonicalEmail, "password-reset", s.resetGlobalCapacity, s.resetGlobalRefill, s.resetEmailCapacity, s.resetEmailRefill)
}

func (s *Store) allowBuckets(ctx context.Context, canonicalEmail, namespace string, globalCapacity int, globalRefill time.Duration, emailCapacity int, emailRefill time.Duration) (bool, error) {
	globalTTL := bucketTTL(globalCapacity, globalRefill)
	emailTTL := bucketTTL(emailCapacity, emailRefill)
	operationCtx, cancel := s.operationContext(ctx)
	defer cancel()
	result, err := allowLoginScript.Run(operationCtx, s.client, []string{globalLimiterKeyFor(namespace), emailLimiterKeyFor(namespace, canonicalEmail)}, globalCapacity, globalRefill.Milliseconds(), emailCapacity, emailRefill.Milliseconds(), globalTTL.Milliseconds(), emailTTL.Milliseconds()).Int64()
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

func globalLimiterKeyFor(namespace string) string { return "temvia:v1:limit:" + namespace + ":global" }

func emailLimiterKey(canonicalEmail string) string {
	return emailLimiterKeyFor("login", canonicalEmail)
}

func emailLimiterKeyFor(namespace, canonicalEmail string) string {
	sum := sha256.Sum256([]byte(canonicalEmail))
	return "temvia:v1:limit:" + namespace + ":email:" + hex.EncodeToString(sum[:])
}

func asInt64(value interface{}) int64 {
	switch value := value.(type) {
	case int64:
		return value
	case uint64:
		return int64(value)
	case int:
		return int64(value)
	case string:
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err == nil {
			return parsed
		}
	case []byte:
		parsed, err := strconv.ParseInt(string(value), 10, 64)
		if err == nil {
			return parsed
		}
	default:
		return 0
	}
	return 0
}
