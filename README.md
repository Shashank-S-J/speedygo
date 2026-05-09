# 🚚 SpeedyGo — Real-Time Goods Transport Platform

> A production-grade, full-stack platform connecting customers with transporters for on-demand goods delivery — built with Go microservices on the backend and Next.js PWAs on the frontend.

---

## 📌 Table of Contents

- [Project Overview](#-project-overview)
- [Architecture](#️-system-architecture)
- [Tech Stack](#-tech-stack)
- [Microservices Breakdown](#-backend-microservices)
- [Frontend Apps](#-frontend-apps)
- [Key Features](#-key-features)
- [API Reference](#-api-reference-highlights)
- [WebSocket Architecture](#-real-time-websocket-design)
- [Getting Started](#-getting-started)
- [Project Structure](#-project-structure)
- [Design Decisions](#-design-decisions--engineering-highlights)

---

## 🧭 Project Overview

SpeedyGo is a **full-stack, real-time transport marketplace** — think Uber, but for goods. It handles the complete lifecycle of a delivery booking:

```
Customer books → Transporter accepts → Live GPS tracking → Payment released → Rating
```

The platform is built around **10 Go microservices** communicating over **NATS JetStream**, backed by **PostgreSQL + PostGIS** for geo queries, **Redis** for caching and real-time state, and **three separate Next.js PWAs** for customers, transporters, and admins.

### Who uses it?
| Role | App | What they do |
|------|-----|--------------|
| **Customer** | `apps/customer` (port 3000) | Book shipments, pay, track live GPS, chat, rate |
| **Transporter** | `apps/transporter` (port 3001) | Accept jobs, broadcast GPS, manage earnings |
| **Admin** | `apps/admin` (port 3002) | Manage users, review KYC, resolve SOS & reports |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Client Layer                        │
│   Customer PWA     Transporter PWA      Admin Dashboard  │
│   (Next.js 15)      (Next.js 15)        (Next.js 15)    │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP + WebSocket
                         ▼
┌─────────────────────────────────────────────────────────┐
│               API Gateway (Go + Fiber v2)                │
│      JWT Auth │ Rate Limiting │ Circuit Breaker │ CORS   │
└──────┬────────┬───────┬───────┬────────┬────────┬───────┘
       │        │       │       │        │        │
       ▼        ▼       ▼       ▼        ▼        ▼
   [User]  [Booking] [Vehicle] [Payment] [KYC]  [Chat]
   [Admin] [Report]  [Tracking]
       │        │       │       │        │        │
       └────────┴───────┴───┬───┴────────┴────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        PostgreSQL        Redis        NATS
        + PostGIS       (Cache +     JetStream
       (Primary DB)    Geo State)   (Event Bus)
```

**Pattern:** Each internal service is an independent Go package with its own handler, service, and repository layers. Services communicate both directly (via shared function calls within the monolith gateway) and asynchronously (via NATS JetStream for events like booking state changes and payment webhooks).

---

## 🛠️ Tech Stack

### Backend

| Category | Technology | Why |
|----------|-----------|-----|
| Language | **Go 1.22** | Performance, concurrency, strong typing |
| HTTP Framework | **Fiber v2** | Fast, Express-like ergonomics |
| Database | **PostgreSQL 16 + PostGIS** | Relational integrity + geo-spatial queries |
| Cache / Pub-Sub | **Redis 7** | Session state, rate limiting, geo coords |
| Message Broker | **NATS JetStream** | Durable async events between services |
| Payments | **Stripe** (test mode) | Escrow, refunds, webhook verification |
| KYC | **Didit.me + Sandbox.co.in** | Identity verification pipeline |
| AI | **Groq (LLaMA 3.3 70B)** | Admin natural-language query interface |
| Storage | **Cloudflare R2** | Document and media uploads |
| Maps / Routing | **OSM + OSRM** | Open-source geocoding and ETA calculation |
| ORM | **GORM** | Type-safe DB access with migrations |

### Frontend

| Category | Technology | Why |
|----------|-----------|-----|
| Framework | **Next.js 15** (App Router) | SSR, PWA capabilities, file-based routing |
| Language | **TypeScript 5** | End-to-end type safety |
| State (client) | **Zustand 5** | Lightweight global state |
| State (server) | **TanStack Query 5** | Caching, polling, optimistic updates |
| Styling | **Tailwind CSS 3** | Utility-first, consistent design |
| Maps | **MapLibre GL JS 4** | Open-source interactive maps |
| Real-time | **Native WebSocket** | Chat and GPS — with exponential backoff |
| Forms | **React Hook Form + Zod** | Typed validation, minimal re-renders |
| HTTP | **Axios** | JWT interceptors, typed API calls |
| Charts | **Recharts** | Earnings dashboard |
| Payments | **Stripe.js + React Stripe** | Secure client-side payment flow |
| Monorepo | **pnpm + Turborepo** | Fast installs, parallel builds |

---

## 🔧 Backend Microservices

Each service is a self-contained Go package under `internal/`:

| Service | Responsibility |
|---------|---------------|
| **Gateway** | Entry point — JWT auth, rate limiting, CORS, circuit breaker, routing |
| **User** | Registration, OTP email verification, login, profile CRUD |
| **Booking** | Full ride lifecycle state machine (PENDING → ACCEPTED → IN_TRANSIT → COMPLETED) |
| **Vehicle** | Fleet management, geo-search for nearby vehicles, GPS updates |
| **Payment** | Stripe integration — escrow on booking, release on completion, refunds |
| **KYC** | Document submission pipeline — Didit API + Sandbox.co.in + manual admin review |
| **Chat** | WebSocket-based rooms per booking, media support, moderation |
| **Report** | Bidirectional reporting (customer ↔ transporter), AI triage via Groq |
| **Admin** | User management, AI-powered natural language search, audit logs |
| **Tracking** | Real-time GPS publish/subscribe via Redis Geo + OSRM ETA calculation |

### Booking State Machine

```
PENDING ──► BIDDING ──► ACCEPTED ──► PICKING_UP ──► IN_TRANSIT ──► COMPLETED
   │                                                                      │
   └──────────────────────────────────────────────────────────────► CANCELLED
                                                                    DISPUTED
```

---

## 🖥️ Frontend Apps

### Shared Infrastructure (Monorepo Packages)

```
packages/
├── types/        → TypeScript types mirroring Go backend models exactly
├── api-client/   → Typed Axios service functions for all 80+ endpoints
├── ws-client/    → WebSocket clients: Chat, GPS Publish, GPS Watch
└── config/       → Shared tsconfig presets
```

### Customer PWA (`apps/customer` — port 3000)

- OTP-based registration and login
- Booking creation with live price estimation and address autocomplete (Nominatim)
- Stripe payment integration
- **Live GPS tracking** via WebSocket (falls back to REST polling if disconnected)
- Real-time chat with transporter
- SOS emergency trigger (2-second hold gesture)
- KYC document submission
- Trip rating after completion

### Transporter PWA (`apps/transporter` — port 3001)

- Browse nearby jobs with adjustable radius slider
- Accept fixed-price jobs or **place bids** on BIDDING bookings
- **GPS broadcasting** via WebSocket every 4 seconds (drops (0,0) silently)
- Real-time chat with customer
- Earnings dashboard with monthly Recharts chart
- Vehicle management

### Admin Dashboard (`apps/admin` — port 3002)

- Platform overview metrics — users, bookings, revenue, safety
- User management — search, suspend, ban
- KYC review queue — approve/reject with notes
- Report resolution with categorized actions
- **Live SOS alert queue** — resolve or mark as false alarm
- **AI query interface** — natural language queries via Groq LLM
- Audit logs with filtering

---

## ✨ Key Features

### Real-Time GPS Tracking
- Transporter broadcasts location every 4s via WebSocket (`/track/publish/:vehicleID`)
- Customer watches live updates (`/track/watch/:bookingID`)
- Last known location shown if signal lost >15s
- Falls back gracefully to `PUT /map/location` REST endpoint

### WebSocket Chat
- Per-booking chat rooms (`/chat/:bookingID`)
- Message deduplication via `crypto.randomUUID` (`client_uuid`)
- `?since=ISO8601` for missed message replay on reconnect
- Read-only mode during DISPUTED status

### Payment Escrow Flow
```
Customer pays → Stripe holds in escrow → Booking completes → Released to transporter
                                       → Dispute filed → Admin review → Refund or release
```

### KYC Pipeline
1. User submits documents via `/kyc/submit`
2. Automated check via Didit.me + Sandbox.co.in
3. Manual admin review queue for edge cases
4. Status reflected across all apps in real time

### AI Admin Search
Admins can query the platform in plain English — powered by Groq's LLaMA 3.3 70B model — to find users, analyze booking patterns, or triage reports.

---

## 📡 API Reference Highlights

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/auth/register` | None | Create account |
| `POST` | `/auth/login` | None | Login + JWT |
| `GET` | `/users/me/profile` | JWT | Get own profile |
| `POST` | `/bookings` | JWT | Create booking |
| `GET` | `/bookings/my` | JWT | List my bookings |
| `PUT` | `/bookings/:id/status` | JWT | Update booking status |
| `PUT` | `/bookings/:id/accept` | JWT + TRANSPORTER | Accept a job |
| `GET` | `/vehicles/nearby` | JWT | Find nearby transporters |
| `POST` | `/payments/initiate` | JWT | Start Stripe payment |
| `POST` | `/payments/webhook` | Stripe-Sig | Stripe event handler |
| `POST` | `/kyc/submit` | JWT | Submit KYC documents |
| `WS` | `/chat/:bookingID` | JWT | Real-time chat |
| `WS` | `/track/watch/:bookingID` | JWT | Watch GPS (customer) |
| `WS` | `/track/publish/:vehicleID` | JWT | Broadcast GPS (transporter) |
| `GET` | `/admin/reports` | ADMIN | View all reports |
| `PUT` | `/admin/users/:id/status` | ADMIN | Enable / disable user |

---

## 🔌 Real-Time WebSocket Design

All three WebSocket clients use **exponential backoff reconnection** and are stateless — they replay missed state on reconnect.

```
Reconnect delay: 1s → 2s → 4s → 8s → ... → max 30s
```

### API Integration Pattern (Frontend)

```typescript
// Typed service calls
const booking = await bookingService.getById(123);

// TanStack Query with live polling
const { data } = useQuery({
  queryKey: ['booking', id],
  queryFn: () => bookingService.getById(id),
  refetchInterval: 5000,
});

// Optimistic updates with rollback on conflict (409)
useMutation({
  mutationFn: updateStatus,
  onMutate: async (vars) => {
    const prev = qc.getQueryData(['booking', id]);
    qc.setQueryData(['booking', id], old => ({ ...old, status: vars.status }));
    return { prev };
  },
  onError: (err, vars, ctx) => qc.setQueryData(['booking', id], ctx.prev),
});
```

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version |
|------|---------|
| Go | 1.22+ |
| Node.js | 18+ |
| pnpm | latest (`npm install -g pnpm`) |
| Docker & Docker Compose | latest |

### 1. Start Infrastructure

```bash
docker compose up -d postgres redis nats
```

### 2. Configure Backend

```bash
cp .env.example .env
# Fill in: Stripe keys, Groq API key, Didit credentials, Cloudflare R2, SMTP
```

### 3. Start the API Gateway

```bash
go run ./cmd/gateway
# → http://localhost:8080
```

### 4. Health Check

```bash
curl http://localhost:8080/health
```

### 5. Start Frontend Apps

```bash
cd speedygo-frontend
pnpm install

# Configure each app
cp apps/customer/.env.local.example apps/customer/.env.local
cp apps/transporter/.env.local.example apps/transporter/.env.local
cp apps/admin/.env.local.example apps/admin/.env.local

# Run all three apps in parallel
pnpm dev
```

| App | URL |
|-----|-----|
| Customer PWA | http://localhost:3000 |
| Transporter PWA | http://localhost:3001 |
| Admin Dashboard | http://localhost:3002 |

### Environment Variables Summary

**Backend (`.env`)**
```env
DATABASE_URL=postgres://...
REDIS_URL=redis://localhost:6379
NATS_URL=nats://localhost:4222
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
GROQ_API_KEY=gsk_...
DIDIT_API_KEY=...
CLOUDFLARE_R2_...=...
JWT_SECRET=...
```

**Frontend (`apps/customer/.env.local`)**
```env
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_STRIPE_PK=pk_test_...
```

---

## 📁 Project Structure

```
speedygo/                          ← Backend (Go)
├── cmd/gateway/                   # App entry point
├── internal/
│   ├── admin/                     # Admin service
│   ├── booking/                   # Booking lifecycle
│   ├── chat/                      # WebSocket chat
│   ├── config/                    # Configuration
│   ├── database/                  # DB connection + migrations
│   ├── errors/                    # Structured error types
│   ├── kyc/                       # KYC verification
│   ├── logger/                    # Structured logging
│   ├── middleware/                 # JWT, CORS, rate limiting
│   ├── models/                    # GORM models
│   ├── natsbus/                   # NATS JetStream wrapper
│   ├── payment/                   # Stripe integration
│   ├── redisclient/               # Redis client
│   ├── report/                    # Report system
│   ├── tracking/                  # GPS + OSRM
│   ├── user/                      # Auth & profile
│   └── vehicle/                   # Fleet management
├── migrations/                    # SQL migration files
├── docker-compose.yml
└── .env

speedygo-frontend/                 ← Frontend (Next.js)
├── apps/
│   ├── customer/                  # Customer PWA (port 3000)
│   ├── transporter/               # Transporter PWA (port 3001)
│   └── admin/                     # Admin Dashboard (port 3002)
├── packages/
│   ├── types/                     # Shared TypeScript types
│   ├── api-client/                # Typed API service functions
│   ├── ws-client/                 # WebSocket client abstractions
│   └── config/                    # Shared tsconfig
└── turbo.json
```

---

## 🧠 Design Decisions & Engineering Highlights

### Why a Monorepo for the Frontend?
Three separate apps (customer, transporter, admin) share types and API clients. A pnpm + Turborepo monorepo means one `pnpm install`, shared TypeScript types that mirror Go structs exactly, and parallel builds — no drift between what the backend sends and what the frontend expects.

### Why NATS JetStream over direct service calls?
Booking state changes (e.g., payment confirmed → booking ACCEPTED) need to be durable. If a service is momentarily down, the event must not be lost. JetStream provides persistent, at-least-once delivery without a heavy Kafka setup.

### Why PostGIS?
Nearby vehicle search (`GET /vehicles/nearby`) uses geospatial indexing. A standard JSONB lat/lng column with a `WHERE` clause wouldn't scale — PostGIS geo indexes make radius queries fast.

### Optimistic Updates with Conflict Handling
The frontend mutates TanStack Query cache immediately on user action (e.g., accepting a job), then rolls back automatically if the backend returns a 409 (e.g., job already taken). This makes the UI feel instant while remaining consistent.

### WebSocket Resilience
All three WS clients (chat, GPS publish, GPS watch) reconnect with exponential backoff. Chat replays missed messages via `?since=ISO8601`. GPS falls back to REST `PUT /map/location` if the WS is down, so transporters never silently disappear from the map.

---

## 🔒 Security Considerations

- JWT-based auth with role enforcement (CUSTOMER / TRANSPORTER / ADMIN) at the gateway
- Stripe webhook signature verification (`Stripe-Signature` header)
- Rate limiting on all public endpoints via Redis
- KYC required before a transporter can accept jobs
- SOS alerts monitored in real time by admins
- Audit logs for all admin actions

---

## 📄 License

MIT — see [LICENSE](./LICENSE)
