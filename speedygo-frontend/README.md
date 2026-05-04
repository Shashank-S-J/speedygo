# SpeedyGo Frontend

A pnpm + Turborepo monorepo with three Next.js 15 apps for the SpeedyGo goods transport platform.

## Structure

```
speedygo-frontend/
├── apps/
│   ├── customer/       → Customer PWA (port 3000) — book shipments, track, pay, chat
│   ├── transporter/    → Transporter PWA (port 3001) — accept jobs, GPS publish, earnings
│   └── admin/          → Admin Dashboard (port 3002) — users, KYC, reports, SOS, AI
├── packages/
│   ├── types/          → Shared TypeScript types matching Go backend models
│   ├── api-client/     → Typed axios services for all 80+ API endpoints
│   ├── ws-client/      → WebSocket clients (Chat, GPS Publish, GPS Watch)
│   └── config/         → Shared tsconfig presets
```

## Quick Start

### Prerequisites
- Node.js 18+
- pnpm (`npm install -g pnpm`)
- SpeedyGo backend running at `http://localhost:8080`
- (Optional) Stripe publishable key for payment testing

### Install

```bash
pnpm install
```

### Configure

Copy `.env.local.example` → `.env.local` in each app:

**apps/customer/.env.local**
```
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_STRIPE_PK=pk_test_...
```

**apps/transporter/.env.local** and **apps/admin/.env.local**
```
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### Run all apps

```bash
pnpm dev
```

Or individually:

```bash
pnpm dev:customer      # http://localhost:3000
pnpm dev:transporter   # http://localhost:3001
pnpm dev:admin         # http://localhost:3002
```

## Apps

### Customer PWA (`/apps/customer`)
- 🔐 Register / Login with OTP email verification
- 📦 Create bookings with live price estimation
- 🗺️ Address autocomplete (Nominatim / backend geocode)
- 💰 Stripe payment integration
- 📡 Live GPS tracking via WebSocket
- 💬 Real-time chat with transporter
- ⭐ Rate completed trips
- 🚨 SOS emergency trigger (2-second hold)
- 🪪 KYC document submission

### Transporter PWA (`/apps/transporter`)
- 🔐 Register / Login with TRANSPORTER role
- 🗺️ Browse nearby jobs with radius slider
- 🤝 Accept PENDING jobs or place bids on BIDDING jobs
- 📡 GPS broadcasting via WebSocket (every 4s)
- 💬 Chat with customers
- 📊 Earnings dashboard with monthly chart
- 🚚 Vehicle management (add/view)
- 🪪 KYC document submission

### Admin Dashboard (`/apps/admin`)
- 📊 Platform overview — users, bookings, revenue, safety metrics
- 👥 User management — search, suspend, ban, enable
- 🪪 KYC review queue — approve/reject with admin notes
- 📋 Reports management — resolve with categorized actions
- 🚨 SOS alerts — live queue with resolve/false alarm actions
- 🤖 AI query interface (Groq LLM natural language queries)
- 📜 Audit logs with filtering

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5 |
| State | Zustand 5 (client) + TanStack Query 5 (server) |
| Styling | Tailwind CSS 3 |
| Maps | MapLibre GL JS 4 |
| Payments | Stripe.js + @stripe/react-stripe-js |
| Real-time | Native WebSocket (with exponential backoff reconnect) |
| Charts | Recharts |
| Forms | React Hook Form + Zod |
| HTTP | Axios (with JWT interceptors) |
| Monorepo | pnpm workspaces + Turborepo |

## WebSocket Architecture

### Chat (`WS /chat/:bookingID`)
- Connects when booking is ACCEPTED/PICKING_UP/IN_TRANSIT
- Messages deduplicated via `client_uuid` (crypto.randomUUID)
- `?since=ISO8601` param for missed message replay on reconnect
- Read-only during DISPUTED status

### GPS Watch (`WS /track/watch/:bookingID`) — Customer
- Receives real-time vehicle location updates
- Last known location shown if signal lost >15s
- Falls back to polling `/map/eta` if WebSocket disconnects

### GPS Publish (`WS /track/publish/:vehicleID`) — Transporter
- Broadcasts location every 4 seconds while booking is active
- Uses `navigator.geolocation.watchPosition` (high accuracy)
- Silently drops (0,0) coordinates
- Falls back to `PUT /map/location` if WebSocket is down

## API Integration Pattern

```typescript
// All API calls go through typed service functions
const booking = await bookingService.getById(123);

// TanStack Query for React components
const { data } = useQuery({
  queryKey: ['booking', id],
  queryFn: () => bookingService.getById(id),
  refetchInterval: 5000, // live updates for active bookings
});

// Optimistic updates with rollback on 409
useMutation({
  mutationFn: updateStatus,
  onMutate: async (vars) => {
    await qc.cancelQueries(['booking', id]);
    const prev = qc.getQueryData(['booking', id]);
    qc.setQueryData(['booking', id], old => ({ ...old, status: vars.status }));
    return { prev };
  },
  onError: (err, vars, ctx) => qc.setQueryData(['booking', id], ctx.prev),
});
```

## Type Safety

All TypeScript types in `packages/types` exactly mirror the Go backend models:

```typescript
import { Booking, BookingStatus, User, Bid } from '@speedygo/types';
```

## Build

```bash
pnpm build          # Build all apps and packages
pnpm type-check     # TypeScript check across monorepo
pnpm lint           # ESLint across monorepo
```

