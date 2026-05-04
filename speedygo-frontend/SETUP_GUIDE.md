# SpeedyGo Frontend — Complete Setup Guide

> **Last updated:** April 2026  
> A step-by-step guide to install every prerequisite, configure the environment, and run all three SpeedyGo frontend apps locally.

---

## Table of Contents

1. [Prerequisites (Software Installation)](#1-prerequisites)
2. [Clone the Repository](#2-clone-the-repository)
3. [Install Dependencies](#3-install-dependencies)
4. [Environment Configuration](#4-environment-configuration)
5. [Start the Backend First](#5-start-the-backend-first)
6. [Running the Frontend Apps](#6-running-the-frontend-apps)
7. [Verify Everything Works](#7-verify-everything-works)
8. [Project Architecture](#8-project-architecture)
9. [All Features Checklist](#9-all-features-checklist)
10. [Shared Packages Explained](#10-shared-packages)
11. [Build for Production](#11-build-for-production)
12. [Available Scripts](#12-available-scripts)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Prerequisites

### 1.1 Node.js (v18 or higher)

- **Download:** https://nodejs.org/en/download/
- **Windows:** Download the `.msi` installer (LTS recommended).
- **Verify:**
  ```bash
  node --version
  # Expected: v18.x.x or higher
  ```

### 1.2 pnpm (Package Manager)

pnpm is required — the project uses pnpm workspaces.

```bash
npm install -g pnpm
```

- **Verify:**
  ```bash
  pnpm --version
  # Expected: 10.x.x
  ```

> **Note:** The project specifies `pnpm@10.33.2` in `packageManager`. If you have a different version, pnpm will handle it automatically via Corepack, or you can install the exact version:
> ```bash
> npm install -g pnpm@10.33.2
> ```

### 1.3 Git

- **Download:** https://git-scm.com/downloads
- **Verify:**
  ```bash
  git --version
  ```

### 1.4 (Optional) Corepack

Node.js 18+ ships with Corepack. Enable it so the correct pnpm version is used automatically:

```bash
corepack enable
```

---

## 2. Clone the Repository

```bash
git clone <your-repo-url> speedygo-frontend
cd speedygo-frontend
```

---

## 3. Install Dependencies

From the **root** of the frontend monorepo:

```bash
pnpm install
```

This installs dependencies for:
- Root workspace (Turborepo, TypeScript, Prettier)
- All 3 apps (`customer`, `transporter`, `admin`)
- All 6 shared packages (`types`, `api-client`, `ws-client`, `map`, `ui`, `three-scene`, `config`)

---

## 4. Environment Configuration

Each app needs a `.env.local` file. Create them as follows:

### 4.1 Customer App (`apps/customer/.env.local`)

```env
# Backend API URL (must be running)
NEXT_PUBLIC_API_URL=http://localhost:8080

# Stripe Publishable Key (for payment integration)
# Get from https://dashboard.stripe.com/test/apikeys
NEXT_PUBLIC_STRIPE_PK=pk_test_xxxxxxxxxxxxxxxxxxxx
```

### 4.2 Transporter App (`apps/transporter/.env.local`)

```env
# Backend API URL (must be running)
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### 4.3 Admin App (`apps/admin/.env.local`)

```env
# Backend API URL (must be running)
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### Environment Variables Reference

| Variable | Used In | Required? | Description |
|----------|---------|-----------|-------------|
| `NEXT_PUBLIC_API_URL` | All apps | ✅ Yes | Backend API URL. Defaults to `http://localhost:8080` if not set |
| `NEXT_PUBLIC_STRIPE_PK` | Customer only | ⚠️ For payments | Stripe publishable key (starts with `pk_test_`) |

---

## 5. Start the Backend First

The frontend apps connect to the SpeedyGo backend API. Make sure it's running before starting the frontend.

```bash
# In the backend directory:
cd speedygo-backend

# Start infrastructure
docker compose up -d postgres redis nats

# Start the API gateway
go run ./cmd/gateway
```

Verify the backend is running:
```bash
curl http://localhost:8080/health
# Should return: {"status":"ok","service":"speedygo-gateway",...}
```

> See `SETUP_GUIDE.md` in the backend directory for full backend setup instructions.

---

## 6. Running the Frontend Apps

### Option A: Run ALL apps simultaneously

```bash
pnpm dev
```

This starts all three apps via Turborepo:

| App | URL | Description |
|-----|-----|-------------|
| **Customer** | http://localhost:3000 | Customer-facing PWA |
| **Transporter** | http://localhost:3001 | Transporter-facing PWA |
| **Admin** | http://localhost:3002 | Admin dashboard |

### Option B: Run apps individually

```bash
# Customer app only
pnpm dev:customer

# Transporter app only
pnpm dev:transporter

# Admin app only
pnpm dev:admin
```

### Option C: Run from app directory

```bash
cd apps/customer
pnpm dev
```

---

## 7. Verify Everything Works

### 7.1 Customer App (http://localhost:3000)

1. Open http://localhost:3000
2. You should see the landing/login page
3. Register a new account with role `CUSTOMER`
4. Complete OTP verification (check logs if Resend API key not configured)
5. Login and access the dashboard

### 7.2 Transporter App (http://localhost:3001)

1. Open http://localhost:3001
2. Register with role `TRANSPORTER`
3. Complete OTP + KYC verification
4. View nearby bookings and manage vehicles

### 7.3 Admin App (http://localhost:3002)

1. Open http://localhost:3002
2. Login with the seeded admin credentials:
   - **Email:** `admin@speedygo.in`
   - **Password:** `admin123`
3. Access the admin dashboard with all management panels

---

## 8. Project Architecture

### Monorepo Structure

```
speedygo-frontend/
├── package.json              ← Root workspace config
├── pnpm-workspace.yaml       ← Workspace packages definition
├── turbo.json                ← Turborepo pipeline config
│
├── apps/
│   ├── customer/             ← Next.js 15 (port 3000)
│   │   ├── app/              ← App Router pages & layouts
│   │   ├── components/       ← Customer-specific components
│   │   ├── store/            ← Zustand stores
│   │   └── .env.local        ← Environment variables
│   │
│   ├── transporter/          ← Next.js 15 (port 3001)
│   │   ├── app/              ← App Router pages & layouts
│   │   └── store/            ← Zustand stores
│   │
│   └── admin/                ← Next.js 15 (port 3002)
│       ├── app/              ← App Router pages & layouts
│       │   ├── (dashboard)/  ← Dashboard layout group
│       │   └── login/        ← Login page
│       └── store/            ← Zustand stores
│
└── packages/
    ├── types/                ← Shared TypeScript types (mirrors Go models)
    ├── api-client/           ← Typed Axios services for 80+ API endpoints
    ├── ws-client/            ← WebSocket clients (Chat, GPS Publish, GPS Watch)
    ├── map/                  ← Map utilities (MapLibre GL)
    ├── ui/                   ← Shared UI components (clsx + tailwind-merge)
    ├── three-scene/          ← Three.js 3D scenes
    └── config/               ← Shared tsconfig presets
```

### Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 15.3.1 |
| Language | TypeScript | 5.7+ |
| React | React | 19.x |
| State (Client) | Zustand | 5.x |
| State (Server) | TanStack React Query | 5.67+ |
| Styling | Tailwind CSS | 3.4+ |
| Maps | MapLibre GL JS | 4.7+ |
| Maps (React) | react-map-gl | 7.1+ |
| Payments | Stripe.js + @stripe/react-stripe-js | 5.5+ / 3.2+ |
| Charts | Recharts | 2.15+ |
| Forms | React Hook Form + Zod | 7.54+ / 3.24+ |
| Animations | Framer Motion | 11.18+ |
| HTTP Client | Axios | 1.7+ |
| Icons | Lucide React | 0.469+ |
| Date Utilities | date-fns | 4.1+ |
| 3D Graphics | Three.js | 0.170+ |
| Build | Turborepo | 2.3+ |
| Package Manager | pnpm | 10.33+ |

---

## 9. All Features Checklist

### Customer App (port 3000)

- [x] User registration with email + OTP verification
- [x] Login (password or OTP-based)
- [x] Forgot password / Reset password
- [x] Profile view and update
- [x] Profile photo upload
- [x] KYC document submission
- [x] KYC status tracking
- [x] Create booking with pickup/drop locations
- [x] Address autocomplete via geocoding
- [x] Live price estimation
- [x] View my bookings (all statuses)
- [x] Booking detail view
- [x] Stripe payment integration
- [x] View bids from transporters
- [x] Accept transporter bids
- [x] Live GPS tracking via WebSocket
- [x] Real-time chat with transporter (WebSocket)
- [x] Upload booking photos (pickup/delivery proof)
- [x] OTP verification for pickup/delivery
- [x] Rate completed trips
- [x] SOS emergency trigger (2-second hold)
- [x] Emergency contacts management
- [x] File reports against transporters
- [x] View nearby vehicles on map
- [x] Route visualization on map
- [x] Dashboard with booking history

### Transporter App (port 3001)

- [x] Registration with TRANSPORTER role
- [x] Login / OTP verification
- [x] Profile management
- [x] KYC document submission
- [x] Browse nearby available bookings
- [x] Radius-based job filtering
- [x] Accept PENDING bookings
- [x] Place bids on BIDDING bookings
- [x] GPS location broadcasting via WebSocket (every 4s)
- [x] Real-time chat with customers (WebSocket)
- [x] Vehicle registration (type, specs, photos)
- [x] Vehicle management (view, update, delete)
- [x] Vehicle location updates
- [x] Flag goods mismatch
- [x] Upload pickup/delivery photos
- [x] Verify pickup/delivery OTP
- [x] Complete bookings
- [x] Earnings dashboard with monthly charts
- [x] Filtered earnings reports
- [x] Set availability status
- [x] File reports against customers

### Admin Dashboard (port 3002)

- [x] Admin login (ADMIN / SUPER_ADMIN role)
- [x] Platform overview dashboard
  - Total users, bookings, revenue
  - Safety metrics
  - Daily bookings chart
  - Active transporters
  - User activity stats
- [x] User management
  - Search users
  - View user detail
  - Suspend / Ban / Enable users
  - Change user roles (SUPER_ADMIN only)
- [x] KYC review queue
  - View pending KYC submissions
  - Approve / Reject with admin notes
  - KYC history
- [x] Reports management
  - View pending reports
  - Resolve reports with actions
  - Ban queue approval
- [x] SOS alerts
  - View active SOS alerts
  - Resolve / mark as false alarm
- [x] AI query interface
  - Natural language queries powered by Groq LLaMA
- [x] Audit logs with filtering
- [x] Vehicle approval queue
  - View pending vehicles
  - Approve / Reject vehicles
- [x] Pricing management
  - View current pricing
  - Update pricing
- [x] Admin management (SUPER_ADMIN only)
  - View all admins
  - Create new admins
  - Delete admins

### Shared Packages

- [x] **@speedygo/types** — All TypeScript types matching Go backend models
- [x] **@speedygo/api-client** — Typed Axios services for all 80+ API endpoints with JWT interceptors, auto token refresh, and error handling
- [x] **@speedygo/ws-client** — WebSocket clients:
  - ChatClient (real-time messaging, dedup via `client_uuid`)
  - GPSPublishClient (transporter location broadcasting)
  - GPSWatchClient (customer live tracking)
- [x] **@speedygo/map** — Map utilities for MapLibre GL
- [x] **@speedygo/ui** — Shared UI components with `clsx` + `tailwind-merge`
- [x] **@speedygo/three-scene** — Three.js 3D animated scenes
- [x] **@speedygo/config** — Shared TypeScript configuration presets

### WebSocket Features

- [x] Chat: deduplication via `client_uuid` (crypto.randomUUID)
- [x] Chat: `?since=ISO8601` for missed message replay on reconnect
- [x] Chat: read-only during DISPUTED booking status
- [x] GPS Watch: last known location shown if signal lost >15s
- [x] GPS Watch: fallback to polling `/map/eta` if WebSocket disconnects
- [x] GPS Publish: broadcasts every 4 seconds during active booking
- [x] GPS Publish: uses `navigator.geolocation.watchPosition` (high accuracy)
- [x] GPS Publish: silently drops (0,0) coordinates
- [x] GPS Publish: fallback to `PUT /map/location` if WebSocket is down
- [x] All: exponential backoff reconnection

---

## 10. Shared Packages

### @speedygo/types

TypeScript types that exactly mirror Go backend models. Used across all apps.

```typescript
import { Booking, BookingStatus, User, Bid, Vehicle } from '@speedygo/types';
```

### @speedygo/api-client

Typed Axios client with JWT interceptors. Auto-refreshes expired access tokens.

```typescript
import { authService, bookingService, profileService } from '@speedygo/api-client';

// Login
const { token, refreshToken } = await authService.login({ email, password });

// Create booking
const booking = await bookingService.create({ pickupLat, pickupLng, ... });
```

Services available:
- `authService` — Register, login, OTP, refresh, logout, password reset
- `profileService` — Get/update profile, upload photo
- `bookingService` — CRUD, status updates, photos, OTP, nearby, estimate
- `bidService` — Place bid, get bids, accept bid
- `vehicleService` — CRUD, location, search, nearby
- `paymentService` — Initiate payment
- `chatService` — Get message history
- `mapService` — Geocode, reverse geocode, route, ETA, nearby transporters
- `kycService` — Submit KYC, get status
- `sosService` — Trigger SOS, manage emergency contacts
- `reportService` — Create report
- `adminService` — User management, KYC review, reports, dashboard, AI query

### @speedygo/ws-client

Three WebSocket client classes with automatic reconnection:

```typescript
import { ChatClient, GPSPublishClient, GPSWatchClient } from '@speedygo/ws-client';
```

---

### Authentication & Token Handling (Frontend ↔ Backend)

All three apps implement the same token lifecycle pattern:

#### 1. Token Storage (Dual Strategy)

**Access tokens** are stored in Zustand persisted stores (localStorage) — needed for programmatic access (WebSocket `?token=` auth):
- `apps/customer/store/authStore.ts` → key: `speedygo-auth`
- `apps/transporter/store/authStore.ts` → key: `speedygo-transporter-auth`
- `apps/admin/store/authStore.ts` → key: `speedygo-admin-auth`

**Refresh tokens** are transported via two channels for defense-in-depth:
1. **HttpOnly cookie** (`refresh_token`, path `/auth`) — Set by the backend on login, verify-otp, and refresh. Cannot be read by JavaScript (XSS-safe). Sent automatically via `withCredentials: true`.
2. **localStorage** (via Zustand `persist`) — Fallback for backward compatibility. Sent in the request body to `/auth/refresh` and `/auth/logout`.

The backend accepts the refresh token from **either** the cookie or the request body, checking body first. This means:
- New clients with `withCredentials: true` automatically use the HttpOnly cookie
- Older clients still work by sending the token in the body
- If both are present, the body value takes precedence

#### 2. Auto-Refresh on 401

The `@speedygo/api-client` axios interceptor handles the full lifecycle:

1. **Request interceptor** — Attaches `Authorization: Bearer <access_token>` to every request.
2. **Response interceptor** — On 401 (not on `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`):
   - If already refreshing → queues the request until the new token arrives.
   - Otherwise, calls `POST /auth/refresh` with `{ refresh_token: "..." }` in the body AND `withCredentials: true` (sends HttpOnly cookie).
   - On success → stores new tokens via `onTokenRefreshed` callback, retries queued requests.
   - On failure → calls `onUnauthorized` callback (triggers logout + redirect to `/login`).

#### 3. Wiring (Required in each app's providers/store)

Each app **must** wire these four functions at startup:

```typescript
setTokenGetter(() => useAuthStore.getState().accessToken);
setOnUnauthorized(() => useAuthStore.getState().logout());
setRefreshTokenGetter(() => useAuthStore.getState().refreshToken);
setOnTokenRefreshed((accessToken, refreshToken) => {
  useAuthStore.setState({ accessToken, refreshToken });
});
```

All three apps (customer, transporter, admin) are properly wired via both the store module scope and `providers.tsx`.

#### 4. Logout Flow

On logout, the frontend:
1. Calls `POST /auth/logout` with `{ refresh_token: "..." }` in the body AND `withCredentials: true` (sends HttpOnly cookie) using raw axios (bypasses interceptors to avoid refresh loops). The backend blacklists both access + refresh tokens in Redis and deletes the token family. The endpoint works even if the access token is expired.
2. Clears the Zustand store (removes tokens from localStorage).
3. Clears the `speedygo-authenticated` cookie (used by Next.js middleware for server-side redirect).
4. Redirects to `/login`.

#### 5. Backend Token Security

- Access tokens signed with `JWT_SECRET`, refresh tokens signed with separate `JWT_REFRESH_SECRET`.
- Access and refresh tokens have a distinct `token_type` claim (`"access"` / `"refresh"`).
- The backend rejects refresh tokens used as access tokens (and vice versa).
- Refresh tokens are single-use (rotated on every refresh call) with **token family reuse detection**.
- If a consumed refresh token is replayed, ALL sessions for the user are immediately revoked (stolen token defense).
- Password changes/resets revoke all existing sessions.
- All security-critical Redis operations fail closed (503) when Redis is unavailable.

#### 6. Token Storage Security Architecture

**Refresh token (HttpOnly cookie):**
- Protected from XSS — JavaScript cannot read HttpOnly cookies
- `SameSite=Lax` prevents CSRF on state-mutating requests (POST/PUT/DELETE)
- `Secure` flag set in production (HTTPS only)
- Cookie path restricted to `/auth` (only sent to auth endpoints)

**Access token (localStorage):**
- Required in localStorage for WebSocket connections (`?token=...` query param)
- Short-lived (15 min) to limit exposure window
- Blacklisted on logout for immediate revocation

**Token family reuse detection:**
- Each login creates a UUID "family". All rotated refresh tokens share the same family ID.
- If an attacker replays a consumed refresh token, the system detects reuse and revokes the entire family + all user sessions.
- This catches the scenario where both the legitimate user and attacker compete to use the same refresh token.

#### 7. Race Condition Handling (Concurrent 401s)

When multiple API calls fail with 401 simultaneously:

1. **First 401** → Sets `isRefreshing = true`, calls `/auth/refresh`.
2. **Subsequent 401s** → Queue into `refreshSubscribers[]` (both resolve and reject callbacks).
3. **Refresh succeeds** → All queued requests retry with the new token.
4. **Refresh fails** → All queued requests get rejected, `onUnauthorized()` triggers logout.

This prevents the race condition where multiple simultaneous refreshes would blacklist tokens prematurely. Only one refresh call is ever in-flight at a time.

---

### @speedygo/three-scene

Three.js 3D animated scenes used for visual effects (e.g., landing pages, loading states).

### @speedygo/ui

Shared utility for combining Tailwind classes:

```typescript
import { cn } from '@speedygo/ui';
// cn('px-4', isActive && 'bg-blue-500') → merged tailwind classes
```

---

## 11. Build for Production

### Build all apps

```bash
pnpm build
```

This builds all three Next.js apps via Turborepo. Output goes to each app's `.next/` directory.

### Build a specific app

```bash
pnpm --filter @speedygo/customer build
pnpm --filter @speedygo/transporter build
pnpm --filter @speedygo/admin build
```

### Start production server

```bash
cd apps/customer && pnpm start    # port 3000
cd apps/transporter && pnpm start # port 3001
cd apps/admin && pnpm start       # port 3002
```

---

## 12. Available Scripts

### Root workspace scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all 3 apps in development mode |
| `pnpm build` | Build all apps and packages for production |
| `pnpm lint` | Run ESLint across all apps |
| `pnpm type-check` | TypeScript check across the monorepo |
| `pnpm dev:customer` | Start only the customer app (port 3000) |
| `pnpm dev:transporter` | Start only the transporter app (port 3001) |
| `pnpm dev:admin` | Start only the admin app (port 3002) |

### Per-app scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server with hot reload |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm type-check` | TypeScript type checking |

---

## 13. Troubleshooting

### "Module not found" errors for @speedygo/* packages

- Make sure you ran `pnpm install` from the **root** directory (not inside an app).
- Check that `pnpm-workspace.yaml` includes `'packages/*'`.

### "ECONNREFUSED localhost:8080" or API errors

- The backend is not running. Start it first (see [Step 5](#5-start-the-backend-first)).
- Check `NEXT_PUBLIC_API_URL` in your `.env.local` file.

### "Port 3000/3001/3002 already in use"

- Kill the process using the port:
  ```powershell
  # Find process on port 3000
  netstat -ano | findstr :3000
  # Kill it
  taskkill /PID <PID> /F
  ```

### pnpm version mismatch

- The project expects `pnpm@10.33.2`. Install it:
  ```bash
  npm install -g pnpm@10.33.2
  ```
- Or enable Corepack: `corepack enable`

### Stripe payments not working

- Ensure `NEXT_PUBLIC_STRIPE_PK` is set in `apps/customer/.env.local`
- Use a Stripe **test** publishable key (starts with `pk_test_`)
- The backend also needs `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`

### Maps not loading

- Maps use MapLibre GL with OpenStreetMap tiles
- The backend provides tile URLs via `GET /map/config`
- Ensure the backend is running and accessible

### WebSocket connections failing

- Check that the backend is running on the URL specified by `NEXT_PUBLIC_API_URL`
- WebSocket URLs are derived from `NEXT_PUBLIC_API_URL` (http → ws)
- Check browser console for connection errors

### TypeScript errors in packages

```bash
pnpm type-check
```

### Clear build cache

```bash
# Remove Turbo cache
rm -rf .turbo

# Remove Next.js caches
rm -rf apps/customer/.next
rm -rf apps/transporter/.next
rm -rf apps/admin/.next

# Reinstall
pnpm install
```

### Windows-specific: Long file paths

- Enable long paths in Windows:
  ```powershell
  # Run as Administrator
  New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
  ```

---

## Connection Architecture

```
┌──────────────────┐  ┌───────────────────┐  ┌──────────────────┐
│  Customer App    │  │  Transporter App  │  │   Admin App      │
│  :3000           │  │  :3001            │  │   :3002          │
│                  │  │                   │  │                  │
│  • Book rides    │  │  • Accept jobs    │  │  • Manage users  │
│  • Track GPS     │  │  • Publish GPS    │  │  • Review KYC    │
│  • Pay (Stripe)  │  │  • Place bids     │  │  • Handle reports│
│  • Chat (WS)    │  │  • Chat (WS)      │  │  • AI queries    │
│  • SOS trigger   │  │  • Earnings       │  │  • SOS alerts    │
└────────┬─────────┘  └────────┬──────────┘  └────────┬─────────┘
         │                     │                       │
         │    HTTP + WebSocket (REST + WS)             │
         └─────────────────────┼───────────────────────┘
                               │
                               ▼
                  ┌────────────────────────┐
                  │  SpeedyGo Backend API  │
                  │  :8080                 │
                  │                        │
                  │  Go + Fiber + GORM     │
                  │  JWT + Rate Limiting   │
                  └────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                 ▼
         PostgreSQL        Redis            NATS
          :5432            :6379            :4222
```

