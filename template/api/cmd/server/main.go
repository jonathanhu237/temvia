package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"example.com/temvia/api/internal/auth/adapter/httpapi"
	"example.com/temvia/api/internal/auth/adapter/password"
	"example.com/temvia/api/internal/auth/adapter/postgres"
	redisadapter "example.com/temvia/api/internal/auth/adapter/redis"
	"example.com/temvia/api/internal/auth/application"
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

func newApplicationHandler(cfg config.Config, setup application.SetupStore, auth application.AccountStore, hasher application.PasswordHasher, sessions application.SessionStore, limiter application.LoginLimiter, random application.RandomSource) http.Handler {
	setupService := application.NewSetup(setup, hasher, random, cfg.SetupLinkTTL)
	authService := application.NewAuthentication(auth, hasher, sessions, limiter, random)
	mux := http.NewServeMux()
	mux.Handle("GET /health", healthHandler())
	authHandler := httpapi.NewHandler(setupService, authService, cfg)
	mux.Handle("/api", authHandler)
	mux.Handle("/api/", authHandler)
	return mux
}

func main() {
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
	defer db.Close()
	postgresStore := postgres.NewStore(db)
	if err := postgresStore.CheckSchema(startupContext); err != nil {
		log.Fatalf("database schema is not ready: %v", err)
	}
	hasher, err := password.NewHasher(cfg.PasswordHashMaxConcurrency)
	if err != nil {
		log.Fatalf("password hashing configuration failed: %v", err)
	}
	redisStore := redisadapter.NewStore(cfg)
	defer redisStore.Close()
	random := application.CryptoRandom()
	setupService := application.NewSetup(postgresStore, hasher, random, cfg.SetupLinkTTL)
	if token, required, err := setupService.IssueStartupToken(startupContext); err != nil {
		log.Fatalf("setup initialization failed: %v", err)
	} else if required {
		log.Printf("initial setup link (expires in %s): %s/setup#token=%s", cfg.SetupLinkTTL, cfg.PublicURL, token)
	}
	handler := newApplicationHandler(cfg, postgresStore, postgresStore, hasher, redisStore, redisStore, random)
	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	shutdownContext, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-shutdownContext.Done()
		gracefulContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(gracefulContext)
	}()
	log.Printf("API listening on %s", cfg.HTTPAddr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("API server failed: %v", err)
	}
}
