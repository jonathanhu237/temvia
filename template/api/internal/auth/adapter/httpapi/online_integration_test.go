package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"example.com/temvia/api/internal/auth/adapter/password"
	postgresadapter "example.com/temvia/api/internal/auth/adapter/postgres"
	redisadapter "example.com/temvia/api/internal/auth/adapter/redis"
	"example.com/temvia/api/internal/auth/application"
	"example.com/temvia/api/internal/auth/domain"
	_ "github.com/jackc/pgx/v5/stdlib"
)

// TestOnlineHTTPIntegration exercises the real authentication application,
// PostgreSQL account/version authority, Redis session store, HTTP handlers,
// and operation log persistence through one request boundary. It is gated so
// the normal unit suite stays self-contained; run it with a disposable
// migrated database and Redis instance.
func TestOnlineHTTPIntegration(t *testing.T) {
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	redisAddr := os.Getenv("TEST_REDIS_ADDR")
	redisPassword := os.Getenv("TEST_REDIS_PASSWORD")
	if dsn == "" || redisAddr == "" || redisPassword == "" {
		t.Skip("isolated PostgreSQL and Redis are required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.PingContext(ctx); err != nil {
		t.Fatal(err)
	}

	cfg := testConfig()
	cfg.RedisAddr = redisAddr
	cfg.RedisPassword = redisPassword
	cfg.RedisOperationTimeout = time.Second
	cfg.SessionIdleTimeout = time.Hour
	cfg.SessionAbsoluteTimeout = 2 * time.Hour
	cfg.LoginGlobalCapacity = 100
	cfg.LoginGlobalRefillInterval = time.Millisecond
	cfg.LoginEmailCapacity = 100
	cfg.LoginEmailRefillInterval = time.Millisecond
	sessions := redisadapter.NewStore(cfg)
	t.Cleanup(func() { _ = sessions.Close() })

	hasher, err := password.NewHasher(2)
	if err != nil {
		t.Fatal(err)
	}
	accounts := postgresadapter.NewStore(db)
	fixture := createOnlineHTTPFixture(t, ctx, db, hasher)
	var sessionCookies []*http.Cookie
	t.Cleanup(func() {
		if err := cleanupOnlineHTTPFixture(db, sessions, fixture, sessionCookies); err != nil {
			t.Errorf("clean online HTTP fixture: %v", err)
		}
	})

	auth := application.NewAuthentication(accounts, hasher, sessions, sessions, application.CryptoRandom(), domain.DefaultPermissionCatalog())
	operationLogs := application.NewOperationLogService(accounts)
	handler := NewHandlerWithAccessAndOperationLog(
		&setupFake{status: application.SetupComplete},
		auth,
		cfg,
		nil,
		nil,
		nil,
		nil,
		operationLogs,
	)

	managerCookie := loginOnlineHTTPUser(t, handler, fixture.managerEmail, fixture.managerPassword)
	sessionCookies = append(sessionCookies, managerCookie)
	targetCookieA := loginOnlineHTTPUser(t, handler, fixture.targetEmail, fixture.targetPassword)
	sessionCookies = append(sessionCookies, targetCookieA)
	targetCookieB := loginOnlineHTTPUser(t, handler, fixture.targetEmail, fixture.targetPassword)
	sessionCookies = append(sessionCookies, targetCookieB)
	otherCookie := loginOnlineHTTPUser(t, handler, fixture.otherEmail, fixture.otherPassword)
	sessionCookies = append(sessionCookies, otherCookie)

	users := onlineHTTPList(t, handler, managerCookie)
	target := findOnlineHTTPUser(t, users, fixture.targetID)
	if target.SessionCount != 2 || target.Email != fixture.targetEmail {
		t.Fatalf("target online projection = %+v, want two sessions for %s", target, fixture.targetEmail)
	}

	kickPath := "/api/online-users/" + fixture.targetID + "/kick"
	if response := onlineHTTPRequest(handler, http.MethodPost, kickPath, ``, managerCookie); response.Code != http.StatusNoContent {
		t.Fatalf("kick status = %d, body=%s", response.Code, response.Body.String())
	}
	for name, cookie := range map[string]*http.Cookie{"target A": targetCookieA, "target B": targetCookieB} {
		if response := onlineHTTPRequest(handler, http.MethodGet, "/api/auth/session-status", ``, cookie); response.Code != http.StatusUnauthorized {
			t.Errorf("%s session status = %d, want 401", name, response.Code)
		}
		if response := onlineHTTPRequest(handler, http.MethodGet, "/api/auth/me", ``, cookie); response.Code != http.StatusUnauthorized {
			t.Errorf("%s /me = %d, want 401", name, response.Code)
		}
	}
	if response := onlineHTTPRequest(handler, http.MethodGet, "/api/auth/me", ``, otherCookie); response.Code != http.StatusOK {
		t.Fatalf("unrelated user /me = %d, want 200", response.Code)
	}
	newTargetCookie := loginOnlineHTTPUser(t, handler, fixture.targetEmail, fixture.targetPassword)
	sessionCookies = append(sessionCookies, newTargetCookie)
	if response := onlineHTTPRequest(handler, http.MethodGet, "/api/auth/me", ``, newTargetCookie); response.Code != http.StatusOK {
		t.Fatalf("target relogin /me = %d, want 200", response.Code)
	}

	logsResponse := onlineHTTPRequest(handler, http.MethodGet, "/api/operation-logs?action=users.sessions.revoke&objectId="+fixture.targetID, ``, managerCookie)
	if logsResponse.Code != http.StatusOK {
		t.Fatalf("operation log list status = %d, body=%s", logsResponse.Code, logsResponse.Body.String())
	}
	var logs struct {
		Logs []struct {
			Actor struct {
				ID string `json:"id"`
			} `json:"actor"`
			Action   string         `json:"action"`
			ObjectID string         `json:"objectId"`
			Result   string         `json:"result"`
			Details  map[string]any `json:"details"`
		} `json:"logs"`
	}
	if err := json.Unmarshal(logsResponse.Body.Bytes(), &logs); err != nil {
		t.Fatal(err)
	}
	if len(logs.Logs) != 1 || logs.Logs[0].Actor.ID != fixture.managerID || logs.Logs[0].Action != "users.sessions.revoke" || logs.Logs[0].ObjectID != fixture.targetID || logs.Logs[0].Result != application.OperationLogSuccess {
		t.Fatalf("success operation logs = %+v", logs.Logs)
	}
	if strings.Contains(logsResponse.Body.String(), targetCookieA.Value) || strings.Contains(logsResponse.Body.String(), targetCookieB.Value) {
		t.Fatal("operation log response contains a session credential")
	}

	missingID := "10000000-0000-4000-8000-000000000099"
	failedKick := onlineHTTPRequest(handler, http.MethodPost, "/api/online-users/"+missingID+"/kick", ``, managerCookie)
	if failedKick.Code != http.StatusNotFound {
		t.Fatalf("missing target kick status = %d, body=%s", failedKick.Code, failedKick.Body.String())
	}
	failedLogsResponse := onlineHTTPRequest(handler, http.MethodGet, "/api/operation-logs?action=users.sessions.revoke&objectId="+missingID+"&result=failure", ``, managerCookie)
	if failedLogsResponse.Code != http.StatusOK {
		t.Fatalf("failure operation log list status = %d, body=%s", failedLogsResponse.Code, failedLogsResponse.Body.String())
	}
	if !strings.Contains(failedLogsResponse.Body.String(), `"result":"failure"`) {
		t.Fatalf("failure operation log response = %s", failedLogsResponse.Body.String())
	}
}

func TestOnlineHTTPNoTouchIntegration(t *testing.T) {
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	redisAddr := os.Getenv("TEST_REDIS_ADDR")
	redisPassword := os.Getenv("TEST_REDIS_PASSWORD")
	if dsn == "" || redisAddr == "" || redisPassword == "" {
		t.Skip("isolated PostgreSQL and Redis are required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		t.Fatal(err)
	}
	accounts := postgresadapter.NewStore(db)
	hasher, err := password.NewHasher(2)
	if err != nil {
		_ = db.Close()
		t.Fatal(err)
	}
	fixture := createOnlineHTTPFixture(t, ctx, db, hasher)

	baseConfig := testConfig()
	baseConfig.RedisAddr = redisAddr
	baseConfig.RedisPassword = redisPassword
	baseConfig.RedisOperationTimeout = time.Second
	baseConfig.SessionAbsoluteTimeout = 5 * time.Second
	baseConfig.LoginGlobalCapacity = 100
	baseConfig.LoginGlobalRefillInterval = time.Millisecond
	baseConfig.LoginEmailCapacity = 100
	baseConfig.LoginEmailRefillInterval = time.Millisecond
	shortConfig := baseConfig
	shortConfig.SessionIdleTimeout = 800 * time.Millisecond
	shortSessions := redisadapter.NewStore(shortConfig)
	longConfig := baseConfig
	longConfig.SessionIdleTimeout = time.Hour
	longSessions := redisadapter.NewStore(longConfig)
	shortCookies := make([]*http.Cookie, 0, 2)
	longCookies := make([]*http.Cookie, 0, 1)
	t.Cleanup(func() {
		if err := cleanupOnlineHTTPFixture(db, shortSessions, fixture, shortCookies); err != nil {
			t.Errorf("clean no-touch online HTTP fixture: %v", err)
		}
		if err := cleanupSessionCookies(longSessions, longCookies); err != nil {
			t.Errorf("clean no-touch observer sessions: %v", err)
		}
		_ = longSessions.Close()
		_ = shortSessions.Close()
		_ = db.Close()
	})

	shortAuth := application.NewAuthentication(accounts, hasher, shortSessions, shortSessions, application.CryptoRandom(), domain.DefaultPermissionCatalog())
	shortHandler := NewHandlerWithAccessAndOperationLog(&setupFake{status: application.SetupComplete}, shortAuth, shortConfig, nil, nil, nil, nil, nil)
	longAuth := application.NewAuthentication(accounts, hasher, longSessions, longSessions, application.CryptoRandom(), domain.DefaultPermissionCatalog())
	longHandler := NewHandlerWithAccessAndOperationLog(&setupFake{status: application.SetupComplete}, longAuth, longConfig, nil, nil, nil, nil, nil)

	targetCookie := loginOnlineHTTPUser(t, shortHandler, fixture.targetEmail, fixture.targetPassword)
	shortCookies = append(shortCookies, targetCookie)
	managerCookie := loginOnlineHTTPUser(t, shortHandler, fixture.managerEmail, fixture.managerPassword)
	shortCookies = append(shortCookies, managerCookie)
	observerCookie := loginOnlineHTTPUser(t, longHandler, fixture.otherEmail, fixture.otherPassword)
	longCookies = append(longCookies, observerCookie)

	seenTarget := false
	managerExpired := false
	var lastUsers []application.OnlineUser
	started := time.Now()
	for time.Since(started) < 1300*time.Millisecond {
		managerStatus := onlineHTTPRequest(shortHandler, http.MethodGet, "/api/auth/session-status", ``, managerCookie)
		elapsed := time.Since(started)
		switch {
		case elapsed < 500*time.Millisecond && managerStatus.Code != http.StatusOK:
			t.Fatalf("early no-touch session status = %d after %s", managerStatus.Code, elapsed)
		case elapsed >= 900*time.Millisecond && managerStatus.Code != http.StatusUnauthorized:
			t.Fatalf("repeated no-touch session status = %d after %s, want 401", managerStatus.Code, elapsed)
		case managerStatus.Code == http.StatusUnauthorized:
			managerExpired = true
		case managerStatus.Code != http.StatusOK:
			t.Fatalf("no-touch session status = %d after %s", managerStatus.Code, elapsed)
		}
		lastUsers = onlineHTTPList(t, longHandler, observerCookie)
		for _, user := range lastUsers {
			if user.ID == fixture.targetID {
				seenTarget = true
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	if !seenTarget {
		t.Fatal("observer never saw the short-lived target session in the online list")
	}
	if !managerExpired {
		t.Fatal("manager session remained valid after its 800ms idle timeout")
	}
	if findOnlineHTTPUserOptional(lastUsers, fixture.targetID) != nil {
		t.Fatalf("expired target remained in online list: %+v", lastUsers)
	}
	if response := onlineHTTPRequest(shortHandler, http.MethodGet, "/api/auth/session-status", ``, targetCookie); response.Code != http.StatusUnauthorized {
		t.Fatalf("target no-touch session status = %d, want 401", response.Code)
	}
	if response := onlineHTTPRequest(longHandler, http.MethodGet, "/api/auth/session-status", ``, observerCookie); response.Code != http.StatusOK {
		t.Fatalf("long-lived observer session status = %d, want 200", response.Code)
	}
}

func TestOnlineHTTPConcurrentKickRejectsStaleLogin(t *testing.T) {
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	redisAddr := os.Getenv("TEST_REDIS_ADDR")
	redisPassword := os.Getenv("TEST_REDIS_PASSWORD")
	if dsn == "" || redisAddr == "" || redisPassword == "" {
		t.Skip("isolated PostgreSQL and Redis are required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		t.Fatal(err)
	}
	accounts := postgresadapter.NewStore(db)
	hasher, err := password.NewHasher(2)
	if err != nil {
		_ = db.Close()
		t.Fatal(err)
	}
	fixture := createOnlineHTTPFixture(t, ctx, db, hasher)

	cfg := testConfig()
	cfg.RedisAddr = redisAddr
	cfg.RedisPassword = redisPassword
	cfg.RedisOperationTimeout = time.Second
	cfg.SessionIdleTimeout = time.Hour
	cfg.SessionAbsoluteTimeout = 2 * time.Hour
	cfg.LoginGlobalCapacity = 100
	cfg.LoginGlobalRefillInterval = time.Millisecond
	cfg.LoginEmailCapacity = 100
	cfg.LoginEmailRefillInterval = time.Millisecond
	sessions := redisadapter.NewStore(cfg)
	var sessionCookies []*http.Cookie
	t.Cleanup(func() {
		if err := cleanupOnlineHTTPFixture(db, sessions, fixture, sessionCookies); err != nil {
			t.Errorf("clean concurrent online HTTP fixture: %v", err)
		}
		_ = sessions.Close()
		_ = db.Close()
	})

	managerAuth := application.NewAuthentication(accounts, hasher, sessions, sessions, application.CryptoRandom(), domain.DefaultPermissionCatalog())
	managerHandler := NewHandlerWithAccessAndOperationLog(&setupFake{status: application.SetupComplete}, managerAuth, cfg, nil, nil, nil, nil, nil)
	blockedSessions := &blockingVersionedSessionStore{
		Store:         sessions,
		createStarted: make(chan struct{}),
		releaseCreate: make(chan struct{}),
	}
	blockedAuth := application.NewAuthentication(accounts, hasher, blockedSessions, blockedSessions, application.CryptoRandom(), domain.DefaultPermissionCatalog())
	blockedHandler := NewHandlerWithAccessAndOperationLog(&setupFake{status: application.SetupComplete}, blockedAuth, cfg, nil, nil, nil, nil, nil)

	managerCookie := loginOnlineHTTPUser(t, managerHandler, fixture.managerEmail, fixture.managerPassword)
	sessionCookies = append(sessionCookies, managerCookie)
	loginDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		loginDone <- onlineHTTPRequest(blockedHandler, http.MethodPost, "/api/auth/login", fmt.Sprintf(`{"email":%q,"password":%q}`, fixture.targetEmail, fixture.targetPassword), nil)
	}()
	select {
	case <-blockedSessions.createStarted:
	case <-time.After(5 * time.Second):
		blockedSessions.Unblock()
		t.Fatal("concurrent login did not reach the session creation boundary")
	}

	kickPath := "/api/online-users/" + fixture.targetID + "/kick"
	if response := onlineHTTPRequest(managerHandler, http.MethodPost, kickPath, ``, managerCookie); response.Code != http.StatusNoContent {
		blockedSessions.Unblock()
		t.Fatalf("concurrent kick status = %d, body=%s", response.Code, response.Body.String())
	}
	blockedSessions.Unblock()

	var loginResponse *httptest.ResponseRecorder
	select {
	case loginResponse = <-loginDone:
	case <-time.After(5 * time.Second):
		t.Fatal("concurrent login did not finish after session creation was released")
	}
	if loginResponse.Code != http.StatusOK {
		t.Fatalf("stale concurrent login status = %d, body=%s", loginResponse.Code, loginResponse.Body.String())
	}
	staleCookie := sessionCookieFromResponse(t, loginResponse)
	sessionCookies = append(sessionCookies, staleCookie)

	if users := onlineHTTPList(t, managerHandler, managerCookie); findOnlineHTTPUserOptional(users, fixture.targetID) != nil {
		t.Fatalf("stale concurrent login remained online: %+v", users)
	}
	for path := range map[string]struct{}{"/api/auth/session-status": {}, "/api/auth/me": {}} {
		if response := onlineHTTPRequest(managerHandler, http.MethodGet, path, ``, staleCookie); response.Code != http.StatusUnauthorized {
			t.Errorf("stale concurrent login %s status = %d, want 401", path, response.Code)
		}
	}

	freshCookie := loginOnlineHTTPUser(t, managerHandler, fixture.targetEmail, fixture.targetPassword)
	sessionCookies = append(sessionCookies, freshCookie)
	if response := onlineHTTPRequest(managerHandler, http.MethodGet, "/api/auth/me", ``, freshCookie); response.Code != http.StatusOK {
		t.Fatalf("fresh login after concurrent kick /me status = %d, want 200", response.Code)
	}
}

type blockingVersionedSessionStore struct {
	*redisadapter.Store
	createStarted chan struct{}
	releaseCreate chan struct{}
	startOnce     sync.Once
	releaseOnce   sync.Once
}

func (s *blockingVersionedSessionStore) CreateVersioned(ctx context.Context, sessionID, userID string, authVersion int64) error {
	s.startOnce.Do(func() { close(s.createStarted) })
	select {
	case <-s.releaseCreate:
	case <-ctx.Done():
		return ctx.Err()
	}
	return s.Store.CreateVersioned(ctx, sessionID, userID, authVersion)
}

func (s *blockingVersionedSessionStore) Unblock() {
	s.releaseOnce.Do(func() { close(s.releaseCreate) })
}

type onlineHTTPFixture struct {
	managerID       string
	managerEmail    string
	managerPassword string
	targetID        string
	targetEmail     string
	targetPassword  string
	otherEmail      string
	otherPassword   string
	otherID         string
	roleID          string
}

func createOnlineHTTPFixture(t *testing.T, ctx context.Context, db *sql.DB, hasher *password.Hasher) onlineHTTPFixture {
	t.Helper()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	fixture := onlineHTTPFixture{
		managerEmail:    "online-http-manager-" + suffix + "@example.com",
		managerPassword: "Manager1!x",
		targetEmail:     "online-http-super-" + suffix + "@example.com",
		targetPassword:  "Target1!x",
		otherEmail:      "online-http-other-" + suffix + "@example.com",
		otherPassword:   "Other1!x",
	}
	for _, user := range []struct {
		name     string
		email    string
		password string
		id       *string
	}{
		{name: "Online HTTP Manager", email: fixture.managerEmail, password: fixture.managerPassword, id: &fixture.managerID},
		{name: "Online HTTP Super Admin", email: fixture.targetEmail, password: fixture.targetPassword, id: &fixture.targetID},
		{name: "Online HTTP Other", email: fixture.otherEmail, password: fixture.otherPassword, id: &fixture.otherID},
	} {
		hash, err := hasher.Hash(ctx, user.password)
		if err != nil {
			t.Fatal(err)
		}
		if err := db.QueryRowContext(ctx, `INSERT INTO auth_users (name, email, email_canonical, password_hash) VALUES ($1, $2, $2, $3) RETURNING id::text`, user.name, user.email, hash).Scan(user.id); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.QueryRowContext(ctx, `INSERT INTO auth_roles (name, name_canonical, description) VALUES ($1, $2, $3) RETURNING id::text`, "Online HTTP Manager "+suffix, "online http manager "+suffix, "Integration role").Scan(&fixture.roleID); err != nil {
		t.Fatal(err)
	}
	for _, permission := range []string{"online-users.read", "online-users.write", "operation-logs.read"} {
		if _, err := db.ExecContext(ctx, `INSERT INTO auth_role_permissions (role_id, permission_key) VALUES ($1::uuid, $2)`, fixture.roleID, permission); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO auth_user_roles (user_id, role_id) VALUES ($1::uuid, $2::uuid)`, fixture.managerID, fixture.roleID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO auth_user_roles (user_id, role_id) SELECT id, $1::uuid FROM auth_users WHERE email = $2`, fixture.roleID, fixture.otherEmail); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO auth_user_roles (user_id, role_id) SELECT $1::uuid, id FROM auth_roles WHERE system_key = 'super_admin'`, fixture.targetID); err != nil {
		t.Fatal(err)
	}
	return fixture
}

func cleanupOnlineHTTPFixture(db *sql.DB, sessions *redisadapter.Store, fixture onlineHTTPFixture, cookies []*http.Cookie) error {
	cleanupCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var cleanupErr error
	cleanupErr = errors.Join(cleanupErr, cleanupSessionCookiesWithContext(cleanupCtx, sessions, cookies))
	userIDs := []string{fixture.managerID, fixture.targetID, fixture.otherID}
	if _, err := db.ExecContext(cleanupCtx, `DELETE FROM auth_operation_logs WHERE actor_user_id IN ($1::uuid, $2::uuid, $3::uuid) OR object_id IN ($4::text, $5::text, $6::text)`, userIDs[0], userIDs[1], userIDs[2], userIDs[0], userIDs[1], userIDs[2]); err != nil {
		cleanupErr = errors.Join(cleanupErr, err)
	}
	if _, err := db.ExecContext(cleanupCtx, `DELETE FROM auth_users WHERE id IN ($1::uuid, $2::uuid, $3::uuid)`, userIDs[0], userIDs[1], userIDs[2]); err != nil {
		cleanupErr = errors.Join(cleanupErr, err)
	}
	if _, err := db.ExecContext(cleanupCtx, `DELETE FROM auth_roles WHERE id = $1::uuid`, fixture.roleID); err != nil {
		cleanupErr = errors.Join(cleanupErr, err)
	}
	var remainingUsers, remainingRoles, remainingLogs int
	if err := db.QueryRowContext(cleanupCtx, `SELECT count(*) FROM auth_users WHERE id IN ($1::uuid, $2::uuid, $3::uuid)`, userIDs[0], userIDs[1], userIDs[2]).Scan(&remainingUsers); err != nil {
		cleanupErr = errors.Join(cleanupErr, err)
	} else if remainingUsers != 0 {
		cleanupErr = errors.Join(cleanupErr, fmt.Errorf("%d fixture users remain", remainingUsers))
	}
	if err := db.QueryRowContext(cleanupCtx, `SELECT count(*) FROM auth_roles WHERE id = $1::uuid`, fixture.roleID).Scan(&remainingRoles); err != nil {
		cleanupErr = errors.Join(cleanupErr, err)
	} else if remainingRoles != 0 {
		cleanupErr = errors.Join(cleanupErr, fmt.Errorf("%d fixture roles remain", remainingRoles))
	}
	if err := db.QueryRowContext(cleanupCtx, `SELECT count(*) FROM auth_operation_logs WHERE actor_user_id IN ($1::uuid, $2::uuid, $3::uuid) OR object_id IN ($4::text, $5::text, $6::text)`, userIDs[0], userIDs[1], userIDs[2], userIDs[0], userIDs[1], userIDs[2]).Scan(&remainingLogs); err != nil {
		cleanupErr = errors.Join(cleanupErr, err)
	} else if remainingLogs != 0 {
		cleanupErr = errors.Join(cleanupErr, fmt.Errorf("%d fixture operation logs remain", remainingLogs))
	}
	return cleanupErr
}

func cleanupSessionCookies(sessions *redisadapter.Store, cookies []*http.Cookie) error {
	cleanupCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return cleanupSessionCookiesWithContext(cleanupCtx, sessions, cookies)
}

func cleanupSessionCookiesWithContext(ctx context.Context, sessions *redisadapter.Store, cookies []*http.Cookie) error {
	var cleanupErr error
	for _, cookie := range cookies {
		if cookie != nil {
			cleanupErr = errors.Join(cleanupErr, sessions.Delete(ctx, cookie.Value))
		}
	}
	return cleanupErr
}

func loginOnlineHTTPUser(t *testing.T, handler http.Handler, email, password string) *http.Cookie {
	t.Helper()
	response := onlineHTTPRequest(handler, http.MethodPost, "/api/auth/login", fmt.Sprintf(`{"email":%q,"password":%q}`, email, password), nil)
	if response.Code != http.StatusOK {
		t.Fatalf("login %s status = %d, body=%s", email, response.Code, response.Body.String())
	}
	return sessionCookieFromResponse(t, response)
}

func sessionCookieFromResponse(t *testing.T, response *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, cookie := range response.Result().Cookies() {
		if cookie.Name == testConfig().CookieName {
			return cookie
		}
	}
	t.Fatalf("response did not set a session cookie")
	return nil
}

func onlineHTTPRequest(handler http.Handler, method, path, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Origin", testConfig().Origin)
	if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}
	if cookie != nil {
		request.AddCookie(cookie)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func onlineHTTPList(t *testing.T, handler http.Handler, cookie *http.Cookie) []application.OnlineUser {
	t.Helper()
	response := onlineHTTPRequest(handler, http.MethodGet, "/api/online-users", ``, cookie)
	if response.Code != http.StatusOK {
		t.Fatalf("online list status = %d, body=%s", response.Code, response.Body.String())
	}
	var payload struct {
		Users []application.OnlineUser `json:"users"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	return payload.Users
}

func findOnlineHTTPUser(t *testing.T, users []application.OnlineUser, id string) application.OnlineUser {
	t.Helper()
	for _, user := range users {
		if user.ID == id {
			return user
		}
	}
	t.Fatalf("online list did not contain user %s: %+v", id, users)
	return application.OnlineUser{}
}

func findOnlineHTTPUserOptional(users []application.OnlineUser, id string) *application.OnlineUser {
	for index := range users {
		if users[index].ID == id {
			return &users[index]
		}
	}
	return nil
}
