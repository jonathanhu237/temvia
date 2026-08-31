.PHONY: up down logs logs-admin migrate-up migrate-down-one build test admin-install admin-dev admin-test

up:
	docker compose up -d api admin

down:
	docker compose down

logs:
	docker compose logs -f api

logs-admin:
	docker compose logs -f admin

migrate-up:
	docker compose up -d postgres
	docker compose --profile tools run --rm migrate

migrate-down-one:
	docker compose --profile tools run --rm migrate down 1

build:
	docker compose build api admin migrate

test:
	cd api && go test ./...
	cd admin && pnpm test

admin-install:
	cd admin && pnpm install --ignore-scripts

admin-dev:
	cd admin && pnpm dev

admin-test:
	cd admin && pnpm test
