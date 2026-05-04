package bidding

import (
	"log/slog"
	"strconv"
	"time"

	apperr "github.com/speedygo/speedygo/internal/errors"
	"github.com/speedygo/speedygo/internal/models"
	"github.com/speedygo/speedygo/internal/natsbus"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// Repository handles bid database operations.
type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) Create(bid *models.Bid) error { return r.db.Create(bid).Error }

func (r *Repository) FindByID(id uint) (*models.Bid, error) {
	var bid models.Bid
	err := r.db.Preload("Transporter").Preload("Vehicle").First(&bid, id).Error
	return &bid, err
}

func (r *Repository) FindByBooking(bookingID uint) ([]models.Bid, error) {
	var bids []models.Bid
	err := r.db.Where("booking_id = ?", bookingID).
		Preload("Transporter").Preload("Vehicle").
		Order("amount_paise ASC").Find(&bids).Error
	return bids, err
}

func (r *Repository) FindByTransporterAndBooking(transporterID, bookingID uint) (*models.Bid, error) {
	var bid models.Bid
	err := r.db.Where("transporter_id = ? AND booking_id = ?", transporterID, bookingID).First(&bid).Error
	return &bid, err
}

func (r *Repository) Update(bid *models.Bid) error { return r.db.Save(bid).Error }

func (r *Repository) ExpireBidsForBooking(bookingID uint, exceptBidID uint) error {
	return r.db.Model(&models.Bid{}).
		Where("booking_id = ? AND id != ? AND status = ?", bookingID, exceptBidID, models.BidPending).
		Update("status", models.BidExpired).Error
}

// Service handles transporter bidding logic.
type Service struct {
	repo *Repository
	bus  *natsbus.Bus
	db   *gorm.DB
	log  *slog.Logger
}

func NewService(repo *Repository, bus *natsbus.Bus, db *gorm.DB, log *slog.Logger) *Service {
	return &Service{repo: repo, bus: bus, db: db, log: log}
}

// DefaultBiddingWindow is 2 hours.
const DefaultBiddingWindow = 2 * time.Hour

type CreateBidReq struct {
	BookingID     uint  `json:"booking_id"`
	VehicleID     uint  `json:"vehicle_id"`
	AmountPaise   int64 `json:"amount_paise"`
	Note          string `json:"note"`
	EstimatedTime int   `json:"estimated_time_min"`
}

func (s *Service) PlaceBid(transporterID uint, req CreateBidReq) (*models.Bid, error) {
	// Validate booking exists and is in bidding state
	var booking models.Booking
	if err := s.db.First(&booking, req.BookingID).Error; err != nil {
		return nil, apperr.NotFound("Booking not found")
	}
	if booking.Status != models.BookingBidding {
		return nil, apperr.BadRequest("Booking is not accepting bids")
	}
	if booking.BiddingDeadline != nil && time.Now().After(*booking.BiddingDeadline) {
		return nil, apperr.BadRequest("Bidding window has closed")
	}

	// Validate vehicle belongs to transporter
	var vehicle models.Vehicle
	if err := s.db.First(&vehicle, req.VehicleID).Error; err != nil {
		return nil, apperr.NotFound("Vehicle not found")
	}
	if vehicle.OwnerID != transporterID {
		return nil, apperr.Forbidden("Vehicle does not belong to you")
	}

	// Check no duplicate bid from same transporter
	existing, _ := s.repo.FindByTransporterAndBooking(transporterID, req.BookingID)
	if existing != nil && existing.ID != 0 {
		return nil, apperr.Conflict("You already placed a bid on this booking")
	}

	// Validate bid amount (must be within reasonable range: 50%-200% of estimated)
	if req.AmountPaise < booking.EstimatedPrice/2 || req.AmountPaise > booking.EstimatedPrice*2 {
		return nil, apperr.BadRequest("Bid amount must be between 50% and 200% of estimated price")
	}

	bid := &models.Bid{
		BookingID:     req.BookingID,
		TransporterID: transporterID,
		VehicleID:     req.VehicleID,
		AmountPaise:   req.AmountPaise,
		Note:          req.Note,
		EstimatedTime: req.EstimatedTime,
		Status:        models.BidPending,
	}
	if err := s.repo.Create(bid); err != nil {
		return nil, apperr.Internal("Failed to place bid", err)
	}

	// Notify customer about new bid (sealed: don't reveal amount)
	if s.bus != nil {
		s.bus.Publish("notify.new_bid", map[string]interface{}{
			"booking_id":  req.BookingID,
			"customer_id": booking.CustomerID,
			"bid_count":   s.countBids(req.BookingID),
		})
	}

	s.log.Info("bid placed", "booking_id", req.BookingID, "transporter_id", transporterID, "amount", req.AmountPaise)
	return bid, nil
}

func (s *Service) countBids(bookingID uint) int64 {
	var count int64
	s.db.Model(&models.Bid{}).Where("booking_id = ? AND status = ?", bookingID, models.BidPending).Count(&count)
	return count
}

func (s *Service) AcceptBid(customerID, bidID uint) (*models.Booking, error) {
	bid, err := s.repo.FindByID(bidID)
	if err != nil {
		return nil, apperr.NotFound("Bid not found")
	}
	if bid.Status != models.BidPending {
		return nil, apperr.BadRequest("Bid is no longer available")
	}

	// Validate customer owns the booking
	var booking models.Booking
	if err := s.db.First(&booking, bid.BookingID).Error; err != nil {
		return nil, apperr.NotFound("Booking not found")
	}
	if booking.CustomerID != customerID {
		return nil, apperr.Forbidden("Not your booking")
	}
	if booking.Status != models.BookingBidding {
		return nil, apperr.BadRequest("Booking is no longer accepting bids")
	}

	// Use DB transaction with optimistic locking to prevent race condition
	// where two concurrent AcceptBid calls could both succeed
	txErr := s.db.Transaction(func(tx *gorm.DB) error {
		// Re-check bid status inside transaction
		var freshBid models.Bid
		if err := tx.First(&freshBid, bidID).Error; err != nil {
			return err
		}
		if freshBid.Status != models.BidPending {
			return apperr.BadRequest("Bid is no longer available")
		}

		// Optimistic lock on booking version
		result := tx.Model(&models.Booking{}).
			Where("id = ? AND version = ? AND status = ?", bid.BookingID, booking.Version, models.BookingBidding).
			Updates(map[string]interface{}{
				"transporter_id": bid.TransporterID,
				"vehicle_id":     bid.VehicleID,
				"final_price":    bid.AmountPaise,
				"status":         models.BookingAccepted,
				"version":        booking.Version + 1,
			})
		if result.RowsAffected == 0 {
			return apperr.Conflict("Booking was already updated by another request")
		}

		// Accept the winning bid
		tx.Model(&freshBid).Update("status", models.BidAccepted)

		// Expire all other bids
		tx.Model(&models.Bid{}).
			Where("booking_id = ? AND id != ? AND status = ?", bid.BookingID, bid.ID, models.BidPending).
			Update("status", models.BidExpired)

		return nil
	})
	if txErr != nil {
		if _, ok := apperr.IsAppError(txErr); ok {
			return nil, txErr
		}
		return nil, apperr.Conflict("Bid acceptance failed due to concurrent modification")
	}

	// Notify accepted transporter
	if s.bus != nil {
		s.bus.Publish("booking.accepted", map[string]interface{}{
			"booking_id":     bid.BookingID,
			"transporter_id": bid.TransporterID,
			"customer_id":    customerID,
			"bid_amount":     bid.AmountPaise,
		})
	}

	// Notify rejected bidders
	bids, _ := s.repo.FindByBooking(bid.BookingID)
	for _, b := range bids {
		if b.ID != bid.ID && b.Status == models.BidExpired {
			if s.bus != nil {
				s.bus.Publish("notify.bid_rejected", map[string]interface{}{
					"transporter_id": b.TransporterID,
					"booking_id":     bid.BookingID,
				})
			}
		}
	}

	s.db.First(&booking, bid.BookingID)
	return &booking, nil
}

func (s *Service) GetBidsForBooking(bookingID, userID uint) ([]models.Bid, error) {
	var booking models.Booking
	if err := s.db.First(&booking, bookingID).Error; err != nil {
		return nil, apperr.NotFound("Booking not found")
	}
	// Customer can see all bids; transporter can only see their own bid
	if booking.CustomerID == userID {
		return s.repo.FindByBooking(bookingID)
	}
	// Transporter: return only their own bid
	bid, err := s.repo.FindByTransporterAndBooking(userID, bookingID)
	if err != nil {
		return nil, apperr.NotFound("No bid found")
	}
	return []models.Bid{*bid}, nil
}

// ExpireOldBids is called by the scheduler to close expired bidding windows.
func (s *Service) ExpireOldBids() {
	var bookings []models.Booking
	s.db.Where("status = ? AND bidding_deadline < ?", models.BookingBidding, time.Now()).Find(&bookings)

	for _, b := range bookings {
		bids, _ := s.repo.FindByBooking(b.ID)
		if len(bids) == 0 {
			// No bids received — revert to PENDING for direct accept
			s.db.Model(&b).Update("status", models.BookingPending)
			s.log.Info("bidding expired with no bids, reverting to PENDING", "booking_id", b.ID)
		} else {
			// Auto-select lowest bid
			lowestBid := bids[0] // Already sorted ASC by amount
			s.AcceptBid(b.CustomerID, lowestBid.ID)
			s.log.Info("bidding expired, auto-accepted lowest bid", "booking_id", b.ID, "bid_id", lowestBid.ID)
		}
	}
}

// Handler exposes bidding HTTP endpoints.
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// PlaceBid POST /bookings/:id/bids
func (h *Handler) PlaceBid(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	bookingID, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || bookingID == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid booking ID"})
	}
	var req CreateBidReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}
	req.BookingID = uint(bookingID)
	bid, err := h.svc.PlaceBid(userID, req)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.Status(201).JSON(bid)
}

// GetBids GET /bookings/:id/bids
func (h *Handler) GetBids(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	bookingID, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || bookingID == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid booking ID"})
	}
	bids, err := h.svc.GetBidsForBooking(uint(bookingID), userID)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(bids)
}

// AcceptBid PUT /bookings/bids/:bidID/accept
func (h *Handler) AcceptBid(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	bidID, err := strconv.ParseUint(c.Params("bidID"), 10, 64)
	if err != nil || bidID == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid bid ID"})
	}
	booking, err := h.svc.AcceptBid(userID, uint(bidID))
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(booking)
}

