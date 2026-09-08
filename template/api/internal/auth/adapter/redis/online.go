package redis

import (
	"context"
	"time"

	"example.com/temvia/api/internal/auth/application"
	redisv9 "github.com/redis/go-redis/v9"
)

// ValidSessions reads without touching activity or expiry. SCAN also includes
// sessions created before online-user management was installed.
func (s *Store) ValidSessions(ctx context.Context) ([]application.SessionActivity, error) {
	ctx, cancel := s.operationContext(ctx)
	defer cancel()
	now, err := s.client.Time(ctx).Result()
	if err != nil {
		return nil, err
	}
	result := make([]application.SessionActivity, 0)
	seen := make(map[string]bool)
	var cursor uint64
	for {
		keys, next, err := s.client.Scan(ctx, cursor, "temvia:v1:session:*", 200).Result()
		if err != nil {
			return nil, err
		}
		pipe := s.client.Pipeline()
		commands := make([]*redisv9.SliceCmd, 0, len(keys))
		for _, key := range keys {
			if seen[key] {
				continue
			}
			seen[key] = true
			commands = append(commands, pipe.HMGet(ctx, key, sessionUserID, sessionAuthVersion, sessionLastSeenAt, sessionAbsoluteAt))
		}
		if len(commands) > 0 {
			if _, err := pipe.Exec(ctx); err != nil {
				return nil, err
			}
		}
		for _, command := range commands {
			values, err := command.Result()
			if err != nil {
				return nil, err
			}
			id, _ := values[0].(string)
			version, last, absolute := asInt64(values[1]), asInt64(values[2]), asInt64(values[3])
			if id == "" || version <= 0 || last <= 0 || absolute <= now.UnixMilli() {
				continue
			}
			result = append(result, application.SessionActivity{UserID: id, AuthVersion: version, LastSeenAt: time.UnixMilli(last).UTC()})
		}
		cursor = next
		if cursor == 0 {
			return result, nil
		}
	}
}
