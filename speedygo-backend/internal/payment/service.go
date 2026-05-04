package payment

import (
	"fmt"
	"log/slog"
	"os"
	"time"

	apperr "github.com/speedygo/speedygo/internal/errors"
	"github.com/speedygo/speedygo/internal/models"
	"github.com/speedygo/speedygo/internal/natsbus"
	"github.com/stripe/stripe-go/v76"
	"github.com/stripe/stripe-go/v76/paymentintent"
	"github.com/stripe/stripe-go/v76/refund"
	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) Create(p *models.Payment) error       { return r.db.Create(p).Error }
func (r *Repository) Update(p *models.Payment) error       { return r.db.Save(p).Error }

func (r *Repository) FindByBookingID(bookingID uint) (*models.Payment, error) {
	var p models.Payment
	err := r.db.Where("booking_id = ?", bookingID).First(&p).Error
	return &p, err
}

func (r *Repository) FindByStripeID(stripeID string) (*models.Payment, error) {
	var p models.Payment
	err := r.db.Where("stripe_payment_id = ?", stripeID).First(&p).Error
	return &p, err
}

type Service struct {
	repo *Repository
	bus  *natsbus.Bus
	log  *slog.Logger
}

func NewService(repo *Repository, bus *natsbus.Bus, log *slog.Logger) *Service {
	stripe.Key = os.Getenv("STRIPE_SECRET_KEY")
	return &Service{repo: repo, bus: bus, log: log}
}

// ValidateBookingForPayment ensures the booking exists, caller is the customer, and it's in a payable state.
func (s *Service) ValidateBookingForPayment(bookingID, customerID uint, amountPaise int64) (*models.Booking, error) {
	var booking models.Booking
	if err := s.repo.db.First(&booking, bookingID).Error; err != nil {
		return nil, apperr.NotFound("Booking not found")
	}
	if booking.CustomerID != customerID {
		return nil, apperr.Forbidden("You are not the customer for this booking")
	}
	if booking.Status != models.BookingAccepted && booking.Status != models.BookingPickingUp {
		return nil, apperr.BadRequest("Payment can only be initiated for accepted bookings")
	}
	if booking.PaymentStatus == "ESCROWED" || booking.PaymentStatus == "RELEASED" {
		return nil, apperr.Conflict("Payment already completed for this booking")
	}
	if booking.TransporterID == nil {
		return nil, apperr.BadRequest("No transporter assigned yet")
	}
	return &booking, nil
}

type InitiateRequest struct {
	BookingID     uint  `json:"booking_id"`
	AmountPaise   int64 `json:"amount_paise"`
	CustomerID    uint  `json:"customer_id"`
	TransporterID uint  `json:"transporter_id"`
}

type InitiateResponse struct {
	ClientSecret    string `json:"client_secret"`
	PaymentIntentID string `json:"payment_intent_id"`
}

func (s *Service) Initiate(req InitiateRequest) (*InitiateResponse, error) {
	existing, _ := s.repo.FindByBookingID(req.BookingID)
	if existing != nil && existing.ID != 0 {
		return &InitiateResponse{
			ClientSecret:    existing.StripeClientSecret,
			PaymentIntentID: existing.StripePaymentID,
		}, nil
	}

	params := &stripe.PaymentIntentParams{
		Amount:   stripe.Int64(req.AmountPaise),
		Currency: stripe.String("inr"),
		Metadata: map[string]string{
			"booking_id":     fmt.Sprintf("%d", req.BookingID),
			"customer_id":    fmt.Sprintf("%d", req.CustomerID),
			"transporter_id": fmt.Sprintf("%d", req.TransporterID),
		},
	}
	params.SetIdempotencyKey(fmt.Sprintf("booking_%d", req.BookingID))

	pi, err := paymentintent.New(params)
	if err != nil {
		return nil, apperr.Internal("Failed to create payment intent", err)
	}

	payment := &models.Payment{
		BookingID:          req.BookingID,
		CustomerID:         req.CustomerID,
		TransporterID:      req.TransporterID,
		AmountPaise:        req.AmountPaise,
		Currency:           "INR",
		StripePaymentID:    pi.ID,
		StripeClientSecret: pi.ClientSecret,
		Status:             models.PayPending,
	}
	if err := s.repo.Create(payment); err != nil {
		return nil, apperr.Internal("Failed to save payment record", err)
	}

	return &InitiateResponse{
		ClientSecret:    pi.ClientSecret,
		PaymentIntentID: pi.ID,
	}, nil
}

func (s *Service) HandlePaymentSuccess(stripePaymentID string) error {
	p, err := s.repo.FindByStripeID(stripePaymentID)
	if err != nil {
		return apperr.NotFound("Payment not found")
	}
	if p.Status == models.PayEscrowed || p.Status == models.PayReleased {
		return nil // Already processed (idempotent)
	}
	p.Status = models.PayEscrowed
	s.repo.Update(p)

	// Sync booking payment status so escrow auto-release scheduler can find it
	s.repo.db.Model(&models.Booking{}).Where("id = ?", p.BookingID).
		Update("payment_status", "ESCROWED")

	if s.bus != nil {
		s.bus.Publish("payment.confirmed", map[string]interface{}{
			"booking_id": p.BookingID, "payment_id": p.ID, "amount": p.AmountPaise,
		})
	}
	return nil
}

func (s *Service) HandlePaymentFailed(stripePaymentID string) error {
	p, err := s.repo.FindByStripeID(stripePaymentID)
	if err != nil {
		return nil
	}
	p.Status = models.PayFailed
	s.repo.Update(p)

	// Sync booking payment status
	s.repo.db.Model(&models.Booking{}).Where("id = ?", p.BookingID).
		Update("payment_status", "FAILED")

	if s.bus != nil {
		s.bus.Publish("payment.failed", map[string]interface{}{"booking_id": p.BookingID})
	}
	return nil
}

// HandleRefundConfirmed handles Stripe charge.refunded webhook confirmation.
func (s *Service) HandleRefundConfirmed(stripePaymentID string) error {
	p, err := s.repo.FindByStripeID(stripePaymentID)
	if err != nil {
		return nil
	}
	if p.Status == models.PayRefunded {
		return nil // Already processed
	}
	now := time.Now()
	p.Status = models.PayRefunded
	p.RefundedAt = &now
	s.repo.Update(p)
	if s.bus != nil {
		s.bus.Publish("payment.refund_confirmed", map[string]interface{}{
			"booking_id": p.BookingID, "amount": p.AmountPaise,
		})
	}
	s.log.Info("refund confirmed via webhook", "booking_id", p.BookingID, "stripe_id", stripePaymentID)
	return nil
}

func (s *Service) RefundPayment(bookingID uint, reason string) error {
	p, err := s.repo.FindByBookingID(bookingID)
	if err != nil {
		return apperr.NotFound("Payment not found")
	}
	if p.Status == models.PayRefunded {
		return apperr.Conflict("Payment already refunded")
	}
	if p.Status != models.PayEscrowed && p.Status != models.PayCaptured {
		return apperr.BadRequest("Payment is not in a refundable state")
	}
	params := &stripe.RefundParams{
		PaymentIntent: stripe.String(p.StripePaymentID),
	}
	_, err = refund.New(params)
	if err != nil {
		return apperr.Internal("Stripe refund failed", err)
	}
	now := time.Now()
	p.Status = models.PayRefunded
	p.RefundReason = reason
	p.RefundAmountPaise = p.AmountPaise
	p.RefundedAt = &now
	s.repo.Update(p)

	// Sync booking payment status
	s.repo.db.Model(&models.Booking{}).Where("id = ?", bookingID).
		Update("payment_status", "REFUNDED")

	if s.bus != nil {
		s.bus.Publish("payment.refunded", map[string]interface{}{
			"booking_id": bookingID, "amount": p.AmountPaise,
		})
	}
	return nil
}
