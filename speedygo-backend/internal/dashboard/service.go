package dashboard

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
	apperr "github.com/speedygo/speedygo/internal/errors"
	"github.com/speedygo/speedygo/internal/models"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// Service provides dashboard data aggregation for all roles.
type Service struct {
	db  *gorm.DB
	rdb *redis.Client
	log *slog.Logger
}

func NewService(db *gorm.DB, rdb *redis.Client, log *slog.Logger) *Service {
	return &Service{db: db, rdb: rdb, log: log}
}

// ══════════════════════════════════════════════════════════════
// CUSTOMER DASHBOARD
// ══════════════════════════════════════════════════════════════

type CustomerDashboard struct {
	Profile          CustomerProfile       `json:"profile"`
	Stats            CustomerStats         `json:"stats"`
	SpendingSummary  SpendingSummary       `json:"spending"`
	RecentBookings   []BookingSummary      `json:"recent_bookings"`
	MonthlySpending  []MonthlyAmount       `json:"monthly_spending"`
}

type CustomerProfile struct {
	ID        uint              `json:"id"`
	FullName  string            `json:"full_name"`
	Email     string            `json:"email"`
	Phone     string            `json:"phone"`
	Photo     string            `json:"profile_photo"`
	Status    models.UserStatus `json:"status"`
	MemberSince time.Time      `json:"member_since"`
}

type CustomerStats struct {
	TotalBookings     int64   `json:"total_bookings"`
	CompletedBookings int64   `json:"completed_bookings"`
	CancelledBookings int64   `json:"cancelled_bookings"`
	ActiveBookings    int64   `json:"active_bookings"`
	DisputedBookings  int64   `json:"disputed_bookings"`
	AvgRatingGiven    float64 `json:"avg_rating_given"`
}

type SpendingSummary struct {
	TotalSpentPaise    int64   `json:"total_spent_paise"`
	TotalSpentFormatted string `json:"total_spent_formatted"`
	AvgPerBookingPaise int64   `json:"avg_per_booking_paise"`
	CancellationFees   int64   `json:"cancellation_fees_paise"`
	RefundsReceived    int64   `json:"refunds_received_paise"`
	ThisMonthPaise     int64   `json:"this_month_paise"`
	LastMonthPaise     int64   `json:"last_month_paise"`
}

type BookingSummary struct {
	ID            uint                 `json:"id"`
	Status        models.BookingStatus `json:"status"`
	PickupAddress string               `json:"pickup_address"`
	DropAddress   string               `json:"drop_address"`
	DistanceKm    float64              `json:"distance_km"`
	FinalPrice    int64                `json:"final_price"`
	CreatedAt     time.Time            `json:"created_at"`
	CompletedAt   *time.Time           `json:"completed_at,omitempty"`
}

type MonthlyAmount struct {
	Month  string `json:"month"`
	Amount int64  `json:"amount_paise"`
	Count  int    `json:"booking_count"`
}

func (s *Service) GetCustomerDashboard(userID uint) (*CustomerDashboard, error) {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return nil, apperr.NotFound("User not found")
	}

	dash := &CustomerDashboard{}
	dash.Profile = CustomerProfile{
		ID: user.ID, FullName: user.FullName, Email: user.Email,
		Phone: user.Phone, Photo: user.ProfilePhoto, Status: user.Status,
		MemberSince: user.CreatedAt,
	}

	// Stats
	s.db.Model(&models.Booking{}).Where("customer_id = ?", userID).Count(&dash.Stats.TotalBookings)
	s.db.Model(&models.Booking{}).Where("customer_id = ? AND status = ?", userID, models.BookingCompleted).Count(&dash.Stats.CompletedBookings)
	s.db.Model(&models.Booking{}).Where("customer_id = ? AND status = ?", userID, models.BookingCancelled).Count(&dash.Stats.CancelledBookings)
	s.db.Model(&models.Booking{}).Where("customer_id = ? AND status IN ?", userID,
		[]string{string(models.BookingAccepted), string(models.BookingPickingUp), string(models.BookingInTransit)}).Count(&dash.Stats.ActiveBookings)
	s.db.Model(&models.Booking{}).Where("customer_id = ? AND status = ?", userID, models.BookingDisputed).Count(&dash.Stats.DisputedBookings)

	// Average rating given
	var avgRating struct{ Avg float64 }
	s.db.Model(&models.Booking{}).Select("COALESCE(AVG(transporter_rating), 0) as avg").
		Where("customer_id = ? AND transporter_rating IS NOT NULL", userID).Scan(&avgRating)
	dash.Stats.AvgRatingGiven = avgRating.Avg

	// Spending
	var totalSpent struct{ Total int64 }
	s.db.Model(&models.Payment{}).Select("COALESCE(SUM(amount_paise), 0) as total").
		Where("customer_id = ? AND status IN ?", userID, []string{string(models.PayEscrowed), string(models.PayReleased)}).Scan(&totalSpent)
	dash.SpendingSummary.TotalSpentPaise = totalSpent.Total
	dash.SpendingSummary.TotalSpentFormatted = formatPaise(totalSpent.Total)
	if dash.Stats.CompletedBookings > 0 {
		dash.SpendingSummary.AvgPerBookingPaise = totalSpent.Total / dash.Stats.CompletedBookings
	}

	var cancelFees struct{ Total int64 }
	s.db.Model(&models.Booking{}).Select("COALESCE(SUM(cancellation_fee), 0) as total").
		Where("customer_id = ? AND status = ?", userID, models.BookingCancelled).Scan(&cancelFees)
	dash.SpendingSummary.CancellationFees = cancelFees.Total

	var refunds struct{ Total int64 }
	s.db.Model(&models.Payment{}).Select("COALESCE(SUM(refund_amount_paise), 0) as total").
		Where("customer_id = ? AND status = ?", userID, models.PayRefunded).Scan(&refunds)
	dash.SpendingSummary.RefundsReceived = refunds.Total

	// This month / last month
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	lastMonthStart := monthStart.AddDate(0, -1, 0)

	var thisMonth struct{ Total int64 }
	s.db.Model(&models.Payment{}).Select("COALESCE(SUM(amount_paise), 0) as total").
		Where("customer_id = ? AND status IN ? AND created_at >= ?", userID,
			[]string{string(models.PayEscrowed), string(models.PayReleased)}, monthStart).Scan(&thisMonth)
	dash.SpendingSummary.ThisMonthPaise = thisMonth.Total

	var lastMonth struct{ Total int64 }
	s.db.Model(&models.Payment{}).Select("COALESCE(SUM(amount_paise), 0) as total").
		Where("customer_id = ? AND status IN ? AND created_at >= ? AND created_at < ?", userID,
			[]string{string(models.PayEscrowed), string(models.PayReleased)}, lastMonthStart, monthStart).Scan(&lastMonth)
	dash.SpendingSummary.LastMonthPaise = lastMonth.Total

	// Recent bookings
	var recentBookings []models.Booking
	s.db.Where("customer_id = ?", userID).Order("created_at DESC").Limit(10).Find(&recentBookings)
	for _, b := range recentBookings {
		dash.RecentBookings = append(dash.RecentBookings, BookingSummary{
			ID: b.ID, Status: b.Status, PickupAddress: b.PickupAddress,
			DropAddress: b.DropAddress, DistanceKm: b.DistanceKm,
			FinalPrice: b.FinalPrice, CreatedAt: b.CreatedAt, CompletedAt: b.CompletedAt,
		})
	}

	// Monthly spending (last 12 months)
	dash.MonthlySpending = s.getMonthlyAmounts(
		"SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COALESCE(SUM(amount_paise),0) as amount, COUNT(*) as count FROM payments WHERE customer_id = ? AND status IN ('ESCROWED','RELEASED') AND created_at > ? GROUP BY month ORDER BY month",
		userID, now.AddDate(-1, 0, 0))

	return dash, nil
}

// ══════════════════════════════════════════════════════════════
// TRANSPORTER DASHBOARD
// ══════════════════════════════════════════════════════════════

type TransporterDashboard struct {
	Profile         TransporterProfile    `json:"profile"`
	Stats           TransporterStats      `json:"stats"`
	Earnings        EarningsSummary       `json:"earnings"`
	RecentTrips     []BookingSummary      `json:"recent_trips"`
	MonthlyEarnings []MonthlyAmount       `json:"monthly_earnings"`
	Vehicles        []VehicleSummary      `json:"vehicles"`
}

type TransporterProfile struct {
	ID              uint              `json:"id"`
	FullName        string            `json:"full_name"`
	Email           string            `json:"email"`
	Phone           string            `json:"phone"`
	Photo           string            `json:"profile_photo"`
	Status          models.UserStatus `json:"status"`
	MemberSince     time.Time         `json:"member_since"`
	WarningCount    int               `json:"warning_count"`
	FraudScore      float64           `json:"fraud_score"`
}

type TransporterStats struct {
	TotalTrips          int64   `json:"total_trips"`
	CompletedTrips      int64   `json:"completed_trips"`
	CancelledTrips      int64   `json:"cancelled_trips"`
	ActiveTrips         int64   `json:"active_trips"`
	AcceptanceRate      float64 `json:"acceptance_rate"`
	CancellationRate    float64 `json:"cancellation_rate"`
	AvgRatingReceived   float64 `json:"avg_rating_received"`
	TotalDistanceKm     float64 `json:"total_distance_km"`
	TotalBidsPlaced     int64   `json:"total_bids_placed"`
	BidsWon             int64   `json:"bids_won"`
}

type EarningsSummary struct {
	TotalEarnedPaise      int64  `json:"total_earned_paise"`
	TotalEarnedFormatted  string `json:"total_earned_formatted"`
	PendingPayoutPaise    int64  `json:"pending_payout_paise"`
	ThisMonthPaise        int64  `json:"this_month_paise"`
	LastMonthPaise        int64  `json:"last_month_paise"`
	AvgPerTripPaise       int64  `json:"avg_per_trip_paise"`
}

type VehicleSummary struct {
	ID             uint               `json:"id"`
	Type           models.VehicleType `json:"type"`
	RegistrationNo string             `json:"registration_no"`
	IsActive       bool               `json:"is_active"`
	TripCount      int64              `json:"trip_count"`
}

func (s *Service) GetTransporterDashboard(userID uint) (*TransporterDashboard, error) {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return nil, apperr.NotFound("User not found")
	}

	dash := &TransporterDashboard{}
	dash.Profile = TransporterProfile{
		ID: user.ID, FullName: user.FullName, Email: user.Email,
		Phone: user.Phone, Photo: user.ProfilePhoto, Status: user.Status,
		MemberSince: user.CreatedAt, WarningCount: user.WarningCount, FraudScore: user.FraudScore,
	}

	// Stats
	s.db.Model(&models.Booking{}).Where("transporter_id = ?", userID).Count(&dash.Stats.TotalTrips)
	s.db.Model(&models.Booking{}).Where("transporter_id = ? AND status = ?", userID, models.BookingCompleted).Count(&dash.Stats.CompletedTrips)
	s.db.Model(&models.Booking{}).Where("transporter_id = ? AND status = ? AND cancelled_by = ?", userID, models.BookingCancelled, userID).Count(&dash.Stats.CancelledTrips)
	s.db.Model(&models.Booking{}).Where("transporter_id = ? AND status IN ?", userID,
		[]string{string(models.BookingAccepted), string(models.BookingPickingUp), string(models.BookingInTransit)}).Count(&dash.Stats.ActiveTrips)

	if dash.Stats.TotalTrips > 0 {
		dash.Stats.AcceptanceRate = float64(dash.Stats.CompletedTrips+dash.Stats.ActiveTrips) / float64(dash.Stats.TotalTrips) * 100
		dash.Stats.CancellationRate = float64(dash.Stats.CancelledTrips) / float64(dash.Stats.TotalTrips) * 100
	}

	var avgRating struct{ Avg float64 }
	s.db.Model(&models.Booking{}).Select("COALESCE(AVG(customer_rating), 0) as avg").
		Where("transporter_id = ? AND customer_rating IS NOT NULL", userID).Scan(&avgRating)
	dash.Stats.AvgRatingReceived = avgRating.Avg

	var totalDist struct{ Total float64 }
	s.db.Model(&models.Booking{}).Select("COALESCE(SUM(distance_km), 0) as total").
		Where("transporter_id = ? AND status = ?", userID, models.BookingCompleted).Scan(&totalDist)
	dash.Stats.TotalDistanceKm = totalDist.Total

	s.db.Model(&models.Bid{}).Where("transporter_id = ?", userID).Count(&dash.Stats.TotalBidsPlaced)
	s.db.Model(&models.Bid{}).Where("transporter_id = ? AND status = ?", userID, models.BidAccepted).Count(&dash.Stats.BidsWon)

	// Earnings
	var totalEarned struct{ Total int64 }
	s.db.Model(&models.Payment{}).Select("COALESCE(SUM(amount_paise), 0) as total").
		Where("transporter_id = ? AND status = ?", userID, models.PayReleased).Scan(&totalEarned)
	dash.Earnings.TotalEarnedPaise = totalEarned.Total
	dash.Earnings.TotalEarnedFormatted = formatPaise(totalEarned.Total)
	if dash.Stats.CompletedTrips > 0 {
		dash.Earnings.AvgPerTripPaise = totalEarned.Total / dash.Stats.CompletedTrips
	}

	var pendingPayout struct{ Total int64 }
	s.db.Model(&models.Payment{}).Select("COALESCE(SUM(amount_paise), 0) as total").
		Where("transporter_id = ? AND status = ?", userID, models.PayEscrowed).Scan(&pendingPayout)
	dash.Earnings.PendingPayoutPaise = pendingPayout.Total

	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	lastMonthStart := monthStart.AddDate(0, -1, 0)

	var thisMonth struct{ Total int64 }
	s.db.Model(&models.Payment{}).Select("COALESCE(SUM(amount_paise), 0) as total").
		Where("transporter_id = ? AND status = ? AND created_at >= ?", userID, models.PayReleased, monthStart).Scan(&thisMonth)
	dash.Earnings.ThisMonthPaise = thisMonth.Total

	var lastMonth struct{ Total int64 }
	s.db.Model(&models.Payment{}).Select("COALESCE(SUM(amount_paise), 0) as total").
		Where("transporter_id = ? AND status = ? AND created_at >= ? AND created_at < ?", userID, models.PayReleased, lastMonthStart, monthStart).Scan(&lastMonth)
	dash.Earnings.LastMonthPaise = lastMonth.Total

	// Recent trips
	var recentBookings []models.Booking
	s.db.Where("transporter_id = ?", userID).Order("created_at DESC").Limit(10).Find(&recentBookings)
	for _, b := range recentBookings {
		dash.RecentTrips = append(dash.RecentTrips, BookingSummary{
			ID: b.ID, Status: b.Status, PickupAddress: b.PickupAddress,
			DropAddress: b.DropAddress, DistanceKm: b.DistanceKm,
			FinalPrice: b.FinalPrice, CreatedAt: b.CreatedAt, CompletedAt: b.CompletedAt,
		})
	}

	// Monthly earnings
	dash.MonthlyEarnings = s.getMonthlyAmounts(
		"SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COALESCE(SUM(amount_paise),0) as amount, COUNT(*) as count FROM payments WHERE transporter_id = ? AND status = 'RELEASED' AND created_at > ? GROUP BY month ORDER BY month",
		userID, now.AddDate(-1, 0, 0))

	// Vehicles
	var vehicles []models.Vehicle
	s.db.Where("owner_id = ?", userID).Find(&vehicles)
	for _, v := range vehicles {
		var tripCount int64
		s.db.Model(&models.Booking{}).Where("vehicle_id = ? AND status = ?", v.ID, models.BookingCompleted).Count(&tripCount)
		dash.Vehicles = append(dash.Vehicles, VehicleSummary{
			ID: v.ID, Type: v.Type, RegistrationNo: v.RegistrationNo,
			IsActive: v.IsActive, TripCount: tripCount,
		})
	}

	return dash, nil
}

// ══════════════════════════════════════════════════════════════
// ADMIN DASHBOARD (Platform Analytics)
// ══════════════════════════════════════════════════════════════

type AdminDashboard struct {
	Users        UserMetrics         `json:"users"`
	Bookings     BookingMetrics      `json:"bookings"`
	Revenue      RevenueMetrics      `json:"revenue"`
	Safety       SafetyMetrics       `json:"safety"`
	RecentAudit  []AuditEntry        `json:"recent_audit_logs"`
}

type UserMetrics struct {
	TotalUsers        int64 `json:"total_users"`
	TotalCustomers    int64 `json:"total_customers"`
	TotalTransporters int64 `json:"total_transporters"`
	TotalAdmins       int64 `json:"total_admins"`
	ActiveUsers       int64 `json:"active_users"`
	SuspendedUsers    int64 `json:"suspended_users"`
	BannedUsers       int64 `json:"banned_users"`
	PendingKYC        int64 `json:"pending_kyc"`
	NewUsersToday     int64 `json:"new_users_today"`
	NewUsersThisWeek  int64 `json:"new_users_this_week"`
}

type BookingMetrics struct {
	TotalBookings     int64   `json:"total_bookings"`
	ActiveBookings    int64   `json:"active_bookings"`
	CompletedToday    int64   `json:"completed_today"`
	CompletedThisWeek int64   `json:"completed_this_week"`
	CancelledToday    int64   `json:"cancelled_today"`
	DisputedActive    int64   `json:"disputed_active"`
	AvgDistanceKm     float64 `json:"avg_distance_km"`
	AvgPricePaise     int64   `json:"avg_price_paise"`
}

type RevenueMetrics struct {
	TotalRevenuePaise    int64          `json:"total_revenue_paise"`
	TotalRevenueFormatted string        `json:"total_revenue_formatted"`
	TodayRevenuePaise    int64          `json:"today_revenue_paise"`
	ThisWeekPaise        int64          `json:"this_week_paise"`
	ThisMonthPaise       int64          `json:"this_month_paise"`
	PendingEscrowPaise   int64          `json:"pending_escrow_paise"`
	TotalRefundsPaise    int64          `json:"total_refunds_paise"`
	MonthlyRevenue       []MonthlyAmount `json:"monthly_revenue"`
}

type SafetyMetrics struct {
	ActiveSOSAlerts    int64 `json:"active_sos_alerts"`
	PendingReports     int64 `json:"pending_reports"`
	AutoSuspensions    int64 `json:"auto_suspensions_30d"`
	FlaggedMessages    int64 `json:"flagged_messages_24h"`
}

type AuditEntry struct {
	ID         string    `json:"id"`
	AdminID    uint      `json:"admin_id"`
	Action     string    `json:"action"`
	TargetType string    `json:"target_type"`
	TargetID   uint      `json:"target_id"`
	Reason     string    `json:"reason"`
	CreatedAt  time.Time `json:"created_at"`
}

func (s *Service) GetAdminDashboard() (*AdminDashboard, error) {
	// Check Redis cache first (admin dashboard is expensive — cache 30s)
	if s.rdb != nil {
		ctx := context.Background()
		if cached, err := s.rdb.Get(ctx, "cache:admin:dashboard").Result(); err == nil {
			var dash AdminDashboard
			if json.Unmarshal([]byte(cached), &dash) == nil {
				return &dash, nil
			}
		}
	}

	dash := &AdminDashboard{}
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	weekAgo := today.AddDate(0, 0, -7)
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)

	// Users
	s.db.Model(&models.User{}).Count(&dash.Users.TotalUsers)
	s.db.Model(&models.User{}).Where("role = ?", models.RoleCustomer).Count(&dash.Users.TotalCustomers)
	s.db.Model(&models.User{}).Where("role = ?", models.RoleTransporter).Count(&dash.Users.TotalTransporters)
	s.db.Model(&models.User{}).Where("role IN ?", []string{string(models.RoleAdmin), string(models.RoleSuperAdmin)}).Count(&dash.Users.TotalAdmins)
	s.db.Model(&models.User{}).Where("status = ?", models.StatusActive).Count(&dash.Users.ActiveUsers)
	s.db.Model(&models.User{}).Where("status = ?", models.StatusSuspended).Count(&dash.Users.SuspendedUsers)
	s.db.Model(&models.User{}).Where("status = ?", models.StatusBanned).Count(&dash.Users.BannedUsers)
	s.db.Model(&models.User{}).Where("status IN ?", []string{string(models.StatusPendingKYC), string(models.StatusKYCReview)}).Count(&dash.Users.PendingKYC)
	s.db.Model(&models.User{}).Where("created_at >= ?", today).Count(&dash.Users.NewUsersToday)
	s.db.Model(&models.User{}).Where("created_at >= ?", weekAgo).Count(&dash.Users.NewUsersThisWeek)

	// Bookings
	s.db.Model(&models.Booking{}).Count(&dash.Bookings.TotalBookings)
	s.db.Model(&models.Booking{}).Where("status IN ?",
		[]string{string(models.BookingAccepted), string(models.BookingPickingUp), string(models.BookingInTransit)}).Count(&dash.Bookings.ActiveBookings)
	s.db.Model(&models.Booking{}).Where("status = ? AND completed_at >= ?", models.BookingCompleted, today).Count(&dash.Bookings.CompletedToday)
	s.db.Model(&models.Booking{}).Where("status = ? AND completed_at >= ?", models.BookingCompleted, weekAgo).Count(&dash.Bookings.CompletedThisWeek)
	s.db.Model(&models.Booking{}).Where("status = ? AND cancelled_at >= ?", models.BookingCancelled, today).Count(&dash.Bookings.CancelledToday)
	s.db.Model(&models.Booking{}).Where("status = ?", models.BookingDisputed).Count(&dash.Bookings.DisputedActive)

	var avgDist struct{ Avg float64 }
	s.db.Model(&models.Booking{}).Select("COALESCE(AVG(distance_km), 0) as avg").Where("status = ?", models.BookingCompleted).Scan(&avgDist)
	dash.Bookings.AvgDistanceKm = avgDist.Avg
	var avgPrice struct{ Avg int64 }
	s.db.Model(&models.Booking{}).Select("COALESCE(AVG(final_price), 0) as avg").Where("status = ?", models.BookingCompleted).Scan(&avgPrice)
	dash.Bookings.AvgPricePaise = avgPrice.Avg

	// Revenue
	var totalRev struct{ Total int64 }
	s.db.Model(&models.Payment{}).Select("COALESCE(SUM(amount_paise), 0) as total").
		Where("status IN ?", []string{string(models.PayEscrowed), string(models.PayReleased)}).Scan(&totalRev)
	dash.Revenue.TotalRevenuePaise = totalRev.Total
	dash.Revenue.TotalRevenueFormatted = formatPaise(totalRev.Total)

	var todayRev struct{ Total int64 }
	s.db.Model(&models.Payment{}).Select("COALESCE(SUM(amount_paise), 0) as total").
		Where("status IN ? AND created_at >= ?", []string{string(models.PayEscrowed), string(models.PayReleased)}, today).Scan(&todayRev)
	dash.Revenue.TodayRevenuePaise = todayRev.Total

	var weekRev struct{ Total int64 }
	s.db.Model(&models.Payment{}).Select("COALESCE(SUM(amount_paise), 0) as total").
		Where("status IN ? AND created_at >= ?", []string{string(models.PayEscrowed), string(models.PayReleased)}, weekAgo).Scan(&weekRev)
	dash.Revenue.ThisWeekPaise = weekRev.Total

	var monthRev struct{ Total int64 }
	s.db.Model(&models.Payment{}).Select("COALESCE(SUM(amount_paise), 0) as total").
		Where("status IN ? AND created_at >= ?", []string{string(models.PayEscrowed), string(models.PayReleased)}, monthStart).Scan(&monthRev)
	dash.Revenue.ThisMonthPaise = monthRev.Total

	var escrow struct{ Total int64 }
	s.db.Model(&models.Payment{}).Select("COALESCE(SUM(amount_paise), 0) as total").
		Where("status = ?", models.PayEscrowed).Scan(&escrow)
	dash.Revenue.PendingEscrowPaise = escrow.Total

	var refunds struct{ Total int64 }
	s.db.Model(&models.Payment{}).Select("COALESCE(SUM(refund_amount_paise), 0) as total").
		Where("status = ?", models.PayRefunded).Scan(&refunds)
	dash.Revenue.TotalRefundsPaise = refunds.Total

	dash.Revenue.MonthlyRevenue = s.getMonthlyAmounts(
		"SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COALESCE(SUM(amount_paise),0) as amount, COUNT(*) as count FROM payments WHERE status IN ('ESCROWED','RELEASED') AND created_at > ? GROUP BY month ORDER BY month",
		0, now.AddDate(-1, 0, 0))

	// Safety
	s.db.Model(&models.SOSAlert{}).Where("status = ?", models.SOSActive).Count(&dash.Safety.ActiveSOSAlerts)
	s.db.Model(&models.Report{}).Where("status IN ?", []string{string(models.ReportPending), string(models.ReportUnderReview)}).Count(&dash.Safety.PendingReports)
	s.db.Model(&models.AuditLog{}).Where("action = 'AUTO_SUSPEND' AND created_at > ?", now.AddDate(0, 0, -30)).Count(&dash.Safety.AutoSuspensions)
	s.db.Model(&models.Message{}).Where("flagged = true AND created_at > ?", now.Add(-24*time.Hour)).Count(&dash.Safety.FlaggedMessages)

	// Recent audit logs
	var auditLogs []models.AuditLog
	s.db.Order("created_at DESC").Limit(20).Find(&auditLogs)
	for _, al := range auditLogs {
		dash.RecentAudit = append(dash.RecentAudit, AuditEntry{
			ID: al.ID, AdminID: al.AdminID, Action: al.Action,
			TargetType: al.TargetType, TargetID: al.TargetID,
			Reason: al.Reason, CreatedAt: al.CreatedAt,
		})
	}

	// Cache admin dashboard for 30 seconds
	if s.rdb != nil {
		data, _ := json.Marshal(dash)
		s.rdb.Set(context.Background(), "cache:admin:dashboard", data, 30*time.Second)
	}

	return dash, nil
}

// ══════════════════════════════════════════════════════════════
// ADMIN: GET USER DETAIL BY ID
// ══════════════════════════════════════════════════════════════

type AdminUserDetail struct {
	User             models.User      `json:"user"`
	BookingStats     CustomerStats    `json:"booking_stats"`
	SpendOrEarnings  int64            `json:"spend_or_earnings_paise"`
	Vehicles         []VehicleSummary `json:"vehicles,omitempty"`
	RecentReports    []ReportSummary  `json:"recent_reports"`
	RecentBookings   []BookingSummary `json:"recent_bookings"`
	AuditLogs        []AuditEntry     `json:"audit_logs"`
}

type ReportSummary struct {
	ID       string               `json:"id"`
	Type     models.ReportType    `json:"type"`
	Category models.ReportCategory `json:"category"`
	Status   models.ReportStatus  `json:"status"`
	Severity float64              `json:"severity"`
	Date     time.Time            `json:"date"`
}

func (s *Service) GetAdminUserDetail(targetID uint) (*AdminUserDetail, error) {
	var user models.User
	if err := s.db.First(&user, targetID).Error; err != nil {
		return nil, apperr.NotFound("User not found")
	}

	detail := &AdminUserDetail{User: user}

	// Booking stats (works for both customer & transporter)
	field := "customer_id"
	if user.Role == models.RoleTransporter {
		field = "transporter_id"
	}
	s.db.Model(&models.Booking{}).Where(field+" = ?", targetID).Count(&detail.BookingStats.TotalBookings)
	s.db.Model(&models.Booking{}).Where(field+" = ? AND status = ?", targetID, models.BookingCompleted).Count(&detail.BookingStats.CompletedBookings)
	s.db.Model(&models.Booking{}).Where(field+" = ? AND status = ?", targetID, models.BookingCancelled).Count(&detail.BookingStats.CancelledBookings)

	// Spend or earnings
	payField := "customer_id"
	payStatus := []string{string(models.PayEscrowed), string(models.PayReleased)}
	if user.Role == models.RoleTransporter {
		payField = "transporter_id"
		payStatus = []string{string(models.PayReleased)}
	}
	var total struct{ Total int64 }
	s.db.Model(&models.Payment{}).Select("COALESCE(SUM(amount_paise), 0) as total").
		Where(payField+" = ? AND status IN ?", targetID, payStatus).Scan(&total)
	detail.SpendOrEarnings = total.Total

	// Vehicles (if transporter)
	if user.Role == models.RoleTransporter {
		var vehicles []models.Vehicle
		s.db.Where("owner_id = ?", targetID).Find(&vehicles)
		for _, v := range vehicles {
			detail.Vehicles = append(detail.Vehicles, VehicleSummary{
				ID: v.ID, Type: v.Type, RegistrationNo: v.RegistrationNo, IsActive: v.IsActive,
			})
		}
	}

	// Reports about this user
	var reports []models.Report
	s.db.Where("reported_id = ?", targetID).Order("created_at DESC").Limit(10).Find(&reports)
	for _, r := range reports {
		detail.RecentReports = append(detail.RecentReports, ReportSummary{
			ID: r.ID, Type: r.Type, Category: r.Category,
			Status: r.Status, Severity: r.AISeverity, Date: r.CreatedAt,
		})
	}

	// Recent bookings
	var bookings []models.Booking
	s.db.Where(field+" = ?", targetID).Order("created_at DESC").Limit(10).Find(&bookings)
	for _, b := range bookings {
		detail.RecentBookings = append(detail.RecentBookings, BookingSummary{
			ID: b.ID, Status: b.Status, PickupAddress: b.PickupAddress,
			DropAddress: b.DropAddress, FinalPrice: b.FinalPrice, CreatedAt: b.CreatedAt,
		})
	}

	// Audit logs targeting this user
	var audits []models.AuditLog
	s.db.Where("target_id = ? AND target_type = 'USER'", targetID).Order("created_at DESC").Limit(10).Find(&audits)
	for _, a := range audits {
		detail.AuditLogs = append(detail.AuditLogs, AuditEntry{
			ID: a.ID, AdminID: a.AdminID, Action: a.Action,
			TargetType: a.TargetType, TargetID: a.TargetID,
			Reason: a.Reason, CreatedAt: a.CreatedAt,
		})
	}

	return detail, nil
}

// ══════════════════════════════════════════════════════════════
// RATING
// ══════════════════════════════════════════════════════════════

type RateBookingReq struct {
	Rating float64 `json:"rating"` // 1.0 - 5.0
}

func (s *Service) RateBooking(bookingID, userID uint, req RateBookingReq) error {
	if req.Rating < 1 || req.Rating > 5 {
		return apperr.BadRequest("Rating must be between 1.0 and 5.0")
	}

	var bk models.Booking
	if err := s.db.First(&bk, bookingID).Error; err != nil {
		return apperr.NotFound("Booking not found")
	}
	if bk.Status != models.BookingCompleted {
		return apperr.BadRequest("Can only rate completed bookings")
	}

	if bk.CustomerID == userID {
		if bk.TransporterRating != nil {
			return apperr.Conflict("Already rated this booking")
		}
		s.db.Model(&bk).Update("transporter_rating", req.Rating)
	} else if bk.TransporterID != nil && *bk.TransporterID == userID {
		if bk.CustomerRating != nil {
			return apperr.Conflict("Already rated this booking")
		}
		s.db.Model(&bk).Update("customer_rating", req.Rating)
	} else {
		return apperr.Forbidden("Not a participant of this booking")
	}

	return nil
}

// ══════════════════════════════════════════════════════════════
// HANDLER
// ══════════════════════════════════════════════════════════════

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// GET /users/me/dashboard
func (h *Handler) GetMyDashboard(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	role, _ := c.Locals("role").(models.UserRole)

	switch role {
	case models.RoleCustomer:
		dash, err := h.svc.GetCustomerDashboard(userID)
		if err != nil {
			if ae, ok := apperr.IsAppError(err); ok {
				return c.Status(ae.Code).JSON(fiber.Map{"error": true, "message": ae.Message})
			}
			return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
		}
		return c.JSON(dash)
	case models.RoleTransporter:
		dash, err := h.svc.GetTransporterDashboard(userID)
		if err != nil {
			if ae, ok := apperr.IsAppError(err); ok {
				return c.Status(ae.Code).JSON(fiber.Map{"error": true, "message": ae.Message})
			}
			return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
		}
		return c.JSON(dash)
	default:
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Dashboard not available for this role. Use /admin/dashboard"})
	}
}

// GET /admin/dashboard
func (h *Handler) GetAdminDashboard(c *fiber.Ctx) error {
	dash, err := h.svc.GetAdminDashboard()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(dash)
}

// GET /admin/users/:id/detail
func (h *Handler) GetAdminUserDetail(c *fiber.Ctx) error {
	targetID, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || targetID == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid user ID"})
	}
	detail, err := h.svc.GetAdminUserDetail(uint(targetID))
	if err != nil {
		if ae, ok := apperr.IsAppError(err); ok {
			return c.Status(ae.Code).JSON(fiber.Map{"error": true, "message": ae.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(detail)
}

// POST /bookings/:id/rate
func (h *Handler) RateBooking(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	bookingID, _ := strconv.ParseUint(c.Params("id"), 10, 64)
	var req RateBookingReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}
	if err := h.svc.RateBooking(uint(bookingID), userID, req); err != nil {
		if ae, ok := apperr.IsAppError(err); ok {
			return c.Status(ae.Code).JSON(fiber.Map{"error": true, "message": ae.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"ok": true})
}

// GET /admin/audit-logs
func (h *Handler) GetAuditLogs(c *fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	offset, _ := strconv.Atoi(c.Query("offset", "0"))
	action := c.Query("action")
	targetType := c.Query("target_type")

	var logs []models.AuditLog
	var total int64
	q := h.svc.db.Model(&models.AuditLog{})
	if action != "" {
		q = q.Where("action = ?", action)
	}
	if targetType != "" {
		q = q.Where("target_type = ?", targetType)
	}
	q.Count(&total)
	q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&logs)

	entries := make([]AuditEntry, 0, len(logs))
	for _, a := range logs {
		entries = append(entries, AuditEntry{
			ID: a.ID, AdminID: a.AdminID, Action: a.Action,
			TargetType: a.TargetType, TargetID: a.TargetID,
			Reason: a.Reason, CreatedAt: a.CreatedAt,
		})
	}
	return c.JSON(fiber.Map{"data": entries, "total": total})
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

func (s *Service) getMonthlyAmounts(query string, userID uint, since time.Time) []MonthlyAmount {
	type row struct {
		Month  string
		Amount int64
		Count  int
	}
	var rows []row
	if userID > 0 {
		s.db.Raw(query, userID, since).Scan(&rows)
	} else {
		s.db.Raw(query, since).Scan(&rows)
	}
	result := make([]MonthlyAmount, 0, len(rows))
	for _, r := range rows {
		result = append(result, MonthlyAmount{Month: r.Month, Amount: r.Amount, Count: r.Count})
	}
	return result
}

func formatPaise(paise int64) string {
	rupees := float64(paise) / 100.0
	if rupees >= 10000000 {
		return fmt.Sprintf("₹%.2f Cr", rupees/10000000)
	}
	if rupees >= 100000 {
		return fmt.Sprintf("₹%.2f L", rupees/100000)
	}
	if rupees >= 1000 {
		return fmt.Sprintf("₹%.2fK", rupees/1000)
	}
	return fmt.Sprintf("₹%.2f", rupees)
}

// ══════════════════════════════════════════════════════════════
// EARNINGS WITH FILTERS
// ══════════════════════════════════════════════════════════════

type EarningsFilterResponse struct {
	TotalPaise int64          `json:"total_paise"`
	TripCount  int64          `json:"trip_count"`
	AvgPaise   int64          `json:"avg_paise"`
	Data       []MonthlyAmount `json:"data"`
	Filter     string         `json:"filter"`
	From       string         `json:"from"`
	To         string         `json:"to"`
}

// GET /users/me/earnings?filter=week|month|year|all|custom&from=2025-01-01&to=2025-01-31
func (h *Handler) GetFilteredEarnings(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	filter := c.Query("filter", "month")

	now := time.Now()
	var from, to time.Time
	to = now

	switch filter {
	case "today":
		from = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	case "week":
		from = now.AddDate(0, 0, -7)
	case "month":
		from = now.AddDate(0, -1, 0)
	case "year":
		from = now.AddDate(-1, 0, 0)
	case "all":
		from = time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	case "custom":
		fromStr := c.Query("from")
		toStr := c.Query("to")
		if fromStr == "" || toStr == "" {
			return c.Status(400).JSON(fiber.Map{"error": true, "message": "from and to are required for custom filter"})
		}
		var err error
		from, err = time.Parse("2006-01-02", fromStr)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid from date format (use YYYY-MM-DD)"})
		}
		to, err = time.Parse("2006-01-02", toStr)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid to date format (use YYYY-MM-DD)"})
		}
		to = to.Add(24*time.Hour - time.Second) // end of day
	default:
		from = now.AddDate(0, -1, 0)
	}

	resp := &EarningsFilterResponse{Filter: filter, From: from.Format("2006-01-02"), To: to.Format("2006-01-02")}

	// Total earnings in range
	var total struct{ Total int64 }
	h.svc.db.Model(&models.Payment{}).Select("COALESCE(SUM(amount_paise), 0) as total").
		Where("transporter_id = ? AND status = ? AND created_at >= ? AND created_at <= ?",
			userID, models.PayReleased, from, to).Scan(&total)
	resp.TotalPaise = total.Total

	// Trip count
	h.svc.db.Model(&models.Booking{}).
		Where("transporter_id = ? AND status = ? AND completed_at >= ? AND completed_at <= ?",
			userID, models.BookingCompleted, from, to).Count(&resp.TripCount)

	if resp.TripCount > 0 {
		resp.AvgPaise = resp.TotalPaise / resp.TripCount
	}

	// Grouped data
	groupBy := "TO_CHAR(created_at, 'YYYY-MM-DD')"
	if filter == "year" || filter == "all" {
		groupBy = "TO_CHAR(created_at, 'YYYY-MM')"
	}
	type row struct {
		Month  string
		Amount int64
		Count  int
	}
	var rows []row
	h.svc.db.Raw(
		fmt.Sprintf("SELECT %s as month, COALESCE(SUM(amount_paise),0) as amount, COUNT(*) as count FROM payments WHERE transporter_id = ? AND status = 'RELEASED' AND created_at >= ? AND created_at <= ? GROUP BY month ORDER BY month", groupBy),
		userID, from, to).Scan(&rows)
	for _, r := range rows {
		resp.Data = append(resp.Data, MonthlyAmount{Month: r.Month, Amount: r.Amount, Count: r.Count})
	}

	return c.JSON(resp)
}

// ══════════════════════════════════════════════════════════════
// ADMIN DASHBOARD EXTRAS
// ══════════════════════════════════════════════════════════════

// GetDailyBookings GET /admin/dashboard/daily-bookings
func (h *Handler) GetDailyBookings(c *fiber.Ctx) error {
	period := c.Query("period", "30d")
	now := time.Now()
	var from time.Time
	switch period {
	case "today":
		from = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	case "7d":
		from = now.AddDate(0, 0, -7)
	case "90d":
		from = now.AddDate(0, 0, -90)
	case "1y":
		from = now.AddDate(-1, 0, 0)
	case "all":
		from = time.Date(2020, 1, 1, 0, 0, 0, 0, now.Location())
	default: // 30d
		from = now.AddDate(0, 0, -30)
	}

	type DailyCount struct {
		Date  string `json:"date"`
		Count int    `json:"count"`
	}
	var data []DailyCount
	h.svc.db.Raw(
		"SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, COUNT(*) as count FROM bookings WHERE created_at >= ? GROUP BY date ORDER BY date", from,
	).Scan(&data)

	return c.JSON(fiber.Map{"data": data})
}

// GetActiveTransporters GET /admin/dashboard/active-transporters
func (h *Handler) GetActiveTransporters(c *fiber.Ctx) error {
	var activeCount int64
	h.svc.db.Model(&models.User{}).Where("role = ? AND is_available = true AND status = ?", models.RoleTransporter, models.StatusActive).Count(&activeCount)

	var onTrip int64
	h.svc.db.Model(&models.Booking{}).Where("status IN ('PICKING_UP', 'IN_TRANSIT')").Distinct("transporter_id").Count(&onTrip)

	return c.JSON(fiber.Map{
		"active_count": activeCount,
		"on_trip":      onTrip,
		"available":    activeCount - onTrip,
	})
}

// GetUserActivity GET /admin/dashboard/user-activity
func (h *Handler) GetUserActivity(c *fiber.Ctx) error {
	period := c.Query("period", "30d")
	now := time.Now()
	var from time.Time
	switch period {
	case "today":
		from = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	case "7d":
		from = now.AddDate(0, 0, -7)
	case "90d":
		from = now.AddDate(0, 0, -90)
	case "1y":
		from = now.AddDate(-1, 0, 0)
	case "all":
		from = time.Date(2020, 1, 1, 0, 0, 0, 0, now.Location())
	default:
		from = now.AddDate(0, 0, -30)
	}

	// Active now (last 15 min)
	var activeNow int64
	h.svc.db.Model(&models.User{}).Where("last_login_at >= ?", now.Add(-15*time.Minute)).Count(&activeNow)

	// Today
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	var today int64
	h.svc.db.Model(&models.User{}).Where("last_login_at >= ?", todayStart).Count(&today)

	// Daily activity
	type DailyActivity struct {
		Date        string `json:"date"`
		ActiveUsers int    `json:"active_users"`
		NewUsers    int    `json:"new_users"`
	}
	var daily []DailyActivity
	h.svc.db.Raw(
		"SELECT TO_CHAR(d.date, 'YYYY-MM-DD') as date, "+
			"(SELECT COUNT(*) FROM users WHERE last_login_at::date = d.date) as active_users, "+
			"(SELECT COUNT(*) FROM users WHERE created_at::date = d.date) as new_users "+
			"FROM generate_series(?::date, ?::date, '1 day'::interval) d(date) ORDER BY d.date",
		from, now,
	).Scan(&daily)

	return c.JSON(fiber.Map{
		"active_now": activeNow,
		"today":      today,
		"daily":      daily,
	})
}
