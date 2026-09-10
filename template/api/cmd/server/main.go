package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"example.com/temvia/api/internal/auth/adapter/httpapi"
	mailadapter "example.com/temvia/api/internal/auth/adapter/mail"
	"example.com/temvia/api/internal/auth/adapter/password"
	"example.com/temvia/api/internal/auth/adapter/postgres"
	"example.com/temvia/api/internal/auth/application"
	"example.com/temvia/api/internal/auth/domain"
	"example.com/temvia/api/internal/config"
)

func healthHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("{\"status\":\"ok\"}\n"))
	})
}

// newHandler preserves the original health-only test seam. Runtime wiring is
// performed by newApplicationHandler after configuration and schema checks.
func newHandler() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("GET /health", healthHandler())
	return mux
}

func setupLimiter(value any) application.SetupLimiter {
	limiter, _ := value.(application.SetupLimiter)
	return limiter
}

func invitationAcceptLimiter(value any) application.InvitationAcceptLimiter {
	limiter, _ := value.(application.InvitationAcceptLimiter)
	return limiter
}

func invitationSendLimiter(value any) application.InvitationSendLimiter {
	limiter, _ := value.(application.InvitationSendLimiter)
	return limiter
}

func firstRecovery(recovery []httpapi.PasswordRecoveryService) httpapi.PasswordRecoveryService {
	if len(recovery) == 0 {
		return nil
	}
	return recovery[0]
}

func newApplicationHandler(cfg config.Config, setup application.SetupStore, auth application.AccountStore, hasher application.PasswordHasher, sessions application.SessionStore, limiter application.LoginLimiter, random application.RandomSource, recovery ...httpapi.PasswordRecoveryService) http.Handler {
	return newApplicationHandlerWithSettings(cfg, setup, auth, hasher, sessions, limiter, random, firstRecovery(recovery), nil)
}

func newApplicationHandlerWithSettings(cfg config.Config, setup application.SetupStore, auth application.AccountStore, hasher application.PasswordHasher, sessions application.SessionStore, limiter application.LoginLimiter, random application.RandomSource, recovery httpapi.PasswordRecoveryService, settingsService *application.SettingsManagement) http.Handler {
	return newApplicationHandlerWithOperationLog(cfg, setup, auth, hasher, sessions, limiter, random, recovery, settingsService, nil)
}

func newApplicationHandlerWithOperationLog(cfg config.Config, setup application.SetupStore, auth application.AccountStore, hasher application.PasswordHasher, sessions application.SessionStore, limiter application.LoginLimiter, random application.RandomSource, recovery httpapi.PasswordRecoveryService, settingsService *application.SettingsManagement, operationLogs *application.OperationLogService) http.Handler {
	return newApplicationHandlerWithOperationLogAndIdentity(cfg, setup, auth, hasher, sessions, limiter, random, recovery, settingsService, operationLogs, nil)
}

func newApplicationHandlerWithOperationLogAndIdentity(cfg config.Config, setup application.SetupStore, auth application.AccountStore, hasher application.PasswordHasher, sessions application.SessionStore, limiter application.LoginLimiter, random application.RandomSource, recovery httpapi.PasswordRecoveryService, settingsService *application.SettingsManagement, operationLogs *application.OperationLogService, identity *application.SystemIdentityManagement) http.Handler {
	setupService := application.NewSetup(setup, hasher, random, cfg.SetupLinkTTL, setupLimiter(limiter))
	catalog := domain.DefaultPermissionCatalog()
	authService := application.NewAuthentication(auth, hasher, sessions, limiter, random, catalog)
	mux := http.NewServeMux()
	mux.Handle("GET /health", healthHandler())
	if store, ok := auth.(application.AccessStore); ok {
		if principals, principalOK := auth.(application.PrincipalStore); principalOK {
			var access *application.AccessManagement
			if settingsService != nil {
				access = application.NewAccessManagementWithInvitations(store, principals, catalog, cfg.InvitationTokenKey, random, cfg.InvitationLinkTTL, settingsService)
			} else {
				access = application.NewAccessManagementWithInvitations(store, principals, catalog, cfg.InvitationTokenKey, random, cfg.InvitationLinkTTL)
			}
			access.SetInvitationSendLimiter(invitationSendLimiter(store))
			accept := application.NewInvitationAcceptance(store, hasher, cfg.InvitationTokenKey, invitationAcceptLimiter(store))
			var authHandler http.Handler
			if settingsService != nil {
				if operationLogs != nil {
					if identity != nil {
						authHandler = httpapi.NewHandlerWithAccessAndOperationLogAndIdentity(setupService, authService, cfg, recovery, access, accept, settingsService, operationLogs, identity)
					} else {
						authHandler = httpapi.NewHandlerWithAccessAndOperationLog(setupService, authService, cfg, recovery, access, accept, settingsService, operationLogs)
					}
				} else {
					authHandler = httpapi.NewHandlerWithAccess(setupService, authService, cfg, recovery, access, accept, settingsService)
				}
			} else {
				if operationLogs != nil {
					authHandler = httpapi.NewHandlerWithAccessAndOperationLog(setupService, authService, cfg, recovery, access, accept, nil, operationLogs)
				} else {
					authHandler = httpapi.NewHandlerWithAccess(setupService, authService, cfg, recovery, access, accept)
				}
			}
			mux.Handle("/api", authHandler)
			mux.Handle("/api/", authHandler)
			return mux
		}
	}
	authHandler := httpapi.NewHandler(setupService, authService, cfg, recovery)
	mux.Handle("/api", authHandler)
	mux.Handle("/api/", authHandler)
	return mux
}

func main() {
	os.Exit(run())
}

func run() int {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		log.Fatalf("configuration error: %v", err)
	}
	if cfg.WarnInsecurePublicURL {
		log.Printf("WARNING: development APP_PUBLIC_URL uses HTTP on a non-loopback host; setup and session credentials can be exposed in transit")
	}
	startupContext, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	db, err := postgres.Open(startupContext, cfg)
	if err != nil {
		log.Fatalf("database startup failed: %v", err)
	}
	postgresStore := postgres.NewStore(db, cfg)
	if err := postgresStore.CheckSchema(startupContext); err != nil {
		log.Fatalf("database schema is not ready: %v", err)
	}
	hasher, err := password.NewHasher(cfg.PasswordHashMaxConcurrency)
	if err != nil {
		log.Fatalf("password hashing configuration failed: %v", err)
	}
	random := application.CryptoRandom()
	setupService := application.NewSetup(postgresStore, hasher, random, cfg.SetupLinkTTL)
	if token, required, err := setupService.IssueStartupToken(startupContext); err != nil {
		log.Fatalf("setup initialization failed: %v", err)
	} else if required {
		log.Printf("initial setup link (expires in %s): %s/setup#token=%s", cfg.SetupLinkTTL, cfg.PublicURL, token)
	}
	var secretBox application.SecretBox
	if len(cfg.EmailSettingsEncryptionKey) > 0 {
		secretBox, err = application.NewAESGCMSecretBox(cfg.EmailSettingsEncryptionKey)
		if err != nil {
			log.Fatalf("email settings encryption configuration failed: %v", err)
		}
	}
	runtimeMailer := application.NewReloadableMailer()
	operationLogs := application.NewOperationLogService(postgresStore)
	identityService := application.NewSystemIdentityManagement(postgresStore)
	settingsService := application.NewSettingsManagement(postgresStore, secretBox, func(settings application.SMTPSettings) (application.Mailer, error) {
		return mailadapter.NewSMTPMailerFromSettingsWithTimeout(settings, cfg.SMTPTimeout)
	}, runtimeMailer)
	settingsService.SetProductionMode(cfg.Environment == "production")
	settingsService.SetTestEmailLimiter(postgresStore)
	settingsService.SetSystemIdentityProvider(identityService)
	if err := settingsService.LoadRuntime(startupContext); err != nil {
		log.Fatalf("email settings initialization failed: %v", err)
	}
	recovery := application.NewPasswordRecovery(
		postgresStore,
		postgresStore,
		hasher,
		random,
		cfg.PasswordResetTokenKey,
		cfg.PasswordResetLinkTTL,
		cfg.MailOutboxNotificationTTL,
		cfg.PasswordResetResponseMin,
		settingsService,
	)
	dispatcher := application.NewMailDispatcher(
		postgresStore,
		runtimeMailer,
		random,
		cfg.PasswordResetTokenKey,
		cfg.PublicURL,
		cfg.MailOutboxPollInterval,
		cfg.MailOutboxLeaseDuration,
		cfg.MailOutboxRetryInitial,
		cfg.MailOutboxRetryMax,
		cfg.InvitationTokenKey,
	)
	dispatcher.SetSystemIdentityProvider(identityService)
	handler := newApplicationHandlerWithOperationLogAndIdentity(cfg, postgresStore, postgresStore, hasher, postgresStore, postgresStore, random, recovery, settingsService, operationLogs, identityService)
	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	dispatcherContext, cancelDispatcher := context.WithCancel(context.Background())
	cleanupContext, cancelCleanup := context.WithCancel(context.Background())
	var backgroundWorkers sync.WaitGroup
	backgroundWorkers.Add(3)
	go func() {
		defer backgroundWorkers.Done()
		dispatcher.Run(dispatcherContext)
	}()
	go func() {
		defer backgroundWorkers.Done()
		operationLogs.RunCleanup(cleanupContext, time.Hour)
	}()
	go func() {
		defer backgroundWorkers.Done()
		postgresStore.RunStateCleanup(cleanupContext, time.Minute)
	}()
	workDone := make(chan struct{})
	go func() {
		backgroundWorkers.Wait()
		close(workDone)
	}()

	signals := make(chan os.Signal, 2)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(signals)
	serverErrors := make(chan error, 1)
	go func() {
		serverErrors <- server.ListenAndServe()
	}()
	log.Printf("API listening on %s", cfg.HTTPAddr)
	return runServerLifecycle(
		server,
		serverErrors,
		signals,
		cfg.ShutdownTimeout,
		func(drainContext context.Context) {
			dispatcher.BeginShutdown(drainContext)
			cancelDispatcher()
			cancelCleanup()
		},
		workDone,
		db.Close,
		terminateImmediately,
	)
}
