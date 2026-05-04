package booking

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"time"

	"github.com/redis/go-redis/v9"
	apperr "github.com/speedygo/speedygo/internal/errors"
	"github.com/speedygo/speedygo/internal/models"
	"github.com/speedygo/speedygo/internal/natsbus"
	"github.com/speedygo/speedygo/internal/otp"
)

type Service struct {
	repo *Repository
	bus  *natsbus.Bus
	rdb  *redis.Client
	log  *slog.Logger
	otp  *otp.Service
}

func NewService(repo *Repository, bus *natsbus.Bus, rdb *redis.Client, otpSvc *otp.Service, log *slog.Logger) *Service {
	return &Service{repo: repo, bus: bus, rdb: rdb, log: log, otp: otpSvc}
}

type WaypointReq struct {
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
	Address     string  `json:"address"`
	Contact     string  `json:"contact,omitempty"`
	Description string  `json:"description,omitempty"`
}

type CreateBookingReq struct {
	PickupLat        float64       `json:"pickup_lat" validate:"required"`
	PickupLng        float64       `json:"pickup_lng" validate:"required"`
	PickupAddress    string        `json:"pickup_address" validate:"required"`
	PickupContact    string        `json:"pickup_contact"`
	DropLat          float64       `json:"drop_lat" validate:"required"`
	DropLng          float64       `json:"drop_lng" validate:"required"`
	DropAddress      string        `json:"drop_address" validate:"required"`
	DropContact      string        `json:"drop_contact"`
	GoodsDescription string        `json:"goods_description"`
	GoodsWeightKg    float64       `json:"goods_weight_kg"`
	GoodsFragile     bool          `json:"goods_fragile"`
	ScheduledAt      string        `json:"scheduled_at,omitempty"`
	BiddingEnabled   bool          `json:"bidding_enabled"`
	Waypoints        []WaypointReq `json:"waypoints,omitempty"`
}

// validTransitions defines which booking status transitions are allowed.
var validTransitions = map[models.BookingStatus][]models.BookingStatus{
	models.BookingPending:   {models.BookingBidding, models.BookingAccepted, models.BookingCancelled},
	models.BookingBidding:   {models.BookingAccepted, models.BookingCancelled},
	models.BookingAccepted:  {models.BookingPickingUp, models.BookingCancelled},
	models.BookingPickingUp: {models.BookingInTransit, models.BookingCancelled},
	models.BookingInTransit: {models.BookingCompleted, models.BookingDisputed},
	models.BookingCompleted: {models.BookingDisputed},
	models.BookingDisputed:  {models.BookingCompleted},
}

// haversineKm calculates straight-line distance between two lat/lng points in km.
func haversineKm(lat1, lng1, lat2, lng2 float64) float64 {
	const R = 6371.0
	dLat := (lat2 - lat1) * math.Pi / 180
	dLng := (lng2 - lng1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}

// roadDistanceMultiplier estimates actual road distance from straight-line distance.
// Urban routes are ~1.3-1.4x, rural ~1.2x. We use a conservative average of 1.35x.
func roadDistanceMultiplier(straightLineKm float64) float64 {
	if straightLineKm < 5 {
		return 1.4 // City driving has more detours
	}
	if straightLineKm < 50 {
		return 1.35 // Suburban/inter-city
	}
	return 1.25 // Highway routes are more direct
}

// surgeMultiplier returns a demand-based multiplier (1.0 = normal, up to 2.0).
// Uses Redis to track real-time booking demand vs available transporters.
// Falls back to time-of-day heuristic if Redis is unavailable.
func (s *Service) surgeMultiplier() float64 {
	if s.rdb != nil {
		ctx := context.Background()
		// Track bookings created in last 15 minutes as demand signal
		demandKey := "surge:demand:15m"
		supplyKey := "surge:supply:online"

		demand, _ := s.rdb.Get(ctx, demandKey).Int64()
		supply, _ := s.rdb.SCard(ctx, supplyKey).Result()

		if supply > 0 && demand > 0 {
			ratio := float64(demand) / float64(supply)
			switch {
			case ratio > 3.0:
				return 1.5 // Very high demand
			case ratio > 2.0:
				return 1.3
			case ratio > 1.5:
				return 1.2
			case ratio > 1.0:
				return 1.1
			}
			return 1.0
		}
	}

	// Fallback: time-of-day heuristic
	hour := time.Now().Hour()
	if (hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20) {
		return 1.2
	}
	if hour >= 23 || hour < 5 {
		return 1.15
	}
	return 1.0
}

// trackDemand records a booking creation in Redis for surge calculation.
func (s *Service) trackDemand() {
	if s.rdb != nil {
		ctx := context.Background()
		key := "surge:demand:15m"
		s.rdb.Incr(ctx, key)
		s.rdb.Expire(ctx, key, 15*time.Minute)
	}
}

// calculatePrice computes tiered pricing in paise.
// Base: ₹500 + distance tiers + weight tiers + fragile + waypoints + surge
func calculatePrice(distanceKm, weightKg float64, fragile bool, waypointCount int, surge float64) int64 {
	basePaise := int64(50000) // ₹500 base

	// Distance-based tiered pricing (per km in paise)
	var distPaise float64
	switch {
	case distanceKm <= 10:
		distPaise = distanceKm * 2500 // ₹25/km first 10km
	case distanceKm <= 50:
		distPaise = 10*2500 + (distanceKm-10)*2000 // ₹20/km 10-50km
	case distanceKm <= 200:
		distPaise = 10*2500 + 40*2000 + (distanceKm-50)*1500 // ₹15/km 50-200km
	default:
		distPaise = 10*2500 + 40*2000 + 150*1500 + (distanceKm-200)*1200 // ₹12/km 200+km
	}

	// Weight-based tiered pricing (per kg in paise)
	var weightPaise float64
	switch {
	case weightKg <= 50:
		weightPaise = weightKg * 1000 // ₹10/kg first 50kg
	case weightKg <= 500:
		weightPaise = 50*1000 + (weightKg-50)*800 // ₹8/kg 50-500kg
	default:
		weightPaise = 50*1000 + 450*800 + (weightKg-500)*600 // ₹6/kg 500+kg
	}

	total := float64(basePaise) + distPaise + weightPaise

	// Fragile goods: 15% surcharge
	if fragile {
		total *= 1.15
	}

	// Multi-stop surcharge: ₹75 per extra stop
	total += float64(waypointCount) * 7500

	// Apply surge multiplier
	total *= surge

	// Round to nearest 100 paise (₹1)
	return int64(math.Round(total/100)) * 100
}

func (s *Service) Create(customerID uint, req CreateBookingReq) (*models.Booking, error) {
	// Validate coordinates
	if req.PickupLat < -90 || req.PickupLat > 90 || req.PickupLng < -180 || req.PickupLng > 180 {
		return nil, apperr.BadRequest("Invalid pickup coordinates")
	}
	if req.DropLat < -90 || req.DropLat > 90 || req.DropLng < -180 || req.DropLng > 180 {
		return nil, apperr.BadRequest("Invalid drop coordinates")
	}

	// Validate weight
	if req.GoodsWeightKg < 0 {
		return nil, apperr.BadRequest("Goods weight cannot be negative")
	}
	if req.GoodsWeightKg > 25000 {
		return nil, apperr.BadRequest("Goods weight exceeds maximum of 25,000 kg")
	}

	// Validate waypoints
	if len(req.Waypoints) > 10 {
		return nil, apperr.BadRequest("Maximum 10 waypoints allowed")
	}
	for _, wp := range req.Waypoints {
		if wp.Lat < -90 || wp.Lat > 90 || wp.Lng < -180 || wp.Lng > 180 {
			return nil, apperr.BadRequest("Invalid waypoint coordinates")
		}
	}

	// Calculate straight-line distance using Haversine
	straightDist := haversineKm(req.PickupLat, req.PickupLng, req.DropLat, req.DropLng)

	// Add waypoint distances if multi-stop
	if len(req.Waypoints) > 0 {
		straightDist = 0
		prevLat, prevLng := req.PickupLat, req.PickupLng
		for _, wp := range req.Waypoints {
			straightDist += haversineKm(prevLat, prevLng, wp.Lat, wp.Lng)
			prevLat, prevLng = wp.Lat, wp.Lng
		}
		straightDist += haversineKm(prevLat, prevLng, req.DropLat, req.DropLng)
	}

	// Apply road-distance multiplier for realistic estimate
	totalDist := straightDist * roadDistanceMultiplier(straightDist)

	if totalDist < 0.5 {
		totalDist = 0.5
	}
	if totalDist > 5000 {
		return nil, apperr.BadRequest("Maximum booking distance is 5,000 km")
	}

	// Production-grade tiered pricing
	surge := s.surgeMultiplier()
	pricePaise := calculatePrice(totalDist, req.GoodsWeightKg, req.GoodsFragile, len(req.Waypoints), surge)

	status := models.BookingPending
	var biddingDeadline *time.Time
	if req.BiddingEnabled {
		status = models.BookingBidding
		dl := time.Now().Add(2 * time.Hour)
		biddingDeadline = &dl
	}

	b := &models.Booking{
		CustomerID:       customerID,
		Status:           status,
		PickupLat:        req.PickupLat,
		PickupLng:        req.PickupLng,
		PickupAddress:    req.PickupAddress,
		PickupContact:    req.PickupContact,
		DropLat:          req.DropLat,
		DropLng:          req.DropLng,
		DropAddress:      req.DropAddress,
		DropContact:      req.DropContact,
		GoodsDescription: req.GoodsDescription,
		GoodsWeightKg:    req.GoodsWeightKg,
		GoodsFragile:     req.GoodsFragile,
		HasMultiStop:     len(req.Waypoints) > 0,
		DistanceKm:       totalDist,
		EstimatedPrice:   pricePaise,
		FinalPrice:       pricePaise,
		Currency:         "INR",
		BiddingEnabled:   req.BiddingEnabled,
		BiddingDeadline:  biddingDeadline,
		Version:          1,
	}

	if req.ScheduledAt != "" {
		t, err := time.Parse(time.RFC3339, req.ScheduledAt)
		if err == nil {
			if t.Before(time.Now().Add(30 * time.Minute)) {
				return nil, apperr.BadRequest("Scheduled time must be at least 30 minutes in the future")
			}
			b.ScheduledAt = &t
		}
	}

	if err := s.repo.Create(b); err != nil {
		return nil, apperr.Internal("Failed to create booking", err)
	}

	// Track demand for surge pricing
	s.trackDemand()

	// Create waypoints
	for i, wp := range req.Waypoints {
		waypoint := models.Waypoint{
			BookingID:   b.ID,
			SeqOrder:    i + 1,
			Lat:         wp.Lat,
			Lng:         wp.Lng,
			Address:     wp.Address,
			Contact:     wp.Contact,
			Description: wp.Description,
		}
		s.repo.CreateWaypoint(&waypoint)
	}

	if s.bus != nil {
		s.bus.Publish("booking.created", map[string]interface{}{
			"booking_id":  b.ID,
			"customer_id": customerID,
			"pickup_lat":  req.PickupLat,
			"pickup_lng":  req.PickupLng,
			"bidding":     req.BiddingEnabled,
		})
	}

	return b, nil
}

func (s *Service) GetByID(id uint) (*models.Booking, error) {
	b, err := s.repo.FindByID(id)
	if err != nil {
		return nil, apperr.NotFound("Booking not found")
	}
	return b, nil
}

func (s *Service) GetMyBookings(userID uint, role models.UserRole, limit, offset int) ([]models.Booking, int64, error) {
	if role == models.RoleTransporter {
		return s.repo.FindByTransporter(userID, limit, offset)
	}
	return s.repo.FindByCustomer(userID, limit, offset)
}

type UpdateStatusReq struct {
	Status       models.BookingStatus `json:"status" validate:"required"`
	CancelReason string               `json:"cancel_reason,omitempty"`
}

// CalculateCancellationFee computes tiered cancellation fees.
// >24h before = free, 24h-2h = 10%, 2h-15min = 25%, <15min = 50%
func CalculateCancellationFee(b *models.Booking) int64 {
	if b.ScheduledAt == nil {
		switch b.Status {
		case models.BookingPending, models.BookingBidding:
			return 0
		case models.BookingAccepted:
			return b.FinalPrice / 10
		case models.BookingPickingUp:
			return b.FinalPrice / 4
		default:
			return b.FinalPrice / 2
		}
	}
	timeUntil := time.Until(*b.ScheduledAt)
	switch {
	case timeUntil > 24*time.Hour:
		return 0
	case timeUntil > 2*time.Hour:
		return b.FinalPrice / 10
	case timeUntil > 15*time.Minute:
		return b.FinalPrice / 4
	default:
		return b.FinalPrice / 2
	}
}

func (s *Service) UpdateStatus(bookingID, userID uint, req UpdateStatusReq) (*models.Booking, error) {
	if userID == 0 {
		return nil, apperr.Unauthorized("Authentication required")
	}
	b, err := s.repo.FindByID(bookingID)
	if err != nil {
		return nil, apperr.NotFound("Booking not found")
	}

	isCustomer := b.CustomerID == userID
	isTransporter := b.TransporterID != nil && *b.TransporterID == userID
	if !isCustomer && !isTransporter {
		return nil, apperr.Forbidden("Not a participant of this booking")
	}

	// Role-based transition enforcement
	switch req.Status {
	case models.BookingPickingUp, models.BookingInTransit, models.BookingCompleted:
		if !isTransporter {
			return nil, apperr.Forbidden("Only the assigned transporter can update to this status")
		}
	case models.BookingCancelled:
		// Customer cannot cancel once IN_TRANSIT
		if isCustomer && b.Status == models.BookingInTransit {
			return nil, apperr.Forbidden("Customer cannot cancel after goods are in transit. File a dispute instead")
		}
		// Transporter cannot cancel after IN_TRANSIT
		if isTransporter && b.Status == models.BookingInTransit {
			return nil, apperr.Forbidden("Transporter cannot cancel during transit. Complete delivery or contact support")
		}
	case models.BookingDisputed:
		// Both parties can dispute
	}

	allowed, ok := validTransitions[b.Status]
	if !ok {
		return nil, apperr.BadRequest(fmt.Sprintf("Cannot transition from %s", b.Status))
	}
	valid := false
	for _, st := range allowed {
		if st == req.Status {
			valid = true
			break
		}
	}
	if !valid {
		return nil, apperr.BadRequest(fmt.Sprintf("Invalid transition: %s → %s", b.Status, req.Status))
	}

	// Delivery photo enforcement
	if req.Status == models.BookingCompleted && b.Status == models.BookingInTransit {
		if b.DeliveryPhotos == nil || string(b.DeliveryPhotos) == "null" || string(b.DeliveryPhotos) == "[]" {
			return nil, apperr.BadRequest("Delivery photos required before marking complete")
		}
	}

	if err := s.repo.UpdateStatus(bookingID, req.Status, b.Version); err != nil {
		return nil, apperr.Conflict("Booking was modified by another request")
	}

	// Refresh version and status after optimistic lock update
	b.Version++
	b.Status = req.Status

	now := time.Now()
	switch req.Status {
	case models.BookingCancelled:
		fee := CalculateCancellationFee(b)
		b.CancelledAt = &now
		b.CancelledBy = &userID
		b.CancelReason = req.CancelReason
		b.CancellationFee = fee
		s.repo.Update(b)
		s.repo.IncrementCancellationCount(userID)
		if s.bus != nil {
			s.bus.Publish("booking.cancelled", map[string]interface{}{
				"booking_id": bookingID, "cancelled_by": userID, "cancellation_fee": fee,
			})
		}
	case models.BookingInTransit:
		b.PickedUpAt = &now
		s.repo.Update(b)
		if s.bus != nil {
			s.bus.Publish("booking.in_transit", map[string]interface{}{"booking_id": bookingID})
		}
	case models.BookingCompleted:
		b.DeliveredAt = &now
		b.CompletedAt = &now
		s.repo.Update(b)
		if s.bus != nil {
			s.bus.Publish("booking.completed", map[string]interface{}{
				"booking_id": bookingID, "final_price": b.FinalPrice,
			})
		}
	case models.BookingDisputed:
		s.repo.Update(b)
		if s.bus != nil {
			s.bus.Publish("booking.disputed", map[string]interface{}{
				"booking_id": bookingID, "disputed_by": userID,
			})
		}
	}

	return b, nil
}

func (s *Service) AcceptBooking(bookingID, transporterID, vehicleID uint) (*models.Booking, error) {
	b, err := s.repo.FindByID(bookingID)
	if err != nil {
		return nil, apperr.NotFound("Booking not found")
	}
	if b.Status != models.BookingPending && b.Status != models.BookingBidding {
		return nil, apperr.BadRequest("Booking is not available for acceptance")
	}
	if b.Status == models.BookingBidding && b.BiddingEnabled {
		return nil, apperr.BadRequest("Booking is in bidding mode — use the bid system instead")
	}

	// Atomic transaction: overcommit check + assign + status update
	// This prevents TOCTOU race where two transporters accept simultaneously
	err = s.repo.AcceptBookingAtomic(bookingID, transporterID, vehicleID, b.Version)
	if err != nil {
		if err.Error() == "overcommit" {
			return nil, apperr.Conflict("Transporter already has 3 active bookings. Complete or cancel existing bookings first")
		}
		if err.Error() == "vehicle_mismatch" {
			return nil, apperr.Forbidden("Vehicle does not belong to you")
		}
		if err.Error() == "vehicle_not_approved" {
			return nil, apperr.Forbidden("Vehicle is not approved by admin yet")
		}
		return nil, apperr.Conflict("Booking was already accepted by another transporter")
	}

	if s.bus != nil {
		s.bus.Publish("booking.accepted", map[string]interface{}{
			"booking_id": bookingID, "transporter_id": transporterID, "customer_id": b.CustomerID,
		})
	}

	// Generate pickup verification OTP (4-digit)
	pickupOTP := fmt.Sprintf("%04d", time.Now().UnixNano()%10000)
	s.repo.UpdatePickupOTP(bookingID, pickupOTP)

	return s.repo.FindByID(bookingID)
}

// FlagGoodsMismatch allows transporter to flag goods mismatch at pickup.
type GoodsMismatchReq struct {
	Note string `json:"note"`
}

func (s *Service) FlagGoodsMismatch(bookingID, transporterID uint, req GoodsMismatchReq) (*models.Booking, error) {
	b, err := s.repo.FindByID(bookingID)
	if err != nil {
		return nil, apperr.NotFound("Booking not found")
	}
	if b.TransporterID == nil || *b.TransporterID != transporterID {
		return nil, apperr.Forbidden("Not the assigned transporter")
	}
	if b.Status != models.BookingAccepted && b.Status != models.BookingPickingUp {
		return nil, apperr.BadRequest("Can only flag mismatch before loading")
	}
	b.GoodsMismatch = true
	b.MismatchNote = req.Note
	s.repo.Update(b)
	if s.bus != nil {
		s.bus.Publish("booking.goods_mismatch", map[string]interface{}{
			"booking_id": bookingID, "transporter_id": transporterID, "customer_id": b.CustomerID, "note": req.Note,
		})
	}
	return b, nil
}

// UploadPhotos allows uploading pickup/delivery photos.
type UploadPhotosReq struct {
	Stage string   `json:"stage"` // "pickup" or "delivery"
	URLs  []string `json:"urls"`
}

func (s *Service) UploadPhotos(bookingID, userID uint, req UploadPhotosReq) error {
	b, err := s.repo.FindByID(bookingID)
	if err != nil {
		return apperr.NotFound("Booking not found")
	}
	isParticipant := b.CustomerID == userID || (b.TransporterID != nil && *b.TransporterID == userID)
	if !isParticipant {
		return apperr.Forbidden("Not a participant")
	}
	if req.Stage != "pickup" && req.Stage != "delivery" {
		return apperr.BadRequest("Stage must be 'pickup' or 'delivery'")
	}
	if len(req.URLs) == 0 || len(req.URLs) > 10 {
		return apperr.BadRequest("1-10 photos required")
	}
	return s.repo.UpdatePhotos(bookingID, req.Stage, req.URLs)
}

// GetNearbyBookings returns pending/bidding bookings near the transporter's location.
// This allows transporters to discover bookings they can accept or bid on.
func (s *Service) GetNearbyBookings(lat, lng, radiusKm float64, limit int) ([]models.Booking, error) {
	if lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		return nil, apperr.BadRequest("Invalid coordinates")
	}
	if radiusKm <= 0 || radiusKm > 200 {
		return nil, apperr.BadRequest("Radius must be between 0 and 200 km")
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	return s.repo.FindPendingInArea(lat, lng, radiusKm, limit)
}

// GetPriceEstimate returns a price estimate without creating a booking.
func (s *Service) GetPriceEstimate(req CreateBookingReq) (int64, float64, error) {
	straightDist := haversineKm(req.PickupLat, req.PickupLng, req.DropLat, req.DropLng)
	if len(req.Waypoints) > 0 {
		straightDist = 0
		prevLat, prevLng := req.PickupLat, req.PickupLng
		for _, wp := range req.Waypoints {
			straightDist += haversineKm(prevLat, prevLng, wp.Lat, wp.Lng)
			prevLat, prevLng = wp.Lat, wp.Lng
		}
		straightDist += haversineKm(prevLat, prevLng, req.DropLat, req.DropLng)
	}
	totalDist := straightDist * roadDistanceMultiplier(straightDist)
	if totalDist < 0.5 {
		totalDist = 0.5
	}
	surge := s.surgeMultiplier()
	price := calculatePrice(totalDist, req.GoodsWeightKg, req.GoodsFragile, len(req.Waypoints), surge)
	return price, totalDist, nil
}

// SendBookingOTP sends an OTP to the customer's email for booking confirmation.
// Called after booking is created. Booking stays in PENDING until OTP verified.
func (s *Service) SendBookingOTP(bookingID, customerID uint, email string) error {
	if s.otp == nil {
		return nil // OTP service not available, skip
	}
	identifier := fmt.Sprintf("booking:%d:%s", bookingID, email)
	return s.otp.SendOTP(context.Background(), identifier, otp.PurposeBooking)
}

// VerifyBookingOTP verifies the OTP for a booking.
func (s *Service) VerifyBookingOTP(bookingID, userID uint, email, code string) (*models.Booking, error) {
	b, err := s.repo.FindByID(bookingID)
	if err != nil {
		return nil, apperr.NotFound("Booking not found")
	}
	if b.CustomerID != userID {
		return nil, apperr.Forbidden("Not your booking")
	}
	if b.Status != models.BookingPending {
		return nil, apperr.BadRequest("Booking is not in pending state")
	}

	if s.otp != nil {
		identifier := fmt.Sprintf("booking:%d:%s", bookingID, email)
		if err := s.otp.VerifyOTP(context.Background(), identifier, otp.PurposeBooking, code); err != nil {
			return nil, apperr.BadRequest(err.Error())
		}
	}

	// OTP verified — booking confirmed, notify transporters
	if s.bus != nil {
		s.bus.Publish("booking.confirmed", map[string]interface{}{
			"booking_id":  bookingID,
			"customer_id": userID,
			"pickup_lat":  b.PickupLat,
			"pickup_lng":  b.PickupLng,
		})
	}

	s.log.Info("booking OTP verified", "booking_id", bookingID, "customer_id", userID)
	return b, nil
}

// VerifyPickupOTP verifies the OTP given by customer to transporter at pickup.
// Transitions booking from PICKING_UP to IN_TRANSIT.
func (s *Service) VerifyPickupOTP(bookingID, transporterID uint, code string) (*models.Booking, error) {
	b, err := s.repo.FindByID(bookingID)
	if err != nil {
		return nil, apperr.NotFound("Booking not found")
	}
	if b.TransporterID == nil || *b.TransporterID != transporterID {
		return nil, apperr.Forbidden("Not the assigned transporter")
	}
	if b.Status != models.BookingPickingUp && b.Status != models.BookingAccepted {
		return nil, apperr.BadRequest("Booking is not in pickup state")
	}
	if b.PickupOTP == "" || b.PickupOTP != code {
		return nil, apperr.BadRequest("Invalid OTP")
	}

	now := time.Now()
	b.Status = models.BookingInTransit
	b.PickedUpAt = &now
	b.PickupOTP = "" // Clear OTP after verification
	if err := s.repo.Update(b); err != nil {
		return nil, apperr.Internal("Failed to update booking", err)
	}

	if s.bus != nil {
		s.bus.Publish("booking.in_transit", map[string]interface{}{
			"booking_id": bookingID, "transporter_id": transporterID, "customer_id": b.CustomerID,
		})
	}
	s.log.Info("pickup OTP verified, booking in transit", "booking_id", bookingID)
	return b, nil
}

// RateTransporter allows customer to rate the transporter after completion.
func (s *Service) RateTransporter(bookingID, customerID uint, rating float64) (*models.Booking, error) {
	if rating < 1 || rating > 5 {
		return nil, apperr.BadRequest("Rating must be between 1 and 5")
	}
	b, err := s.repo.FindByID(bookingID)
	if err != nil {
		return nil, apperr.NotFound("Booking not found")
	}
	if b.CustomerID != customerID {
		return nil, apperr.Forbidden("Not the customer of this booking")
	}
	if b.Status != models.BookingCompleted {
		return nil, apperr.BadRequest("Can only rate completed bookings")
	}
	if b.TransporterRating != nil {
		return nil, apperr.BadRequest("Already rated")
	}
	b.TransporterRating = &rating
	if err := s.repo.Update(b); err != nil {
		return nil, apperr.Internal("Failed to save rating", err)
	}
	// Update transporter's average rating
	if b.TransporterID != nil {
		_ = s.repo.UpdateUserRating(*b.TransporterID, rating)
	}
	return b, nil
}

// RateCustomer allows transporter to rate the customer after completion.
func (s *Service) RateCustomer(bookingID, transporterID uint, rating float64) (*models.Booking, error) {
	if rating < 1 || rating > 5 {
		return nil, apperr.BadRequest("Rating must be between 1 and 5")
	}
	b, err := s.repo.FindByID(bookingID)
	if err != nil {
		return nil, apperr.NotFound("Booking not found")
	}
	if b.TransporterID == nil || *b.TransporterID != transporterID {
		return nil, apperr.Forbidden("Not the transporter of this booking")
	}
	if b.Status != models.BookingCompleted {
		return nil, apperr.BadRequest("Can only rate completed bookings")
	}
	if b.CustomerRating != nil {
		return nil, apperr.BadRequest("Already rated")
	}
	b.CustomerRating = &rating
	if err := s.repo.Update(b); err != nil {
		return nil, apperr.Internal("Failed to save rating", err)
	}
	// Update customer's average rating
	_ = s.repo.UpdateUserRating(b.CustomerID, rating)
	return b, nil
}

// CompleteBooking marks booking as completed by transporter.
func (s *Service) CompleteBooking(bookingID, transporterID uint) (*models.Booking, error) {
	b, err := s.repo.FindByID(bookingID)
	if err != nil {
		return nil, apperr.NotFound("Booking not found")
	}
	if b.TransporterID == nil || *b.TransporterID != transporterID {
		return nil, apperr.Forbidden("Not the assigned transporter")
	}
	if b.Status != models.BookingInTransit {
		return nil, apperr.BadRequest("Booking is not in transit")
	}
	// Enforce delivery photos before completion
	if b.DeliveryPhotos == nil || string(b.DeliveryPhotos) == "null" || string(b.DeliveryPhotos) == "[]" {
		return nil, apperr.BadRequest("Delivery photos required before marking complete. Upload via POST /bookings/:id/photos")
	}
	now := time.Now()
	b.Status = models.BookingCompleted
	b.CompletedAt = &now
	b.DeliveredAt = &now
	if err := s.repo.Update(b); err != nil {
		return nil, apperr.Internal("Failed to complete booking", err)
	}
	if s.bus != nil {
		s.bus.Publish("booking.completed", map[string]interface{}{
			"booking_id": bookingID, "transporter_id": transporterID, "customer_id": b.CustomerID,
		})
	}
	return b, nil
}

// SetTransporterAvailability sets transporter online/offline status.
// Updates both DB and Redis for real-time surge pricing calculations.
func (s *Service) SetTransporterAvailability(userID uint, available bool) error {
	if err := s.repo.UpdateUserAvailability(userID, available); err != nil {
		return err
	}

	// Track online transporters in Redis for surge pricing
	if s.rdb != nil {
		ctx := context.Background()
		key := "surge:supply:online"
		if available {
			s.rdb.SAdd(ctx, key, userID)
		} else {
			s.rdb.SRem(ctx, key, userID)
			// Also remove from transporters geo set when going offline
			s.rdb.ZRem(ctx, "transporters:geo", fmt.Sprintf("%d", userID))
		}
	}

	return nil
}

