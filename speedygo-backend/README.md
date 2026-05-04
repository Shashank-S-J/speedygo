# SpeedyGo 🚚⚡

> AI-powered goods transport platform — 10 Go microservices, NATS JetStream, PostgreSQL, Stripe, Didit KYC

## Quick Start

### Prerequisites
- [Go 1.22+](https://go.dev/dl/)
- [Docker & Docker Compose](https://docs.docker.com/get-docker/)

### 1. Start Infrastructure
```bash
docker compose up -d postgres redis nats
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your API keys (Stripe, Groq, Didit, etc.)
```

### 3. Run the Gateway
```bash
go run ./cmd/gateway
```

The API will be available at `http://localhost:8080`

### 4. Health Check
```bash
curl http://localhost:8080/health
```

---

## Architecture

```
Client Apps → API Gateway (Fiber) → Microservices → PostgreSQL/Redis/NATS
                  ↓
         JWT + Rate Limiting
         + Circuit Breaker
```

### Services
| Service | Description |
|---------|------------|
| **Gateway** | API entry point, JWT auth, rate limiting, CORS |
| **User** | Registration, login, profile management |
| **Booking** | Ride lifecycle, state machine, scheduling |
| **Vehicle** | Fleet management, geo search, GPS tracking |
| **Payment** | Stripe integration, escrow, refunds |
| **KYC** | Didit API + Sandbox.co.in + manual admin review |
| **Chat** | WebSocket rooms, media, moderation |
| **Report** | Bidirectional reporting, AI triage |
| **Admin** | User management, AI search, audit logs |
| **Tracking** | Real-time GPS via OSRM + Redis Geo |

### API Endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/auth/register` | None | Create account |
| POST | `/auth/login` | None | Login |
| GET | `/users/me/profile` | JWT | Get profile |
| PUT | `/users/me/profile` | JWT | Update profile |
| POST | `/kyc/submit` | JWT | Submit KYC docs |
| GET | `/kyc/status` | JWT | KYC status |
| POST | `/bookings` | JWT | Create booking |
| GET | `/bookings/my` | JWT | My bookings |
| PUT | `/bookings/:id/status` | JWT | Update status |
| PUT | `/bookings/:id/accept` | JWT+TRANSPORTER | Accept booking |
| GET | `/vehicles/nearby` | JWT | Find nearby vehicles |
| POST | `/payments/initiate` | JWT | Start payment |
| POST | `/payments/webhook` | Stripe-Sig | Stripe webhook |
| WS | `/chat/:bookingID` | JWT | Real-time chat |
| POST | `/reports` | JWT | File report |
| PUT | `/admin/users/:id/status` | ADMIN | Enable/disable user |
| GET | `/admin/reports` | ADMIN | View reports |

### Tech Stack
- **Language:** Go 1.22+
- **HTTP:** Fiber v2
- **Database:** PostgreSQL 16 + PostGIS
- **Cache:** Redis 7
- **Events:** NATS JetStream
- **Payments:** Stripe (test mode)
- **KYC:** Didit.me + Sandbox.co.in
- **AI:** Groq (LLama 3.3 70B)
- **Storage:** Cloudflare R2
- **Maps:** OSM + OSRM

## Project Structure

```
speedygo/
├── cmd/gateway/          # API Gateway entry point
├── internal/
│   ├── admin/            # Admin service
│   ├── booking/          # Booking service
│   ├── chat/             # Chat WebSocket service
│   ├── config/           # Configuration
│   ├── database/         # DB connection
│   ├── errors/           # Structured errors
│   ├── kyc/              # KYC verification
│   ├── logger/           # Structured logging
│   ├── middleware/        # JWT, CORS, rate limit
│   ├── models/           # GORM models
│   ├── natsbus/          # NATS JetStream wrapper
│   ├── payment/          # Stripe payment
│   ├── redisclient/      # Redis client
│   ├── report/           # Report system
│   ├── user/             # User auth & profile
│   └── vehicle/          # Vehicle fleet
├── migrations/           # SQL migrations
├── docker/               # Dockerfiles
├── docker-compose.yml
├── Makefile
└── .env
```

## License

MIT
