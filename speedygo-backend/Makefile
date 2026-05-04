.PHONY: dev build test clean docker-up docker-down tidy

# Run the gateway in development mode
dev:
	go run ./cmd/gateway

# Build the gateway binary
build:
	CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/gateway ./cmd/gateway

# Run tests
test:
	go test ./... -v -count=1

# Download and tidy dependencies
tidy:
	go mod tidy

# Start all infrastructure with Docker Compose
docker-up:
	docker compose up -d postgres redis nats

# Stop all infrastructure
docker-down:
	docker compose down

# Build and run everything in Docker
docker-all:
	docker compose up --build -d

# Clean build artifacts
clean:
	rm -rf bin/ tmp/

# Run database migrations only
migrate:
	go run ./cmd/gateway -migrate

# Lint
lint:
	golangci-lint run ./...
