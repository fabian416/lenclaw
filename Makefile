# =============================================================================
# Lenclaw - Developer Commands
# Usage: make <target>
# =============================================================================

.PHONY: dev build up down logs test clean migrate shell-backend shell-frontend ps

# Default compose files
COMPOSE_DEV = docker compose -f docker-compose.yml -f docker-compose.dev.yml
COMPOSE_PROD = docker compose -f docker-compose.yml

# ---------------------------------------------------------------------------
# Development
# ---------------------------------------------------------------------------

## Start all services in dev mode with hot reload
dev:
	$(COMPOSE_DEV) up --build

## Start dev services in background
dev-detach:
	$(COMPOSE_DEV) up --build -d

# ---------------------------------------------------------------------------
# Production
# ---------------------------------------------------------------------------

## Build all Docker images
build:
	$(COMPOSE_PROD) build

## Start all services in production mode (detached)
up:
	$(COMPOSE_PROD) up -d

## Stop all services
down:
	$(COMPOSE_PROD) down

## Stop all services and remove volumes (DESTRUCTIVE)
down-volumes:
	$(COMPOSE_PROD) down -v

# ---------------------------------------------------------------------------
# Observability
# ---------------------------------------------------------------------------

## Follow logs for all services
logs:
	$(COMPOSE_PROD) logs -f

## Follow logs for a specific service (usage: make logs-service SERVICE=backend)
logs-service:
	$(COMPOSE_PROD) logs -f $(SERVICE)

## Show running containers and their status
ps:
	$(COMPOSE_PROD) ps

# ---------------------------------------------------------------------------
# Testing
# ---------------------------------------------------------------------------

## Run all tests (frontend + backend + contracts)
test: test-frontend test-backend test-contracts

## Run frontend linting and tests
test-frontend:
	cd frontend && npm run lint
	@echo "--- Frontend lint passed ---"

## Run backend linting and tests
test-backend:
	cd backend && python -m ruff check src/ tests/
	cd backend && python -m pytest tests/ -v
	@echo "--- Backend tests passed ---"

## Build and test smart contracts
test-contracts:
	cd contracts && forge build
	cd contracts && forge test -v
	@echo "--- Contract tests passed ---"

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

## Run Alembic database migrations
migrate:
	$(COMPOSE_PROD) exec backend python -m alembic upgrade head

## Create a new migration (usage: make migration MSG="add users table")
migration:
	$(COMPOSE_PROD) exec backend python -m alembic revision --autogenerate -m "$(MSG)"

# ---------------------------------------------------------------------------
# Shell Access
# ---------------------------------------------------------------------------

## Open a shell in the backend container
shell-backend:
	$(COMPOSE_PROD) exec backend /bin/bash

## Open a shell in the frontend container
shell-frontend:
	$(COMPOSE_PROD) exec frontend /bin/sh

## Open a psql shell in the postgres container
shell-db:
	$(COMPOSE_PROD) exec postgres psql -U $${POSTGRES_USER:-postgres} -d $${POSTGRES_DB:-lenclaw_db}

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

## Remove all containers, images, and volumes
clean:
	$(COMPOSE_PROD) down -v --rmi local --remove-orphans
	docker system prune -f

## Remove only dangling images and stopped containers
clean-soft:
	docker system prune -f

# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

## Check the health of all services
health:
	@echo "Backend:" && curl -sf http://localhost:8000/health | python -m json.tool || echo "  DOWN"
	@echo "Frontend:" && curl -sf http://localhost:80/ > /dev/null && echo '  {"status": "ok"}' || echo "  DOWN"
	@echo "Postgres:" && $(COMPOSE_PROD) exec postgres pg_isready -U postgres && echo "  OK" || echo "  DOWN"
	@echo "Redis:" && $(COMPOSE_PROD) exec redis redis-cli ping || echo "  DOWN"

## Display help
help:
	@echo "Lenclaw Makefile targets:"
	@echo ""
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## /  /'
	@echo ""
	@echo "Usage: make <target>"
