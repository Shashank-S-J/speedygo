# SpeedyGo Backend — Complete Setup Guide

> **Last updated:** April 2026  
> A step-by-step guide to install every prerequisite, configure the environment, and run the SpeedyGo backend API gateway locally and in Docker.

---

## Table of Contents

1. [Prerequisites (Software Installation)](#1-prerequisites)
2. [Clone the Repository](#2-clone-the-repository)
3. [Infrastructure Services (Docker)](#3-infrastructure-services)
4. [Environment Configuration](#4-environment-configuration)
5. [Database Setup](#5-database-setup)
6. [Running the Backend](#6-running-the-backend)
7. [Verify Everything Works](#7-verify-everything-works)
8. [Running with Docker (Full Stack)](#8-running-with-docker)
9. [External Service Setup](#9-external-service-setup)
10. [All Features Checklist](#10-all-features-checklist)
11. [Makefile Commands Reference](#11-makefile-commands)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

Install the following software on your machine:

### 1.1 Go (v1.22 or higher)

- **Download:** https://go.dev/dl/
- **Windows:** Download the `.msi` installer and run it.
- **Verify:**
  ```bash
  go version
  # Expected: go version go1.22+ ...
  ```

### 1.2 Docker & Docker Compose

- **Download:** https://docs.docker.com/desktop/install/windows-install/
- Install **Docker Desktop for Windows**.
- Ensure **Docker Compose** is included (it is by default with Docker Desktop).
- **Verify:**
  ```bash
  docker --version
  docker compose version
  ```

### 1.3 Git

- **Download:** https://git-scm.com/downloads
- **Verify:**
  ```bash
  git --version
  ```

### 1.4 Make (Optional but recommended)

- **Windows:** Install via [Chocolatey](https://chocolatey.org/):
  ```powershell
  choco install make
  ```
- Or use [GnuWin32 Make](http://gnuwin32.sourceforge.net/packages/make.htm)
- **Verify:**
  ```bash
  make --version
  ```

### 1.5 golangci-lint (Optional — for linting)

```bash
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
```

---

## 2. Clone the Repository

```bash
git clone <your-repo-url> speedygo-backend
cd speedygo-backend
```

---

## 3. Infrastructure Services

The backend requires three infrastructure services. Start them with Docker:

```bash
docker compose up -d postgres redis nats
```

This starts:

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| **PostgreSQL 16** | `postgres:16-alpine` | `5432` | Primary database (with PostGIS) |
| **Redis 7** | `redis:7-alpine` | `6379` | Caching, rate limiting, OTP storage, geo tracking |
| **NATS JetStream** | `nats:2.10-alpine` | `4222` (client), `8222` (monitor) | Event bus for async messaging |

### Verify services are running:

```bash
docker compose ps
```

- **PostgreSQL health:** `docker exec speedygo-postgres pg_isready -U speedygo`
- **Redis health:** `docker exec speedygo-redis redis-cli ping` → should print `PONG`
- **NATS monitoring:** Open http://localhost:8222 in browser

---

## 4. Environment Configuration

### 4.1 Create the `.env` file

```bash
cp .env.example .env
```

If `.env.example` doesn't exist, create `.env` manually with the following content:

```env
# ═══════════════════════════════════════════
# SERVER
# ═══════════════════════════════════════════
SERVER_PORT=8080
SERVER_HOST=0.0.0.0
ENVIRONMENT=development
SERVER_READ_TIMEOUT=10s
SERVER_WRITE_TIMEOUT=10s

# ═══════════════════════════════════════════
# DATABASE (PostgreSQL)
# ═══════════════════════════════════════════
DB_HOST=localhost
DB_PORT=5432
DB_USER=speedygo
DB_PASSWORD=speedygo
DB_NAME=speedygo
DB_SSLMODE=disable
DB_MAX_CONNS=20

# ═══════════════════════════════════════════
# REDIS
# ═══════════════════════════════════════════
REDIS_ADDR=localhost:6379
REDIS_PASSWORD=
REDIS_DB=0

# ═══════════════════════════════════════════
# NATS
# ═══════════════════════════════════════════
NATS_URL=nats://localhost:4222
NATS_CLUSTER_ID=speedygo-cluster

# ═══════════════════════════════════════════
# JWT
# ═══════════════════════════════════════════
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_REFRESH_SECRET=your-separate-refresh-secret-change-this
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=168h
JWT_ISSUER=speedygo

# ═══════════════════════════════════════════
# COOKIES (HttpOnly refresh token cookie)
# ═══════════════════════════════════════════
# Leave empty for development (defaults to request host).
# In production, set to your domain (e.g. .speedygo.in)
COOKIE_DOMAIN=

# ═══════════════════════════════════════════
# STRIPE (Payments)
# ═══════════════════════════════════════════
# Get keys from https://dashboard.stripe.com/test/apikeys
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxx
STRIPE_LIVE_MODE=false

# ═══════════════════════════════════════════
# KYC — Didit.me
# ═══════════════════════════════════════════
# Sign up at https://didit.me
DIDIT_CLIENT_ID=
DIDIT_CLIENT_SECRET=
DIDIT_BASE_URL=https://verification.didit.me/v3

# ═══════════════════════════════════════════
# KYC — Sandbox.co.in (Aadhaar/PAN/DL/RC)
# ═══════════════════════════════════════════
# Sign up at https://sandbox.co.in
SANDBOX_API_KEY=
SANDBOX_BASE_URL=https://api.sandbox.co.in

# ═══════════════════════════════════════════
# AI (Groq — LLaMA)
# ═══════════════════════════════════════════
# Get key from https://console.groq.com
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=llama-3.3-70b-versatile

# ═══════════════════════════════════════════
# STORAGE (Cloudflare R2)
# ═══════════════════════════════════════════
# Get from Cloudflare Dashboard → R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=speedygo
R2_ENDPOINT=

# ═══════════════════════════════════════════
# MAPS (OpenStreetMap + OSRM)
# ═══════════════════════════════════════════
# Public endpoints work for development
NOMINATIM_URL=https://nominatim.openstreetmap.org
OSRM_URL=https://router.project-osrm.org
TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png

# ═══════════════════════════════════════════
# EMAIL (Resend — for OTP)
# ═══════════════════════════════════════════
# Get key from https://resend.com
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx

# ═══════════════════════════════════════════
# CORS (Cross-Origin Resource Sharing)
# ═══════════════════════════════════════════
# Comma-separated list of allowed origins. Leave empty or "*" for development.
# In production, set to your actual frontend URLs.
# e.g. CORS_ORIGINS=https://customer.speedygo.in,https://transporter.speedygo.in,https://admin.speedygo.in
CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002
```

### 4.2 Which keys are REQUIRED vs OPTIONAL for development?

| Variable | Required? | Notes |
|----------|-----------|-------|
| `DB_*` | ✅ Required | Defaults work with docker-compose |
| `REDIS_ADDR` | ✅ Required | Defaults work with docker-compose |
| `NATS_URL` | ✅ Required | Defaults work with docker-compose |
| `JWT_SECRET` | ✅ Required | Change from default for security |
| `JWT_REFRESH_SECRET` | ✅ Required (prod) | Separate signing key for refresh tokens. Auto-derived in dev |
| `COOKIE_DOMAIN` | ❌ Optional | Domain for HttpOnly refresh token cookie (e.g. `.speedygo.in`) |
| `STRIPE_SECRET_KEY` | ⚠️ For payments | Get free test key from Stripe |
| `STRIPE_WEBHOOK_SECRET` | ⚠️ For payments | Needed for webhook verification |
| `GROQ_API_KEY` | ⚠️ For AI features | Free tier at Groq |
| `RESEND_API_KEY` | ⚠️ For OTP emails | Free tier at Resend |
| `DIDIT_*` | ❌ Optional | Only for KYC verification |
| `SANDBOX_*` | ❌ Optional | Only for Indian doc verification |
| `R2_*` | ❌ Optional | Only for cloud file storage |
| `NOMINATIM_URL` | ✅ Defaults OK | Public OSM endpoints work |
| `OSRM_URL` | ✅ Defaults OK | Public OSRM endpoints work |
| `CORS_ORIGINS` | ✅ Defaults OK | Defaults to `*` (all origins) in dev; set specific origins in production |

---

## 5. Database Setup

The backend **auto-migrates** on startup using GORM. No manual migration is needed.

However, if you want to run the raw SQL migration manually:

```bash
# Connect to PostgreSQL
docker exec -it speedygo-postgres psql -U speedygo -d speedygo

# Inside psql, run:
\i /path/to/migrations/001_initial.sql
```

### PostGIS Extension

The migration requires PostGIS. If using the Docker PostgreSQL, enable it:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

### Default Admin Account (seeded by migration)

| Field | Value |
|-------|-------|
| Email | `admin@speedygo.in` |
| Phone | `+919999999999` |
| Password | `admin123` |
| Role | `SUPER_ADMIN` |

---

## 6. Running the Backend

### Option A: Using Make

```bash
# Download dependencies
make tidy

# Run in development mode
make dev
```

### Option B: Using Go directly

```bash
# Download dependencies
go mod tidy

# Run the gateway
go run ./cmd/gateway
```

### Option C: Build and run binary

```bash
# Build
go build -o bin/gateway ./cmd/gateway

# Run (Windows)
.\bin\gateway.exe

# Run (Linux/Mac)
./bin/gateway
```

The API server starts at **http://localhost:8080**

---

## 7. Verify Everything Works

### 7.1 Health Check

```bash
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "speedygo-gateway",
  "time": "2026-04-30T..."
}
```

### 7.2 Register a User

```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "phone": "+919876543210",
    "password": "Test@1234",
    "full_name": "Test User",
    "role": "CUSTOMER"
  }'
```

### 7.3 Login

```bash
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@speedygo.in",
    "password": "admin123"
  }'
```

---

## 8. Running with Docker (Full Stack)

To run everything (PostgreSQL + Redis + NATS + Gateway) in Docker:

```bash
# Build and start all services
docker compose up --build -d

# Or using Make
make docker-all
```

The gateway will be available at **http://localhost:8080**

To stop everything:
```bash
docker compose down

# To also delete volumes (database data):
docker compose down -v
```

---

## 9. External Service Setup

### 9.1 Stripe (Payments)

1. Go to https://dashboard.stripe.com/test/apikeys
2. Copy **Secret key** (starts with `sk_test_`) → `STRIPE_SECRET_KEY`
3. Set up webhook endpoint:
   - URL: `http://your-domain/payments/webhook`
   - Events: `payment_intent.succeeded`, `payment_intent.payment_failed`
   - Copy webhook signing secret → `STRIPE_WEBHOOK_SECRET`
4. For local testing, use [Stripe CLI](https://stripe.com/docs/stripe-cli):
   ```bash
   stripe listen --forward-to localhost:8080/payments/webhook
   ```

### 9.2 Groq (AI — LLaMA 3.3)

1. Go to https://console.groq.com
2. Create an API key → `GROQ_API_KEY`
3. Free tier: 30 req/min, 14,400 req/day

### 9.3 Resend (Email OTP)

1. Go to https://resend.com
2. Create an API key → `RESEND_API_KEY`
3. Free tier: 100 emails/day

### 9.4 Didit.me (KYC)

1. Sign up at https://didit.me
2. Get Client ID & Secret → `DIDIT_CLIENT_ID`, `DIDIT_CLIENT_SECRET`

### 9.5 Sandbox.co.in (Indian Doc Verification)

1. Sign up at https://sandbox.co.in
2. Get API key → `SANDBOX_API_KEY`

### 9.6 Cloudflare R2 (Storage)

1. Go to Cloudflare Dashboard → R2
2. Create a bucket named `speedygo`
3. Get account ID, access key, secret key, and endpoint
4. Fill in `R2_*` variables

---

## 10. All Features Checklist

### Authentication & Users
- [x] Email + Password registration with OTP verification
- [x] Login with password or OTP
- [x] JWT access + refresh tokens with distinct `token_type` claims
- [x] Separate signing keys for access and refresh tokens (`JWT_SECRET` / `JWT_REFRESH_SECRET`)
- [x] Refresh token rotation (old refresh token blacklisted on use)
- [x] Token family tracking with reuse detection (stolen token scenario)
- [x] HttpOnly cookie transport for refresh tokens (SameSite=Lax, Secure)
- [x] Redis fail-closed for all security-critical operations (503 on unavailability)
- [x] Access token blacklisting on logout (Redis)
- [x] Refresh token blacklisting on logout (Redis)
- [x] Refresh tokens cannot be used as access tokens (and vice versa)
- [x] Session revocation on password reset / password change
- [x] Password reset (forgot password flow)
- [x] Profile management (view, update, photo upload)
- [x] Role-based access: `CUSTOMER`, `TRANSPORTER`, `ADMIN`, `SUPER_ADMIN`
- [x] Auto-cleanup of stale revoked user Redis set entries

### KYC Verification
- [x] Didit.me identity verification
- [x] Sandbox.co.in — Aadhaar, PAN, DL, RC verification
- [x] Admin manual review queue
- [x] AI risk scoring

### Bookings
- [x] Create booking with pickup/drop locations
- [x] Price estimation
- [x] Nearby bookings for transporters
- [x] Booking state machine (PENDING → ACCEPTED → PICKED_UP → DELIVERED)
- [x] Goods mismatch flagging
- [x] Photo uploads (pickup & delivery proof)
- [x] OTP verification for pickup/delivery
- [x] Booking completion
- [x] Rating system
- [x] Scheduled bookings

### Bidding
- [x] Transporters place bids on bookings
- [x] Customers accept bids

### Vehicles
- [x] Register vehicle with specs
- [x] Vehicle CRUD operations
- [x] GPS location updates
- [x] Nearby vehicle search (geo-based)
- [x] Vehicle search with filters
- [x] Admin vehicle approval queue

### Payments (Stripe)
- [x] Payment initiation (Stripe PaymentIntent)
- [x] Stripe webhook handling
- [x] Escrow release
- [x] Refund support

### Chat (WebSocket)
- [x] Real-time WebSocket chat per booking
- [x] Message history
- [x] Media support
- [x] AI content moderation

### Tracking
- [x] Real-time GPS publishing (WebSocket)
- [x] Live tracking watch (WebSocket)
- [x] Redis Geo for location storage

### Maps & Location
- [x] Geocoding (address → coordinates) via Nominatim
- [x] Reverse geocoding (coordinates → address)
- [x] Route calculation via OSRM
- [x] Live ETA
- [x] Nearby transporters
- [x] Booking route visualization
- [x] User location updates
- [x] Map tile configuration

### Reports
- [x] Bidirectional reporting (customer ↔ transporter)
- [x] AI severity triage
- [x] Admin resolution queue

### SOS (Emergency)
- [x] SOS trigger
- [x] Emergency contacts management
- [x] Admin active SOS alerts
- [x] SOS resolution

### Admin Panel
- [x] User enable/disable/ban
- [x] Role management (SUPER_ADMIN)
- [x] User search
- [x] KYC queue & review
- [x] KYC history
- [x] Reports management
- [x] AI-powered admin queries (natural language)
- [x] Dashboard with analytics
- [x] Audit logs
- [x] Ban queue approval
- [x] Vehicle approval
- [x] Pricing management
- [x] Admin management (create/delete admins)
- [x] Daily bookings, active transporters, user activity

### Notifications
- [x] NATS-based async event consumers
- [x] Email notifications via Resend

### Middleware & Security
- [x] JWT authentication
- [x] Role-based authorization
- [x] Rate limiting (Redis-backed, per-endpoint)
- [x] CORS
- [x] Request ID tracing
- [x] Structured logging
- [x] Panic recovery
- [x] Graceful shutdown

### Background Jobs
- [x] Scheduler (cron-style background tasks)

### Pricing
- [x] Public pricing endpoint
- [x] Admin pricing configuration

---

## 11. Makefile Commands

| Command | Description |
|---------|-------------|
| `make dev` | Run gateway in development mode |
| `make build` | Build production binary to `bin/gateway` |
| `make test` | Run all tests |
| `make tidy` | Download and tidy Go dependencies |
| `make docker-up` | Start PostgreSQL, Redis, NATS |
| `make docker-down` | Stop all Docker services |
| `make docker-all` | Build & run everything in Docker |
| `make clean` | Remove build artifacts |
| `make migrate` | Run database migrations |
| `make lint` | Run golangci-lint |

---

## 12. Troubleshooting

### "Database connection failed"
- Ensure PostgreSQL is running: `docker compose ps`
- Check `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` in `.env`
- Default creds: `speedygo` / `speedygo` / `speedygo`

### "Redis not available" (error in production, warning in development)
- **In production/staging**, Redis is REQUIRED — the server will not start without it.
- **In development**, the backend starts without Redis but auth endpoints (login, refresh, logout) will return 503 errors because security operations fail closed. Rate limiting and caching won't work either.
- Ensure Redis is running: `docker exec speedygo-redis redis-cli ping`

### "NATS not available" (warning)
- The backend starts without NATS but async events (notifications, moderation) won't work.
- Ensure NATS is running: `docker compose ps`

### Port 8080 already in use
- Change `SERVER_PORT` in `.env` or stop the conflicting process.

### "go: module requires go >= 1.22"
- Upgrade Go: https://go.dev/dl/

### PostGIS extension error
- The Docker PostgreSQL image may not include PostGIS. Use `postgis/postgis:16-3.4-alpine` image instead if needed.

### Windows-specific: Make not found
- Install via Chocolatey: `choco install make`
- Or run commands directly: `go run ./cmd/gateway`

---


## JWT & Token Security Architecture

### Token Types

| Token | TTL | Purpose | `token_type` claim | Signing Key |
|-------|-----|---------|-------------------|-------------|
| Access Token | 15 min (configurable) | Authenticate API requests | `access` | `JWT_SECRET` |
| Refresh Token | 7 days (configurable) | Obtain new access tokens | `refresh` | `JWT_REFRESH_SECRET` |

### Security Measures

1. **Separate signing keys** — Access tokens are signed with `JWT_SECRET` and refresh tokens are signed with `JWT_REFRESH_SECRET`. This means a compromised access token signing key cannot forge refresh tokens, and vice versa. In development, the refresh secret is auto-derived from the access secret with a `-refresh` suffix. In production, both must be set explicitly.

2. **Distinct token types** — Access and refresh tokens carry a `token_type` claim (`"access"` or `"refresh"`). The API middleware rejects refresh tokens used as access tokens, and the `/auth/refresh` endpoint rejects access tokens used as refresh tokens.

3. **Token family / reuse detection** — Each login session creates a "token family" identified by a UUID stored in the refresh token's `family_id` claim and tracked in Redis (`token:family:{id}`). On refresh, the same family ID is propagated to the new token. If a **blacklisted** refresh token is replayed (reuse detected), the system:
   - Logs a security warning
   - Deletes the entire token family from Redis
   - Revokes ALL sessions for that user (24h ban from `revoked:users`)
   - Returns 401 with "possible token theft detected"
   
   This catches the scenario where an attacker steals a refresh token but the legitimate user also refreshes, consuming the token. When the attacker tries the stolen token, reuse is detected and everything is invalidated.

4. **HttpOnly cookie for refresh token** — The refresh token is also set as an HttpOnly, Secure (in production), SameSite=Lax cookie on the `/auth` path. This protects it from XSS exfiltration. The backend accepts the refresh token from either the cookie or the request body for backward compatibility. The frontend axios client sends `withCredentials: true` to ensure the cookie is included in cross-origin requests.

5. **Redis fail-closed** — All security-critical operations (token blacklist checks, revocation, refresh token validation, logout) **fail closed** when Redis is unavailable, returning 503 "Service unavailable". This prevents bypassing token blacklists. In non-development environments, the server will not start at all without Redis. Non-security operations (profile caching, rate limiting) degrade gracefully.

6. **Refresh token rotation** — Every time `/auth/refresh` is called, the old refresh token is blacklisted in Redis and a new pair (access + refresh) is issued. Each refresh token can only be used once.

7. **Token blacklisting on logout** — `POST /auth/logout` blacklists both the access token (from `Authorization` header) and the refresh token (from request body or HttpOnly cookie). The logout endpoint uses `OptionalJWTAuth` — it works even if the access token is expired or missing.

8. **Session revocation on password change** — When a user changes their password (any method), all existing sessions are revoked and the token family is cleaned up.

9. **Progressive login lockout** — 5 failed attempts → 15min lock, 10 failed → 24h lock (Redis-backed).

### Token Flow

```
Client                     Backend                    Redis
  │                           │                          │
  │── POST /auth/login ──────>│                          │
  │<── {access, refresh} ─────│── store family:{id} ────>│
  │<── Set-Cookie: refresh ───│                          │
  │                           │                          │
  │── GET /api (Bearer AT) ──>│── check blacklist ──────>│
  │<── 200 OK ────────────────│<── not blacklisted ──────│
  │                           │                          │
  │── (AT expired) ───────────│                          │
  │── POST /auth/refresh ────>│── check RT blacklist ───>│
  │   (cookie or body)        │── verify family:{id} ───>│
  │                           │── blacklist old RT ─────>│
  │<── {new AT, new RT} ──────│                          │
  │<── Set-Cookie: new RT ────│                          │
  │                           │                          │
  │── POST /auth/logout ─────>│── blacklist AT ─────────>│
  │   (cookie or body)        │── blacklist RT ─────────>│
  │                           │── delete family:{id} ───>│
  │<── { ok: true } ──────────│                          │
  │<── Clear-Cookie: RT ──────│                          │
```

### Reuse Detection Flow (Stolen Token Scenario)

```
Legitimate User              Attacker               Backend           Redis
      │                          │                     │                │
      │── login ────────────────>│                     │                │
      │<── RT-1 (family:abc) ────│                     │                │
      │                          │── (steals RT-1) ───>│                │
      │                          │                     │                │
      │── refresh(RT-1) ────────>│                     │                │
      │<── RT-2 (family:abc) ────│── blacklist RT-1 ──>│                │
      │                          │                     │                │
      │                          │── refresh(RT-1) ───>│                │
      │                          │                     │── RT-1 already│
      │                          │                     │   blacklisted!│
      │                          │                     │── REUSE!      │
      │                          │                     │── revoke ALL  │
      │                          │<── 401 theft ───────│── sessions    │
      │                          │                     │                │
      │── (all tokens invalid) ──│                     │                │
      │── must login again ─────>│                     │                │
```

---

### Security Trade-offs & Recommendations

| Concern | Current State | Mitigation |
|---------|--------------|------------|
| **Refresh token storage** | HttpOnly cookie (primary) + localStorage fallback | HttpOnly cookie prevents XSS from reading refresh token; SameSite=Lax prevents CSRF on mutation endpoints |
| **Access token storage (localStorage)** | Needed for WebSocket `?token=` auth | Short TTL (15m), token blacklisting, session revocation on password change |
| **Stolen refresh token** | Detected via token family reuse detection | Token reuse triggers full session invalidation for the user |
| **Redis unavailability** | Fail-closed for security operations | Returns 503; server won't start in production without Redis |
| **Refresh race condition** | Multiple concurrent 401s could collide | Frontend queues concurrent requests; only one refresh call in-flight at a time |
| **WebSocket auth via query param** | Token visible in URL/logs | Access tokens are short-lived (15m); use WSS in production |

**Production hardening checklist:**
- [x] Set strong `JWT_SECRET` (64+ random chars) — **app now panics if default secret is used in non-development environments**
- [x] Set separate `JWT_REFRESH_SECRET` (64+ random chars) — **app panics if derived default is used in production**
- [x] Refresh token stored in HttpOnly cookie (SameSite=Lax, Secure in production)
- [x] Token family reuse detection — stolen refresh tokens trigger full session revocation
- [x] Redis fail-closed — security operations return 503 when Redis is down; server won't start in production without Redis
- [x] Separate signing keys for access vs refresh tokens
- [ ] Configure CSP headers on the reverse proxy to prevent XSS
- [ ] Use HTTPS/WSS exclusively
- [x] Set `CORS_ORIGINS` to specific domains (now configurable via env var)
- [x] Set `COOKIE_DOMAIN` for cross-subdomain cookie sharing in production
- [ ] Enable Redis `requirepass` in production
- [ ] Use separate Redis DB or key prefix per environment

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT APPS                              │
│  (Customer :3000)  (Transporter :3001)  (Admin :3002)       │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP / WebSocket
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                API GATEWAY (Fiber) :8080                     │
│  ┌─────────┐ ┌──────────┐ ┌─────────────┐ ┌──────────────┐ │
│  │  CORS   │ │ Rate Limit│ │ JWT Auth    │ │ Role Guard   │ │
│  └─────────┘ └──────────┘ └─────────────┘ └──────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  Services:                                                   │
│  ┌──────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌─────┐ ┌──────┐ │
│  │ User │ │Booking│ │Vehicle│ │Payment│ │ KYC │ │ Chat │ │
│  └──────┘ └───────┘ └───────┘ └───────┘ └─────┘ └──────┘ │
│  ┌──────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌─────┐ ┌──────┐ │
│  │Report│ │ Admin │ │AI Eng │ │ Track │ │ SOS │ │  Bid │ │
│  └──────┘ └───────┘ └───────┘ └───────┘ └─────┘ └──────┘ │
│  ┌──────┐ ┌───────┐ ┌───────┐ ┌───────────┐               │
│  │ Maps │ │ Dash  │ │Notify │ │Moderation │               │
│  └──────┘ └───────┘ └───────┘ └───────────┘               │
└──────┬──────────────┬──────────────┬────────────────────────┘
       │              │              │
       ▼              ▼              ▼
  ┌─────────┐   ┌─────────┐   ┌──────────┐
  │PostgreSQL│   │  Redis  │   │   NATS   │
  │  :5432   │   │  :6379  │   │  :4222   │
  └─────────┘   └─────────┘   └──────────┘
```

