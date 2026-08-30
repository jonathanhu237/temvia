package redis

import "github.com/redis/go-redis/v9"

const (
	sessionUserID     = "user_id"
	sessionCreatedAt  = "created_at_ms"
	sessionLastSeenAt = "last_seen_at_ms"
	sessionAbsoluteAt = "absolute_expires_at_ms"
)

var createSessionScript = redis.NewScript(`
local key = KEYS[1]
if redis.call('EXISTS', key) == 1 then
  return 0
end
local nowParts = redis.call('TIME')
local now = (tonumber(nowParts[1]) * 1000) + math.floor(tonumber(nowParts[2]) / 1000)
local idle = tonumber(ARGV[2])
local absolute = now + tonumber(ARGV[3])
local expires = math.min(now + idle, absolute)
redis.call('HSET', key,
  'user_id', ARGV[1],
  'created_at_ms', now,
  'last_seen_at_ms', now,
  'absolute_expires_at_ms', absolute)
redis.call('PEXPIREAT', key, expires)
return 1
`)

var resolveSessionScript = redis.NewScript(`
local key = KEYS[1]
if redis.call('EXISTS', key) == 0 then
  return {0}
end
local values = redis.call('HMGET', key, 'user_id', 'absolute_expires_at_ms')
if not values[1] or not values[2] then
  redis.call('DEL', key)
  return {0}
end
local nowParts = redis.call('TIME')
local now = (tonumber(nowParts[1]) * 1000) + math.floor(tonumber(nowParts[2]) / 1000)
local absolute = tonumber(values[2])
if now >= absolute then
  redis.call('DEL', key)
  return {0}
end
local idleExpires = now + tonumber(ARGV[1])
local expires = math.min(idleExpires, absolute)
redis.call('HSET', key, 'last_seen_at_ms', now)
redis.call('PEXPIREAT', key, expires)
return {1, values[1]}
`)

var allowLoginScript = redis.NewScript(`
local nowParts = redis.call('TIME')
local now = (tonumber(nowParts[1]) * 1000) + math.floor(tonumber(nowParts[2]) / 1000)

local function readState(key, capacity, interval)
  local values = redis.call('HMGET', key, 'tokens', 'last_refill_ms')
  local tokens = tonumber(values[1])
  local last = tonumber(values[2])
  if not tokens or not last then
    tokens = capacity
    last = now
  else
    local elapsed = now - last
    if elapsed >= interval then
      local additions = math.floor(elapsed / interval)
      tokens = math.min(capacity, tokens + additions)
      last = last + additions * interval
    end
  end
  return {tokens, last}
end

local global = readState(KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]))
local email = readState(KEYS[2], tonumber(ARGV[3]), tonumber(ARGV[4]))
local allowed = global[1] >= 1 and email[1] >= 1

if allowed then
  global[1] = global[1] - 1
  email[1] = email[1] - 1
end

redis.call('HSET', KEYS[1], 'tokens', global[1], 'last_refill_ms', global[2])
redis.call('HSET', KEYS[2], 'tokens', email[1], 'last_refill_ms', email[2])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[5]))
redis.call('PEXPIRE', KEYS[2], tonumber(ARGV[6]))
if allowed then return 1 else return 0 end
`)
