.PHONY: up down logs migrate-up migrate-down-one build test

up:
	docker compose up -d api

down:
	docker compose down

logs:
	docker compose logs -f api

migrate-up:
	docker compose up -d postgres
	docker compose --profile tools run --rm migrate

migrate-down-one:
	docker compose --profile tools run --rm migrate down 1

build:
	docker compose build api migrate

test:
	cd api && go test ./...
