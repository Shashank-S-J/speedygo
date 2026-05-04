package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/speedygo/speedygo/internal/models"
	"github.com/speedygo/speedygo/internal/natsbus"
	"gorm.io/gorm"
)

// Scheduler runs periodic background jobs for the platform.
type Scheduler struct {
	db  *gorm.DB
	rdb *redis.Client
	bus *natsbus.Bus
	log *slog.Logger

	stopCh chan struct{}
}

func New(db *gorm.DB, rdb *redis.Client, bus *natsbus.Bus, log *slog.Logger) *Scheduler {
	return &Scheduler{db: db, rdb: rdb, bus: bus, log: log, stopCh: make(chan struct{})}
}

// Start launches all background cron jobs.
func (s *Scheduler) Start() {
	s.log.Info("scheduler started")

	go s.runLoop("escrow-release", 1*time.Minute, s.releaseEscrow)
	go s.runLoop("ghost-detection", 2*time.Minute, s.detectGhostTransporters)
	go s.runLoop("scheduled-bookings", 1*time.Minute, s.processScheduledBookings)
	go s.runLoop("expire-bids", 1*time.Minute, s.expireBids)
	go s.runLoop("auto-suspend-rules", 5*time.Minute, s.autoSuspendRules)
	go s.runLoop("cancellation-rate-check", 10*time.Minute, s.checkCancellationRates)
	go s.runLoop("expire-stale-bookings", 5*time.Minute, s.expireStaleBookings)
 	go s.runLoop("cleanup-stale-geo", 5*time.Minute, s.cleanupStaleGeoEntries)
}

func (s *Scheduler) Stop() {
	close(s.stopCh)
	s.log.Info("scheduler stopped")
}

func (s *Scheduler) runLoop(name string, interval time.Duration, fn func()) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopCh:
			return
		case <-ticker.C:
			// Use Redis distributed lock to prevent multiple instances running same job
			if s.acquireLock(name, interval) {
				start := time.Now()
				fn()
				s.log.Debug("scheduler job completed", "job", name, "duration_ms", time.Since(start).Milliseconds())
			}
		}
	}
}

func (s *Scheduler) acquireLock(name string, ttl time.Duration) bool {
	if s.rdb == nil {
		return true // No Redis = single instance mode
	}
	key := fmt.Sprintf("scheduler:lock:%s", name)
	ok, _ := s.rdb.SetNX(context.Background(), key, "1", ttl).Result()
	return ok
}

// ─── Escrow Auto-Release ───
// 2 hours after booking COMPLETED with no dispute → release funds to transporter.
func (s *Scheduler) releaseEscrow() {
	twoHoursAgo := time.Now().Add(-2 * time.Hour)

	var bookings []models.Booking
	s.db.Where(
		"status = ? AND completed_at IS NOT NULL AND completed_at < ? AND escrow_release_at IS NULL AND payment_status = ?",
		models.BookingCompleted, twoHoursAgo, "ESCROWED",
	).Find(&bookings)

	for _, b := range bookings {
		var payment models.Payment
		if err := s.db.Where("booking_id = ? AND status = ?", b.ID, models.PayEscrowed).First(&payment).Error; err != nil {
			continue
		}

		now := time.Now()
		payment.Status = models.PayReleased
		payment.EscrowReleasedAt = &now
		s.db.Save(&payment)

		s.db.Model(&b).Updates(map[string]interface{}{
			"escrow_release_at": now,
			"payment_status":    "RELEASED",
		})

		if s.bus != nil {
			s.bus.Publish("payment.escrow_released", map[string]interface{}{
				"booking_id":     b.ID,
				"transporter_id": b.TransporterID,
				"amount_paise":   payment.AmountPaise,
			})
		}

		s.log.Info("escrow auto-released", "booking_id", b.ID, "amount", payment.AmountPaise)
	}
}

// ─── Ghost Transporter Detection ───
// If transporter accepted but no GPS ping in 20 minutes during ACCEPTED/PICKING_UP → alert.
func (s *Scheduler) detectGhostTransporters() {
	twentyMinAgo := time.Now().Add(-20 * time.Minute)

	var bookings []models.Booking
	s.db.Where(
		"status IN ? AND transporter_id IS NOT NULL AND (last_transporter_ping IS NULL OR last_transporter_ping < ?)",
		[]string{string(models.BookingAccepted), string(models.BookingPickingUp)},
		twentyMinAgo,
	).Find(&bookings)

	for _, b := range bookings {
		s.log.Warn("ghost transporter detected", "booking_id", b.ID, "transporter_id", b.TransporterID)

		if s.bus != nil {
			s.bus.Publish("notify.ghost_transporter", map[string]interface{}{
				"booking_id":     b.ID,
				"transporter_id": b.TransporterID,
				"customer_id":    b.CustomerID,
			})

			// Notify customer
			s.bus.Publish("notify.transporter_unreachable", map[string]interface{}{
				"customer_id":  b.CustomerID,
				"booking_id":   b.ID,
				"message":      "Your transporter appears unreachable. We're looking into it.",
			})
		}
	}
}

// ─── Scheduled Bookings ───
// Activate bookings that are scheduled for now or in the past (within 15 min window).
func (s *Scheduler) processScheduledBookings() {
	window := time.Now().Add(15 * time.Minute)

	var bookings []models.Booking
	s.db.Where(
		"status = ? AND scheduled_at IS NOT NULL AND scheduled_at <= ?",
		models.BookingPending, window,
	).Find(&bookings)

	for _, b := range bookings {
		if s.bus != nil {
			s.bus.Publish("booking.scheduled_activate", map[string]interface{}{
				"booking_id":  b.ID,
				"customer_id": b.CustomerID,
				"pickup_lat":  b.PickupLat,
				"pickup_lng":  b.PickupLng,
			})
		}

		s.log.Info("scheduled booking activated", "booking_id", b.ID, "scheduled_at", b.ScheduledAt)
	}
}

// ─── Expire Bids ───
// Close bidding windows that have passed.
func (s *Scheduler) expireBids() {
	var bookings []models.Booking
	s.db.Where("status = ? AND bidding_deadline IS NOT NULL AND bidding_deadline < ?",
		models.BookingBidding, time.Now()).Find(&bookings)

	for _, b := range bookings {
		var bids []models.Bid
		s.db.Where("booking_id = ? AND status = ?", b.ID, models.BidPending).Order("amount_paise ASC").Find(&bids)

		if len(bids) == 0 {
			// No bids → revert to PENDING
			s.db.Model(&b).Update("status", models.BookingPending)
			if s.bus != nil {
				s.bus.Publish("notify.bidding_expired_no_bids", map[string]interface{}{
					"booking_id":  b.ID,
					"customer_id": b.CustomerID,
				})
			}
			s.log.Info("bidding expired with no bids", "booking_id", b.ID)
		} else {
			// Auto-select lowest bid using transaction with optimistic locking
			lowestBid := bids[0]
			txErr := s.db.Transaction(func(tx *gorm.DB) error {
				// Optimistic lock: only update if still in BIDDING state with same version
				result := tx.Model(&models.Booking{}).
					Where("id = ? AND status = ? AND version = ?", b.ID, models.BookingBidding, b.Version).
					Updates(map[string]interface{}{
						"transporter_id": lowestBid.TransporterID,
						"vehicle_id":     lowestBid.VehicleID,
						"final_price":    lowestBid.AmountPaise,
						"status":         models.BookingAccepted,
						"version":        b.Version + 1,
					})
				if result.RowsAffected == 0 {
					return fmt.Errorf("booking already modified")
				}

				tx.Model(&lowestBid).Update("status", models.BidAccepted)
				tx.Model(&models.Bid{}).
					Where("booking_id = ? AND id != ? AND status = ?", b.ID, lowestBid.ID, models.BidPending).
					Update("status", models.BidExpired)
				return nil
			})
			if txErr != nil {
				s.log.Warn("bid auto-accept failed (concurrent modification)", "booking_id", b.ID, "error", txErr)
				continue
			}

			if s.bus != nil {
				s.bus.Publish("booking.accepted", map[string]interface{}{
					"booking_id":     b.ID,
					"transporter_id": lowestBid.TransporterID,
					"customer_id":    b.CustomerID,
				})
			}
			s.log.Info("bidding expired, auto-accepted lowest bid", "booking_id", b.ID, "bid_amount", lowestBid.AmountPaise)
		}
	}
}

// ─── Auto-Suspend Rules ───
// Fraud score >0.85 → auto-suspend. 3+ HIGH severity reports → temp ban.
func (s *Scheduler) autoSuspendRules() {
	// Rule 1: High fraud score
	var highFraud []models.User
	s.db.Where("fraud_score > ? AND status = ?", 0.85, models.StatusActive).Find(&highFraud)
	for _, u := range highFraud {
		s.suspendUser(u.ID, "Auto-suspended: fraud score exceeds threshold", "7d")
		s.log.Warn("auto-suspended high fraud user", "user_id", u.ID, "fraud_score", u.FraudScore)
	}

	// Rule 2: 3+ HIGH severity unresolved reports in 30 days
	thirtyDaysAgo := time.Now().Add(-30 * 24 * time.Hour)
	type reportCount struct {
		ReportedID uint
		Count      int64
	}
	var highReports []reportCount
	s.db.Model(&models.Report{}).
		Select("reported_id, COUNT(*) as count").
		Where("ai_severity >= 0.7 AND status IN ? AND created_at > ?",
			[]string{"PENDING", "UNDER_REVIEW"}, thirtyDaysAgo).
		Group("reported_id").Having("COUNT(*) >= 3").
		Scan(&highReports)

	for _, r := range highReports {
		var user models.User
		if s.db.First(&user, r.ReportedID).Error == nil && user.Status == models.StatusActive {
			s.suspendUser(r.ReportedID, fmt.Sprintf("Auto-suspended: %d high-severity reports in 30 days", r.Count), "7d")
			s.log.Warn("auto-suspended for high reports", "user_id", r.ReportedID, "report_count", r.Count)
		}
	}

	// Rule 3: 3+ chat flags in 24 hours → auto-suspend
	oneDayAgo := time.Now().Add(-24 * time.Hour)
	type flagCount struct {
		SenderID uint
		Count    int64
	}
	var flagged []flagCount
	s.db.Model(&models.Message{}).
		Select("sender_id, COUNT(*) as count").
		Where("flagged = true AND created_at > ?", oneDayAgo).
		Group("sender_id").Having("COUNT(*) >= 3").
		Scan(&flagged)

	for _, f := range flagged {
		var user models.User
		if s.db.First(&user, f.SenderID).Error == nil && user.Status == models.StatusActive {
			s.suspendUser(f.SenderID, fmt.Sprintf("Auto-suspended: %d chat violations in 24 hours", f.Count), "7d")
			s.log.Warn("auto-suspended for chat violations", "user_id", f.SenderID, "flag_count", f.Count)
		}
	}
}

// ─── Cancellation Rate Check ───
// >60% cancellation rate in 7 days → warning. Already warned → suspend.
func (s *Scheduler) checkCancellationRates() {
	sevenDaysAgo := time.Now().Add(-7 * 24 * time.Hour)

	type cancelStats struct {
		TransporterID uint
		Total         int64
		Cancelled     int64
	}
	var stats []cancelStats
	s.db.Raw(`
		SELECT transporter_id,
			COUNT(*) as total,
			SUM(CASE WHEN status = 'CANCELLED' AND cancelled_by = transporter_id THEN 1 ELSE 0 END) as cancelled
		FROM bookings
		WHERE transporter_id IS NOT NULL AND created_at > ?
		GROUP BY transporter_id
		HAVING COUNT(*) >= 5
	`, sevenDaysAgo).Scan(&stats)

	for _, st := range stats {
		if st.Total == 0 {
			continue
		}
		rate := float64(st.Cancelled) / float64(st.Total)
		if rate > 0.6 {
			var user models.User
			if s.db.First(&user, st.TransporterID).Error != nil {
				continue
			}
			if user.WarningCount >= 2 {
				s.suspendUser(st.TransporterID, fmt.Sprintf("High cancellation rate: %.0f%%", rate*100), "7d")
			} else {
				s.db.Model(&user).UpdateColumn("warning_count", gorm.Expr("warning_count + 1"))
				if s.bus != nil {
					s.bus.Publish("notify.high_cancellation_warning", map[string]interface{}{
						"user_id":          st.TransporterID,
						"cancellation_rate": rate,
					})
				}
				s.log.Warn("cancellation rate warning", "user_id", st.TransporterID, "rate", rate)
			}
		}
	}
}

// ─── Expire Stale Bookings ───
// PENDING bookings with no activity for 24 hours are auto-cancelled.
func (s *Scheduler) expireStaleBookings() {
	twentyFourHoursAgo := time.Now().Add(-24 * time.Hour)

	var bookings []models.Booking
	s.db.Where("status = ? AND scheduled_at IS NULL AND created_at < ?",
		models.BookingPending, twentyFourHoursAgo).Find(&bookings)

	now := time.Now()
	for _, b := range bookings {
		s.db.Model(&b).Updates(map[string]interface{}{
			"status":       models.BookingCancelled,
			"cancelled_at": now,
			"cancel_reason": "Auto-cancelled: no transporter accepted within 24 hours",
		})

		if s.bus != nil {
			s.bus.Publish("notify.booking_expired", map[string]interface{}{
				"booking_id":  b.ID,
				"customer_id": b.CustomerID,
			})
		}
		s.log.Info("stale booking auto-cancelled", "booking_id", b.ID)
	}
}

func (s *Scheduler) suspendUser(userID uint, reason, duration string) {
	now := time.Now()
	s.db.Model(&models.User{}).Where("id = ?", userID).Updates(map[string]interface{}{
		"status":         models.StatusSuspended,
		"suspended_at":   now,
		"suspend_reason": reason,
	})

	if s.rdb != nil {
		ctx := context.Background()
		s.rdb.SAdd(ctx, "revoked:users", userID)
		s.rdb.Set(ctx, fmt.Sprintf("revoked:user:%d", userID), "1", 30*24*time.Hour)
	}

	if s.bus != nil {
		s.bus.Publish("notify.account_suspended", map[string]interface{}{
			"user_id":  userID,
			"reason":   reason,
			"duration": duration,
		})
	}

	metadata, _ := json.Marshal(map[string]string{"duration": duration})
	s.db.Create(&models.AuditLog{
		AdminID:    0, // System
		Action:     "AUTO_SUSPEND",
		TargetID:   userID,
		TargetType: "USER",
		Reason:     reason,
		Metadata:   metadata,
	})
}

// ─── Cleanup Stale Geo Entries ───
// Removes transporters from Redis Geo sets who haven't updated location in 30 minutes.
// Also reconciles the online transporter set with actual activity.
func (s *Scheduler) cleanupStaleGeoEntries() {
	if s.rdb == nil {
		return
	}
	ctx := context.Background()

	// Get all members of transporters:geo set
	members, err := s.rdb.ZRangeByScore(ctx, "transporters:geo", &redis.ZRangeBy{
		Min: "-inf", Max: "+inf",
	}).Result()
	if err != nil {
		return
	}

	for _, memberID := range members {
		// Check if transporter has a recent location update
		locKey := fmt.Sprintf("user:loc:%s", memberID)
		exists, _ := s.rdb.Exists(ctx, locKey).Result()
		if exists == 0 {
			// Location expired (15min TTL) — remove from geo set
			s.rdb.ZRem(ctx, "transporters:geo", memberID)
			s.rdb.SRem(ctx, "surge:supply:online", memberID)
			s.log.Debug("removed stale transporter from geo", "transporter_id", memberID)
		}
	}

	// Also clean up stale vehicle geo entries
	vehicleMembers, _ := s.rdb.ZRangeByScore(ctx, "vehicles:geo", &redis.ZRangeBy{
		Min: "-inf", Max: "+inf",
	}).Result()
	for _, vid := range vehicleMembers {
		locKey := fmt.Sprintf("vehicle:loc:%s", vid)
		exists, _ := s.rdb.Exists(ctx, locKey).Result()
		if exists == 0 {
			s.rdb.ZRem(ctx, "vehicles:geo", vid)
			s.log.Debug("removed stale vehicle from geo", "vehicle_id", vid)
		}
	}
}

