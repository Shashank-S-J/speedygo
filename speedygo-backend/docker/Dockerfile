# ─── SpeedyGo Gateway Dockerfile ───
# Multi-stage build for minimal image size

# Stage 1: Build
FROM golang:1.24-alpine AS builder
RUN apk add --no-cache git ca-certificates
WORKDIR /app
ENV GOTOOLCHAIN=auto

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOTOOLCHAIN=auto go build -ldflags="-s -w" -o /gateway ./cmd/gateway

# Stage 2: Runtime (distroless-like)
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /gateway /gateway

EXPOSE 8080
ENTRYPOINT ["/gateway"]
