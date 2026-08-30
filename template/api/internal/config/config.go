package config

import (
	"fmt"
	"net"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Environment string
	PublicURL   string
	Origin      string
	HTTPAddr    string

	SetupLinkTTL time.Duration

	PostgresHost     string
	PostgresPort     string
	PostgresDatabase string
	PostgresUser     string
	PostgresPassword string
	PostgresSSLMode  string

	DBMaxOpenConns    int
	DBMaxIdleConns    int
	DBConnMaxIdleTime time.Duration
	DBConnMaxLifetime time.Duration

	RedisAddr             string
	RedisPassword         string
	RedisMaxMemory        int64
	RedisContainerMemory  int64
	RedisOperationTimeout time.Duration

	SessionIdleTimeout     time.Duration
	SessionAbsoluteTimeout time.Duration

	PasswordHashMaxConcurrency int

	LoginGlobalCapacity       int
	LoginGlobalRefillInterval time.Duration
	LoginEmailCapacity        int
	LoginEmailRefillInterval  time.Duration

	CookieName            string
	SecureCookie          bool
	WarnInsecurePublicURL bool
}

type Lookup func(string) string

func Load(get Lookup) (Config, error) {
	c := Config{
		Environment:  getDefault(get, "APP_ENV", "development"),
		PublicURL:    getDefault(get, "APP_PUBLIC_URL", "http://localhost:5173"),
		HTTPAddr:     getDefault(get, "HTTP_ADDR", "127.0.0.1:8080"),
		SetupLinkTTL: parseDuration(get, "SETUP_LINK_TTL", 30*time.Minute),

		PostgresHost:     getDefault(get, "POSTGRES_HOST", "localhost"),
		PostgresPort:     getDefault(get, "POSTGRES_PORT", "5432"),
		PostgresDatabase: getDefault(get, "POSTGRES_DB", "temvia"),
		PostgresUser:     getDefault(get, "POSTGRES_USER", "temvia"),
		PostgresPassword: get("POSTGRES_PASSWORD"),
		PostgresSSLMode:  getDefault(get, "POSTGRES_SSLMODE", "disable"),

		DBMaxOpenConns:    parseInt(get, "DB_MAX_OPEN_CONNS", 10),
		DBMaxIdleConns:    parseInt(get, "DB_MAX_IDLE_CONNS", 5),
		DBConnMaxIdleTime: parseDuration(get, "DB_CONN_MAX_IDLE_TIME", 5*time.Minute),
		DBConnMaxLifetime: parseDuration(get, "DB_CONN_MAX_LIFETIME", 0),

		RedisAddr:             getDefault(get, "REDIS_ADDR", "redis:6379"),
		RedisPassword:         get("REDIS_PASSWORD"),
		RedisMaxMemory:        parseBytes(get, "REDIS_MAXMEMORY", 128*1024*1024),
		RedisContainerMemory:  parseBytes(get, "REDIS_CONTAINER_MEMORY_LIMIT", 256*1024*1024),
		RedisOperationTimeout: parseDuration(get, "REDIS_OPERATION_TIMEOUT", time.Second),

		SessionIdleTimeout:     parseDuration(get, "SESSION_IDLE_TIMEOUT", 30*time.Minute),
		SessionAbsoluteTimeout: parseDuration(get, "SESSION_ABSOLUTE_TIMEOUT", 12*time.Hour),

		PasswordHashMaxConcurrency: parseInt(get, "PASSWORD_HASH_MAX_CONCURRENCY", 2),

		LoginGlobalCapacity:       parseInt(get, "LOGIN_RATE_LIMIT_GLOBAL_CAPACITY", 10),
		LoginGlobalRefillInterval: parseDuration(get, "LOGIN_RATE_LIMIT_GLOBAL_REFILL_INTERVAL", 6*time.Second),
		LoginEmailCapacity:        parseInt(get, "LOGIN_RATE_LIMIT_EMAIL_CAPACITY", 5),
		LoginEmailRefillInterval:  parseDuration(get, "LOGIN_RATE_LIMIT_EMAIL_REFILL_INTERVAL", time.Minute),
	}

	if err := c.validate(); err != nil {
		return Config{}, err
	}
	return c, nil
}

func getDefault(get Lookup, key, fallback string) string {
	if value := get(key); value != "" {
		return value
	}
	return fallback
}

func parseDuration(get Lookup, key string, fallback time.Duration) time.Duration {
	value := get(key)
	if value == "" {
		return fallback
	}
	duration, err := time.ParseDuration(value)
	if err != nil {
		return -1
	}
	return duration
}

func parseInt(get Lookup, key string, fallback int) int {
	value := get(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return -1
	}
	return parsed
}

func parseBytes(get Lookup, key string, fallback int64) int64 {
	value := strings.TrimSpace(strings.ToLower(get(key)))
	if value == "" {
		return fallback
	}
	units := []struct {
		suffix string
		factor int64
	}{
		{"gib", 1024 * 1024 * 1024}, {"gb", 1000 * 1000 * 1000}, {"g", 1024 * 1024 * 1024},
		{"mib", 1024 * 1024}, {"mb", 1000 * 1000}, {"m", 1024 * 1024},
		{"kib", 1024}, {"kb", 1000}, {"k", 1024}, {"b", 1},
	}
	for _, unit := range units {
		if !strings.HasSuffix(value, unit.suffix) {
			continue
		}
		number := strings.TrimSpace(strings.TrimSuffix(value, unit.suffix))
		parsed, err := strconv.ParseInt(number, 10, 32)
		if err != nil || parsed <= 0 {
			return -1
		}
		return parsed * unit.factor
	}
	return -1
}

func (c *Config) validate() error {
	if c.Environment != "development" && c.Environment != "production" {
		return fmt.Errorf("APP_ENV must be development or production")
	}
	public, err := parseOriginURL(c.PublicURL, true)
	if err != nil {
		return fmt.Errorf("APP_PUBLIC_URL: %w", err)
	}
	if public.Scheme != "http" && public.Scheme != "https" {
		return fmt.Errorf("APP_PUBLIC_URL must use http or https")
	}
	if c.Environment == "production" && public.Scheme != "https" {
		return fmt.Errorf("APP_PUBLIC_URL must use https in production")
	}
	origin, err := canonicalOrigin(public)
	if err != nil {
		return err
	}
	c.Origin = origin
	c.PublicURL = strings.TrimRight(c.PublicURL, "/")
	c.WarnInsecurePublicURL = c.Environment == "development" && public.Scheme == "http" && !isLoopbackHost(public.Hostname())
	if c.PublicURL == "" {
		return fmt.Errorf("APP_PUBLIC_URL must not be empty")
	}
	if c.SetupLinkTTL <= 0 || c.SetupLinkTTL > 24*time.Hour {
		return fmt.Errorf("SETUP_LINK_TTL must be between 0 and 24h")
	}
	if c.HTTPAddr == "" {
		return fmt.Errorf("HTTP_ADDR must not be empty")
	}
	if c.PostgresHost == "" || c.PostgresPort == "" || c.PostgresDatabase == "" || c.PostgresUser == "" {
		return fmt.Errorf("PostgreSQL host, port, database, and user must not be empty")
	}
	identifier := regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_-]{0,62}$`)
	if !identifier.MatchString(c.PostgresDatabase) || !identifier.MatchString(c.PostgresUser) {
		return fmt.Errorf("POSTGRES_DB and POSTGRES_USER must be conservative ASCII identifiers of at most 63 characters")
	}
	port, err := strconv.Atoi(c.PostgresPort)
	if _, _, splitErr := net.SplitHostPort(net.JoinHostPort(c.PostgresHost, c.PostgresPort)); splitErr != nil || err != nil || port < 1 || port > 65535 {
		return fmt.Errorf("POSTGRES_PORT must be a valid port")
	}
	if c.PostgresPassword == "" {
		return fmt.Errorf("POSTGRES_PASSWORD must not be empty")
	}
	if c.PostgresSSLMode == "" {
		return fmt.Errorf("POSTGRES_SSLMODE must not be empty")
	}
	if c.DBMaxOpenConns <= 0 || c.DBMaxIdleConns < 0 || c.DBMaxIdleConns > c.DBMaxOpenConns || c.DBConnMaxIdleTime < 0 || c.DBConnMaxLifetime < 0 {
		return fmt.Errorf("database pool settings are invalid")
	}
	if c.RedisAddr == "" || c.RedisPassword == "" {
		return fmt.Errorf("REDIS_ADDR and REDIS_PASSWORD must not be empty")
	}
	redisHost, redisPort, redisErr := net.SplitHostPort(c.RedisAddr)
	parsedRedisPort, parsedRedisErr := strconv.Atoi(redisPort)
	if redisErr != nil || redisHost == "" || parsedRedisErr != nil || parsedRedisPort < 1 || parsedRedisPort > 65535 {
		return fmt.Errorf("REDIS_ADDR must be a host and valid port")
	}
	if c.RedisMaxMemory <= 0 || c.RedisContainerMemory <= 0 || c.RedisContainerMemory < c.RedisMaxMemory {
		return fmt.Errorf("Redis memory settings are invalid")
	}
	if c.RedisOperationTimeout < time.Millisecond {
		return fmt.Errorf("REDIS_OPERATION_TIMEOUT must be at least 1ms")
	}
	if c.SessionIdleTimeout < time.Millisecond || c.SessionAbsoluteTimeout < time.Millisecond || c.SessionIdleTimeout >= c.SessionAbsoluteTimeout {
		return fmt.Errorf("session idle timeout must be at least 1ms and less than absolute timeout")
	}
	if c.PasswordHashMaxConcurrency <= 0 {
		return fmt.Errorf("PASSWORD_HASH_MAX_CONCURRENCY must be positive")
	}
	if c.LoginGlobalCapacity <= 0 || c.LoginGlobalRefillInterval < time.Millisecond || c.LoginEmailCapacity <= 0 || c.LoginEmailRefillInterval < time.Millisecond {
		return fmt.Errorf("login rate-limit settings must be positive and intervals at least 1ms")
	}
	if public.Scheme == "https" {
		c.CookieName = "__Host-temvia_session"
		c.SecureCookie = true
	} else {
		c.CookieName = "temvia_session"
	}
	return nil
}

func canonicalOrigin(value *url.URL) (string, error) {
	host := strings.ToLower(value.Hostname())
	if host == "" {
		return "", fmt.Errorf("APP_PUBLIC_URL must include a host")
	}
	port := value.Port()
	if port == "" {
		if value.Scheme == "http" {
			port = "80"
		} else {
			port = "443"
		}
	}
	parsed, err := strconv.Atoi(port)
	if err != nil || parsed < 1 || parsed > 65535 {
		return "", fmt.Errorf("APP_PUBLIC_URL contains an invalid port")
	}
	port = strconv.Itoa(parsed)
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	return value.Scheme + "://" + host + ":" + port, nil
}

// CanonicalOrigin parses an Origin header value into scheme, lowercase host,
// and explicit effective port. It rejects every component an Origin header
// must not carry.
func CanonicalOrigin(raw string) (string, error) {
	value, err := parseOriginURL(raw, false)
	if err != nil {
		return "", err
	}
	return canonicalOrigin(value)
}

func parseOriginURL(raw string, allowRootPath bool) (*url.URL, error) {
	value, err := url.Parse(raw)
	validPath := value != nil && value.Path == ""
	if allowRootPath && value != nil {
		validPath = value.Path == "" || value.Path == "/"
	}
	if err != nil || value == nil || value.Scheme == "" || value.Host == "" || value.User != nil || !validPath || value.RawQuery != "" || value.ForceQuery || value.Fragment != "" || strings.Contains(raw, "#") {
		return nil, fmt.Errorf("must be an absolute origin without credentials, query, fragment, or path")
	}
	if value.Scheme != "http" && value.Scheme != "https" {
		return nil, fmt.Errorf("must use http or https")
	}
	return value, nil
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (c Config) DatabaseDSN() string {
	// pgx's keyword format avoids URL escaping pitfalls for arbitrary passwords.
	return "host=" + quoteDSN(c.PostgresHost) + " port=" + quoteDSN(c.PostgresPort) + " dbname=" + quoteDSN(c.PostgresDatabase) + " user=" + quoteDSN(c.PostgresUser) + " password=" + quoteDSN(c.PostgresPassword) + " sslmode=" + quoteDSN(c.PostgresSSLMode)
}

func quoteDSN(value string) string {
	value = strings.ReplaceAll(value, "\\", "\\\\")
	return "'" + strings.ReplaceAll(value, "'", "\\'") + "'"
}
