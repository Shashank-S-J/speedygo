package models

import (
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// ==================== USER ====================

// UserRole represents the role of a user in the system.
type UserRole string

const (
	RoleCustomer    UserRole = "CUSTOMER"
	RoleTransporter UserRole = "TRANSPORTER"
	RoleAdmin       UserRole = "ADMIN"
	RoleSuperAdmin  UserRole = "SUPER_ADMIN"
)

// UserStatus represents the account status.
type UserStatus string

const (
	StatusPendingKYC UserStatus = "PENDING_KYC"
	StatusKYCReview  UserStatus = "KYC_REVIEW"
	StatusActive     UserStatus = "ACTIVE"
	StatusSuspended  UserStatus = "SUSPENDED"
	StatusBanned     UserStatus = "BANNED"
)

// User is the core user model for customers, transporters, and admins.
type User struct {
	gorm.Model
	Email             string         `gorm:"uniqueIndex;not null" json:"email"`
	Phone             string         `gorm:"uniqueIndex;not null" json:"phone"`
	PasswordHash      string         `gorm:"not null" json:"-"`
	FullName          string         `gorm:"not null" json:"full_name"`
	Role              UserRole       `gorm:"type:varchar(20);not null;index" json:"role"`
	Status            UserStatus     `gorm:"type:varchar(20);default:'PENDING_KYC'" json:"status"`
	ProfilePhoto      string         `json:"profile_photo,omitempty"`
	AvatarConfig      datatypes.JSON `gorm:"type:jsonb" json:"avatar_config,omitempty"`
	FraudScore        float64        `gorm:"default:0" json:"fraud_score"`
	WarningCount      int            `gorm:"default:0" json:"warning_count"`
	CancellationCount int            `gorm:"default:0" json:"cancellation_count"`
	FCMToken          string         `json:"-"`
	DeviceFingerprint string         `json:"-"`
	LastLoginAt       *time.Time     `json:"last_login_at,omitempty"`
	LastLoginIP       string         `json:"-"`
	SuspendedAt       *time.Time     `json:"suspended_at,omitempty"`
	SuspendReason     string         `json:"suspend_reason,omitempty"`
	IsAvailable       bool           `gorm:"default:true" json:"is_available"`
	AvgRating         *float64       `json:"avg_rating,omitempty"`
	TotalRatings      int            `gorm:"default:0" json:"total_ratings"`
}

// ==================== EMERGENCY CONTACT ====================

type EmergencyContact struct {
	gorm.Model
	UserID uint   `gorm:"not null;index" json:"user_id"`
	User   User   `gorm:"foreignKey:UserID" json:"-"`
	Name   string `gorm:"not null" json:"name"`
	Phone  string `gorm:"not null" json:"phone"`
	Email  string `json:"email,omitempty"`
}

// ==================== LOGIN ATTEMPT ====================

type LoginAttempt struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Email     string    `gorm:"not null;index" json:"email"`
	IP        string    `gorm:"not null" json:"ip"`
	UserAgent string    `json:"user_agent"`
	Success   bool      `gorm:"default:false" json:"success"`
	CreatedAt time.Time `json:"created_at"`
}

// ==================== KYC ====================

type KYCStatus string

const (
	KYCPending      KYCStatus = "PENDING"
	KYCProcessing   KYCStatus = "PROCESSING"
	KYCVerified     KYCStatus = "VERIFIED"
	KYCRejected     KYCStatus = "REJECTED"
	KYCInconclusive KYCStatus = "INCONCLUSIVE"
	KYCManualReview KYCStatus = "MANUAL_REVIEW"
)

type KYCVerification struct {
	ID              string         `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID          uint           `gorm:"not null;index" json:"user_id"`
	User            User           `gorm:"foreignKey:UserID" json:"-"`
	DiditSessionID  string         `json:"didit_session_id,omitempty"`
	AadhaarVerified bool           `json:"aadhaar_verified"`
	PANVerified     bool           `json:"pan_verified"`
	DLVerified      bool           `json:"dl_verified"`
	RCVerified      bool           `json:"rc_verified"`
	DocURLs         datatypes.JSON `gorm:"type:jsonb" json:"doc_urls"`
	AIRiskScore     float64        `json:"ai_risk_score"`
	AIFlags         datatypes.JSON `gorm:"type:jsonb" json:"ai_flags"`
	Status          KYCStatus      `gorm:"type:varchar(20);default:'PENDING'" json:"status"`
	AdminID         *uint          `json:"admin_id,omitempty"`
	AdminNote       string         `json:"admin_note,omitempty"`
	VerifiedAt      *time.Time     `json:"verified_at,omitempty"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
}

// ==================== VEHICLE ====================

type VehicleType string

const (
	VehicleAutoRickshaw VehicleType = "AUTO_RICKSHAW"
	VehicleTempo        VehicleType = "TEMPO"
	VehicleMiniTruck    VehicleType = "MINI_TRUCK"
	VehicleTruck        VehicleType = "TRUCK"
	VehicleTrailer      VehicleType = "TRAILER"
)

type VehicleApprovalStatus string

const (
	VehiclePendingApproval VehicleApprovalStatus = "PENDING"
	VehicleApproved        VehicleApprovalStatus = "APPROVED"
	VehicleRejected        VehicleApprovalStatus = "REJECTED"
)

type Vehicle struct {
	gorm.Model
	OwnerID         uint                  `gorm:"not null;index" json:"owner_id"`
	Owner           User                  `gorm:"foreignKey:OwnerID" json:"-"`
	Type            VehicleType           `gorm:"type:varchar(20);not null" json:"type"`
	RegistrationNo  string                `gorm:"uniqueIndex;not null" json:"registration_no"`
	Make            string                `json:"make"`
	ModelName       string                `json:"model"`
	Year            int                   `json:"year"`
	MaxWeightKg     float64               `gorm:"not null" json:"max_weight_kg"`
	LengthFt        float64               `json:"length_ft"`
	WidthFt         float64               `json:"width_ft"`
	HeightFt        float64               `json:"height_ft"`
	Photos          datatypes.JSON        `gorm:"type:jsonb" json:"photos"`
	InsuranceExpiry *time.Time            `json:"insurance_expiry"`
	InsuranceNo     string                `json:"insurance_no,omitempty"`
	InsuranceProvider string              `json:"insurance_provider,omitempty"`
	RCVerified      bool                  `gorm:"default:false" json:"rc_verified"`
	ApprovalStatus  VehicleApprovalStatus `gorm:"type:varchar(20);default:'PENDING'" json:"approval_status"`
	ApprovalNote    string                `json:"approval_note,omitempty"`
	ApprovedByID    *uint                 `json:"approved_by,omitempty"`
	IsActive        bool                  `gorm:"default:true" json:"is_active"`
	CurrentLat      float64               `json:"current_lat"`
	CurrentLng      float64               `json:"current_lng"`
	LastGPSUpdate   *time.Time            `json:"last_gps_update,omitempty"`
}

// ==================== BOOKING ====================

type BookingStatus string

const (
	BookingPending    BookingStatus = "PENDING"
	BookingBidding    BookingStatus = "BIDDING"
	BookingAccepted   BookingStatus = "ACCEPTED"
	BookingPickingUp  BookingStatus = "PICKING_UP"
	BookingInTransit  BookingStatus = "IN_TRANSIT"
	BookingCompleted  BookingStatus = "COMPLETED"
	BookingCancelled  BookingStatus = "CANCELLED"
	BookingDisputed   BookingStatus = "DISPUTED"
)

type Booking struct {
	gorm.Model
	CustomerID      uint           `gorm:"not null;index" json:"customer_id"`
	Customer        *User          `gorm:"foreignKey:CustomerID" json:"customer,omitempty"`
	TransporterID   *uint          `gorm:"index" json:"transporter_id,omitempty"`
	Transporter     *User          `gorm:"foreignKey:TransporterID" json:"transporter,omitempty"`
	VehicleID       *uint          `json:"vehicle_id,omitempty"`
	Vehicle         *Vehicle       `gorm:"foreignKey:VehicleID" json:"vehicle,omitempty"`
	Status          BookingStatus  `gorm:"type:varchar(20);default:'PENDING';index" json:"status"`

	// Pickup details
	PickupLat       float64        `gorm:"not null" json:"pickup_lat"`
	PickupLng       float64        `gorm:"not null" json:"pickup_lng"`
	PickupAddress   string         `gorm:"not null" json:"pickup_address"`
	PickupContact   string         `json:"pickup_contact"`

	// Drop details
	DropLat         float64        `gorm:"not null" json:"drop_lat"`
	DropLng         float64        `gorm:"not null" json:"drop_lng"`
	DropAddress     string         `gorm:"not null" json:"drop_address"`
	DropContact     string         `json:"drop_contact"`

	// Multi-stop waypoints
	HasMultiStop    bool           `gorm:"default:false" json:"has_multi_stop"`
	Waypoints       []Waypoint     `gorm:"foreignKey:BookingID" json:"waypoints,omitempty"`

	// Goods details
	GoodsDescription string        `json:"goods_description"`
	GoodsWeightKg    float64       `json:"goods_weight_kg"`
	GoodsFragile     bool          `json:"goods_fragile"`
	GoodsPhotos      datatypes.JSON `gorm:"type:jsonb" json:"goods_photos"`
	GoodsMismatch    bool          `gorm:"default:false" json:"goods_mismatch"`
	MismatchNote     string        `json:"mismatch_note,omitempty"`

	// Route and pricing
	DistanceKm      float64        `json:"distance_km"`
	EstimatedPrice  int64          `json:"estimated_price"` // in paise
	FinalPrice      int64          `json:"final_price"`
	Currency        string         `gorm:"default:'INR'" json:"currency"`

	// Bidding
	BiddingEnabled  bool           `gorm:"default:false" json:"bidding_enabled"`
	BiddingDeadline *time.Time     `json:"bidding_deadline,omitempty"`
	Bids            []Bid          `gorm:"foreignKey:BookingID" json:"bids,omitempty"`

	// Scheduling
	ScheduledAt     *time.Time     `json:"scheduled_at,omitempty"`
	PickedUpAt      *time.Time     `json:"picked_up_at,omitempty"`
	DeliveredAt     *time.Time     `json:"delivered_at,omitempty"`
	CompletedAt     *time.Time     `json:"completed_at,omitempty"`
	CancelledAt     *time.Time     `json:"cancelled_at,omitempty"`
	CancelledBy     *uint          `json:"cancelled_by,omitempty"`
	CancelReason    string         `json:"cancel_reason,omitempty"`
	CancellationFee int64          `json:"cancellation_fee,omitempty"`

	// Delivery evidence
	PickupPhotos    datatypes.JSON `gorm:"type:jsonb" json:"pickup_photos"`
	DeliveryPhotos  datatypes.JSON `gorm:"type:jsonb" json:"delivery_photos"`
	CustomerRating  *float64       `json:"customer_rating,omitempty"`
	TransporterRating *float64     `json:"transporter_rating,omitempty"`

	// Payment reference
	PaymentIntentID string         `json:"payment_intent_id,omitempty"`
	PaymentStatus   string         `gorm:"default:'UNPAID'" json:"payment_status"`
	EscrowReleaseAt *time.Time     `json:"escrow_release_at,omitempty"`

	// GPS tracking
	LastTransporterPing *time.Time `json:"last_transporter_ping,omitempty"`

	// Pickup/delivery verification OTP
	PickupOTP       string         `json:"pickup_otp,omitempty"`

	// Version for optimistic locking
	Version         int            `gorm:"default:1" json:"-"`
}

// ==================== WAYPOINT (Multi-stop) ====================

type Waypoint struct {
	gorm.Model
	BookingID   uint    `gorm:"not null;index" json:"booking_id"`
	SeqOrder    int     `gorm:"not null" json:"seq_order"`
	Lat         float64 `gorm:"not null" json:"lat"`
	Lng         float64 `gorm:"not null" json:"lng"`
	Address     string  `gorm:"not null" json:"address"`
	Contact     string  `json:"contact,omitempty"`
	Description string  `json:"description,omitempty"`
	ArrivedAt   *time.Time `json:"arrived_at,omitempty"`
}

// ==================== BID ====================

type BidStatus string

const (
	BidPending  BidStatus = "PENDING"
	BidAccepted BidStatus = "ACCEPTED"
	BidRejected BidStatus = "REJECTED"
	BidExpired  BidStatus = "EXPIRED"
)

type Bid struct {
	gorm.Model
	BookingID     uint      `gorm:"not null;index" json:"booking_id"`
	Booking       Booking   `gorm:"foreignKey:BookingID" json:"-"`
	TransporterID uint      `gorm:"not null;index" json:"transporter_id"`
	Transporter   User      `gorm:"foreignKey:TransporterID" json:"-"`
	VehicleID     uint      `gorm:"not null" json:"vehicle_id"`
	Vehicle       Vehicle   `gorm:"foreignKey:VehicleID" json:"-"`
	AmountPaise   int64     `gorm:"not null" json:"amount_paise"`
	Note          string    `json:"note,omitempty"`
	EstimatedTime int       `json:"estimated_time_min"`
	Status        BidStatus `gorm:"type:varchar(20);default:'PENDING'" json:"status"`
}

// ==================== SOS ====================

type SOSStatus string

const (
	SOSActive   SOSStatus = "ACTIVE"
	SOSResolved SOSStatus = "RESOLVED"
	SOSFalse    SOSStatus = "FALSE_ALARM"
)

type SOSAlert struct {
	ID         string    `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID     uint      `gorm:"not null;index" json:"user_id"`
	User       User      `gorm:"foreignKey:UserID" json:"-"`
	BookingID  uint      `gorm:"not null;index" json:"booking_id"`
	Booking    Booking   `gorm:"foreignKey:BookingID" json:"-"`
	Lat        float64   `json:"lat"`
	Lng        float64   `json:"lng"`
	Status     SOSStatus `gorm:"type:varchar(20);default:'ACTIVE'" json:"status"`
	ResolvedBy *uint     `json:"resolved_by,omitempty"`
	ResolveNote string   `json:"resolve_note,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
	ResolvedAt *time.Time `json:"resolved_at,omitempty"`
}

// ==================== MESSAGE ====================

type MessageType string

const (
	MessageText     MessageType = "text"
	MessageImage    MessageType = "image"
	MessageLocation MessageType = "location"
	MessageSystem   MessageType = "system"
)

type MessageStatus string

const (
	MsgSent      MessageStatus = "sent"
	MsgDelivered MessageStatus = "delivered"
	MsgRead      MessageStatus = "read"
)

type Message struct {
	ID          string        `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	BookingID   uint          `gorm:"not null;index:idx_messages_booking" json:"booking_id"`
	SenderID    uint          `gorm:"not null" json:"sender_id"`
	Type        MessageType   `gorm:"type:varchar(20);not null" json:"type"`
	Content     string        `gorm:"not null" json:"content"`
	ContentHash string        `json:"-"` // SHA-256 for tamper evidence
	Status      MessageStatus `gorm:"type:varchar(20);default:'sent'" json:"status"`
	Flagged     bool          `gorm:"default:false" json:"flagged"`
	FlagReason  string        `json:"flag_reason,omitempty"`
	ClientUUID  string        `gorm:"uniqueIndex" json:"client_uuid"`
	CreatedAt   time.Time     `gorm:"index:idx_messages_booking" json:"created_at"`
	// Messages are immutable — no UpdatedAt or DeletedAt
}

// ==================== REPORT ====================

type ReportType string

const (
	ReportTransporter ReportType = "TRANSPORTER_REPORT" // customer reports transporter
	ReportCustomer    ReportType = "CUSTOMER_REPORT"     // transporter reports customer
)

type ReportCategory string

const (
	// Customer -> Transporter
	CatRecklessDriving   ReportCategory = "RECKLESS_DRIVING"
	CatDamagedGoods      ReportCategory = "DAMAGED_GOODS"
	CatLateArrival       ReportCategory = "LATE_ARRIVAL"
	CatHarassment        ReportCategory = "HARASSMENT"
	CatExtraPayment      ReportCategory = "EXTRA_PAYMENT_DEMAND"
	CatNoShow            ReportCategory = "NO_SHOW"
	CatFakeGPS           ReportCategory = "FAKE_GPS"
	CatVehicleMismatch   ReportCategory = "VEHICLE_MISMATCH"
	CatIntoxicated       ReportCategory = "INTOXICATED_DRIVER"
	CatOvercharged       ReportCategory = "OVERCHARGED"
	// Transporter -> Customer
	CatWrongAddress      ReportCategory = "WRONG_ADDRESS"
	CatExtraGoods        ReportCategory = "UNDECLARED_EXTRA_GOODS"
	CatAbusiveBehavior   ReportCategory = "ABUSIVE_BEHAVIOR"
	CatRefusedPayment    ReportCategory = "REFUSED_PAYMENT"
	CatFakeBooking       ReportCategory = "FAKE_BOOKING"
	CatIllegalGoods      ReportCategory = "ILLEGAL_GOODS"
	CatCustomerNoShow    ReportCategory = "CUSTOMER_NO_SHOW"
	CatPropertyDamage    ReportCategory = "PROPERTY_DAMAGE"
	CatExtortionThreat   ReportCategory = "EXTORTION_THREAT"
	CatRepeatedCancel    ReportCategory = "REPEATED_CANCELLATION"
)

type ReportStatus string

const (
	ReportPending     ReportStatus = "PENDING"
	ReportUnderReview ReportStatus = "UNDER_REVIEW"
	ReportResolved    ReportStatus = "RESOLVED"
	ReportDismissed   ReportStatus = "DISMISSED"
)

type ResolutionType string

const (
	ResWarning    ResolutionType = "WARNING"
	ResSuspend7D  ResolutionType = "SUSPEND_7D"
	ResSuspend30D ResolutionType = "SUSPEND_30D"
	ResPermaban   ResolutionType = "PERMABAN"
	ResDismissed  ResolutionType = "DISMISSED"
)

type Report struct {
	ID           string         `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	ReporterID   uint           `gorm:"not null;index" json:"reporter_id"`
	Reporter     User           `gorm:"foreignKey:ReporterID" json:"-"`
	ReportedID   uint           `gorm:"not null;index" json:"reported_id"`
	Reported     User           `gorm:"foreignKey:ReportedID" json:"-"`
	BookingID    uint           `gorm:"not null" json:"booking_id"`
	Booking      Booking        `gorm:"foreignKey:BookingID" json:"-"`
	Type         ReportType     `gorm:"type:varchar(30);not null" json:"type"`
	Category     ReportCategory `gorm:"type:varchar(30);not null" json:"category"`
	Description  string         `gorm:"size:1000" json:"description"`
	EvidenceURLs datatypes.JSON `gorm:"type:jsonb" json:"evidence_urls"`
	AISeverity   float64        `json:"ai_severity"` // 0.0-1.0
	AITags       datatypes.JSON `gorm:"type:jsonb" json:"ai_tags"`
	Status       ReportStatus   `gorm:"type:varchar(20);default:'PENDING'" json:"status"`
	Resolution   ResolutionType `gorm:"type:varchar(20)" json:"resolution,omitempty"`
	AdminID      *uint          `json:"admin_id,omitempty"`
	AdminNote    string         `json:"admin_note,omitempty"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
}

// ==================== PAYMENT ====================

type PaymentStatus string

const (
	PayUnpaid    PaymentStatus = "UNPAID"
	PayPending   PaymentStatus = "PENDING"
	PayCaptured  PaymentStatus = "CAPTURED"
	PayEscrowed  PaymentStatus = "ESCROWED"
	PayReleased  PaymentStatus = "RELEASED"
	PayRefunded  PaymentStatus = "REFUNDED"
	PayFailed    PaymentStatus = "FAILED"
)

type Payment struct {
	gorm.Model
	BookingID         uint          `gorm:"not null;uniqueIndex" json:"booking_id"`
	Booking           Booking       `gorm:"foreignKey:BookingID" json:"-"`
	CustomerID        uint          `gorm:"not null" json:"customer_id"`
	TransporterID     uint          `gorm:"not null" json:"transporter_id"`
	AmountPaise       int64         `gorm:"not null" json:"amount_paise"`
	Currency          string        `gorm:"default:'INR'" json:"currency"`
	StripePaymentID   string        `gorm:"uniqueIndex" json:"stripe_payment_id"`
	StripeClientSecret string       `json:"-"`
	Status            PaymentStatus `gorm:"type:varchar(20);default:'UNPAID'" json:"status"`
	EscrowReleasedAt  *time.Time    `json:"escrow_released_at,omitempty"`
	RefundedAt        *time.Time    `json:"refunded_at,omitempty"`
	RefundAmountPaise int64         `json:"refund_amount_paise"`
	RefundReason      string        `json:"refund_reason,omitempty"`
}

// ==================== AUDIT LOG ====================

type AuditLog struct {
	ID        string    `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	AdminID   uint      `gorm:"not null;index" json:"admin_id"`
	Action    string    `gorm:"not null" json:"action"`
	TargetID  uint      `json:"target_id"`
	TargetType string   `json:"target_type"` // USER, BOOKING, REPORT, KYC
	Reason    string    `json:"reason"`
	Metadata  datatypes.JSON `gorm:"type:jsonb" json:"metadata,omitempty"`
	IPAddress string    `json:"ip_address"`
	CreatedAt time.Time `json:"created_at"`
	// Audit logs are immutable — no UpdatedAt or DeletedAt
}

// ==================== NOTIFICATION ====================

type NotificationType string

const (
	NotifyPush  NotificationType = "PUSH"
	NotifyEmail NotificationType = "EMAIL"
	NotifyInApp NotificationType = "IN_APP"
)

type Notification struct {
	ID        string           `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID    uint             `gorm:"not null;index" json:"user_id"`
	Type      NotificationType `gorm:"type:varchar(20)" json:"type"`
	Title     string           `json:"title"`
	Body      string           `json:"body"`
	Data      datatypes.JSON   `gorm:"type:jsonb" json:"data,omitempty"`
	Read      bool             `gorm:"default:false" json:"read"`
	CreatedAt time.Time        `json:"created_at"`
}

// ==================== PRICING ====================

type Pricing struct {
	gorm.Model
	VehicleType     VehicleType `gorm:"type:varchar(20);uniqueIndex;not null" json:"vehicle_type"`
	BasePricePaise  int64       `gorm:"not null" json:"base_price_paise"`
	PricePerKmPaise int64       `gorm:"not null" json:"price_per_km_paise"`
	LoadingChargesPaise int64   `gorm:"not null;default:0" json:"loading_charges_paise"`
	SurgeMultiplier float64     `gorm:"default:1.0" json:"surge_multiplier"`
	MinDistanceKm   float64     `gorm:"default:1.0" json:"min_distance_km"`
	UpdatedByID     *uint       `json:"updated_by,omitempty"`
}

// AllModels returns all model types for auto-migration.
func AllModels() []interface{} {
	return []interface{}{
		&User{},
		&EmergencyContact{},
		&LoginAttempt{},
		&KYCVerification{},
		&Vehicle{},
		&Booking{},
		&Waypoint{},
		&Bid{},
		&SOSAlert{},
		&Message{},
		&Report{},
		&Payment{},
		&AuditLog{},
		&Notification{},
		&Pricing{},
	}
}
