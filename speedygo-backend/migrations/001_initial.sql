-- SpeedyGo Initial Schema Migration
-- Run this against PostgreSQL 16+ with PostGIS extension

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==================== USERS ====================
CREATE TABLE IF NOT EXISTS users (
    id              BIGSERIAL PRIMARY KEY,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    email           TEXT UNIQUE NOT NULL,
    phone           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    role            VARCHAR(20) NOT NULL CHECK (role IN ('CUSTOMER','TRANSPORTER','ADMIN','SUPER_ADMIN')),
    status          VARCHAR(20) DEFAULT 'PENDING_KYC'
                    CHECK (status IN ('PENDING_KYC','KYC_REVIEW','ACTIVE','SUSPENDED','BANNED')),
    profile_photo   TEXT,
    fraud_score     FLOAT DEFAULT 0,
    warning_count   INT DEFAULT 0,
    fcm_token       TEXT,
    last_login_at   TIMESTAMPTZ,
    suspended_at    TIMESTAMPTZ,
    suspend_reason  TEXT
);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_deleted_at ON users(deleted_at);

-- ==================== KYC VERIFICATIONS ====================
CREATE TABLE IF NOT EXISTS kyc_verifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         BIGINT NOT NULL REFERENCES users(id),
    didit_session_id TEXT,
    aadhaar_verified BOOLEAN DEFAULT false,
    pan_verified    BOOLEAN DEFAULT false,
    dl_verified     BOOLEAN DEFAULT false,
    rc_verified     BOOLEAN DEFAULT false,
    doc_urls        JSONB,
    ai_risk_score   FLOAT DEFAULT 0,
    ai_flags        JSONB,
    status          VARCHAR(20) DEFAULT 'PENDING',
    admin_id        BIGINT,
    admin_note      TEXT,
    verified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_kyc_user ON kyc_verifications(user_id);

-- ==================== VEHICLES ====================
CREATE TABLE IF NOT EXISTS vehicles (
    id              BIGSERIAL PRIMARY KEY,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    owner_id        BIGINT NOT NULL REFERENCES users(id),
    type            VARCHAR(20) NOT NULL,
    registration_no TEXT UNIQUE NOT NULL,
    make            TEXT,
    model_name      TEXT,
    year            INT,
    max_weight_kg   FLOAT NOT NULL,
    length_ft       FLOAT,
    width_ft        FLOAT,
    height_ft       FLOAT,
    photos          JSONB,
    insurance_expiry TIMESTAMPTZ,
    rc_verified     BOOLEAN DEFAULT false,
    is_active       BOOLEAN DEFAULT true,
    current_lat     FLOAT DEFAULT 0,
    current_lng     FLOAT DEFAULT 0,
    last_gps_update TIMESTAMPTZ
);

-- ==================== BOOKINGS ====================
CREATE TABLE IF NOT EXISTS bookings (
    id              BIGSERIAL PRIMARY KEY,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    customer_id     BIGINT NOT NULL REFERENCES users(id),
    transporter_id  BIGINT REFERENCES users(id),
    vehicle_id      BIGINT REFERENCES vehicles(id),
    status          VARCHAR(20) DEFAULT 'PENDING',
    pickup_lat      FLOAT NOT NULL,
    pickup_lng      FLOAT NOT NULL,
    pickup_address  TEXT NOT NULL,
    pickup_contact  TEXT,
    drop_lat        FLOAT NOT NULL,
    drop_lng        FLOAT NOT NULL,
    drop_address    TEXT NOT NULL,
    drop_contact    TEXT,
    goods_description TEXT,
    goods_weight_kg FLOAT,
    goods_fragile   BOOLEAN DEFAULT false,
    goods_photos    JSONB,
    distance_km     FLOAT,
    estimated_price BIGINT,
    final_price     BIGINT,
    currency        VARCHAR(5) DEFAULT 'INR',
    scheduled_at    TIMESTAMPTZ,
    picked_up_at    TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    cancelled_by    BIGINT,
    cancel_reason   TEXT,
    pickup_photos   JSONB,
    delivery_photos JSONB,
    customer_rating FLOAT,
    transporter_rating FLOAT,
    payment_intent_id TEXT,
    payment_status  VARCHAR(20) DEFAULT 'UNPAID',
    version         INT DEFAULT 1
);
CREATE INDEX idx_bookings_customer ON bookings(customer_id);
CREATE INDEX idx_bookings_transporter ON bookings(transporter_id);
CREATE INDEX idx_bookings_status ON bookings(status);

-- ==================== MESSAGES (immutable) ====================
CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id      BIGINT NOT NULL,
    sender_id       BIGINT NOT NULL,
    type            VARCHAR(20) NOT NULL,
    content         TEXT NOT NULL,
    content_hash    TEXT,
    status          VARCHAR(20) DEFAULT 'sent',
    flagged         BOOLEAN DEFAULT false,
    flag_reason     TEXT,
    client_uuid     TEXT UNIQUE,
    created_at      TIMESTAMPTZ DEFAULT now()
    -- NO updated_at or deleted_at: messages are immutable
);
CREATE INDEX idx_messages_booking ON messages(booking_id, created_at);

-- ==================== REPORTS ====================
CREATE TABLE IF NOT EXISTS reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id     BIGINT NOT NULL REFERENCES users(id),
    reported_id     BIGINT NOT NULL REFERENCES users(id),
    booking_id      BIGINT NOT NULL,
    type            VARCHAR(30) NOT NULL,
    category        VARCHAR(30) NOT NULL,
    description     TEXT,
    evidence_urls   JSONB,
    ai_severity     FLOAT DEFAULT 0,
    ai_tags         JSONB,
    status          VARCHAR(20) DEFAULT 'PENDING',
    resolution      VARCHAR(20),
    admin_id        BIGINT,
    admin_note      TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_reports_reporter ON reports(reporter_id);
CREATE INDEX idx_reports_reported ON reports(reported_id);

-- ==================== PAYMENTS ====================
CREATE TABLE IF NOT EXISTS payments (
    id              BIGSERIAL PRIMARY KEY,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    booking_id      BIGINT NOT NULL UNIQUE,
    customer_id     BIGINT NOT NULL,
    transporter_id  BIGINT NOT NULL,
    amount_paise    BIGINT NOT NULL,
    currency        VARCHAR(5) DEFAULT 'INR',
    stripe_payment_id TEXT UNIQUE,
    stripe_client_secret TEXT,
    status          VARCHAR(20) DEFAULT 'UNPAID',
    escrow_released_at TIMESTAMPTZ,
    refunded_at     TIMESTAMPTZ,
    refund_amount_paise BIGINT DEFAULT 0,
    refund_reason   TEXT
);

-- ==================== AUDIT LOG (immutable) ====================
CREATE TABLE IF NOT EXISTS audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id        BIGINT NOT NULL,
    action          TEXT NOT NULL,
    target_id       BIGINT,
    target_type     TEXT,
    reason          TEXT,
    metadata        JSONB,
    ip_address      TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
    -- NO updated_at: audit logs are immutable
);
CREATE INDEX idx_audit_admin ON audit_logs(admin_id);

-- ==================== SEED ADMIN USER ====================
-- Password: admin123 (bcrypt hash)
INSERT INTO users (email, phone, password_hash, full_name, role, status)
VALUES (
    'admin@speedygo.in',
    '+919999999999',
    '$2a$12$LJ3m4ys3Lgx/ByBjMBeiB.6V8Zl5KY0Kx5v3qVZ0wN8Y5q8A5fKy',
    'SpeedyGo Admin',
    'SUPER_ADMIN',
    'ACTIVE'
) ON CONFLICT (email) DO NOTHING;
