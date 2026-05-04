package payment

import (
	"encoding/json"
	"fmt"
	"os"

	apperr "github.com/speedygo/speedygo/internal/errors"
	"github.com/gofiber/fiber/v2"
	"github.com/stripe/stripe-go/v76/webhook"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// InitiatePayment POST /payments/initiate
func (h *Handler) InitiatePayment(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	var req InitiateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid request"})
	}
	if req.BookingID == 0 || req.AmountPaise <= 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "booking_id and positive amount_paise are required"})
	}
	// Ensure the caller is the customer for this payment
	if req.CustomerID != userID {
		return c.Status(403).JSON(fiber.Map{"error": true, "message": "You can only initiate payments for your own bookings"})
	}
	// Validate booking exists and caller is the booking customer
	booking, bookingErr := h.svc.ValidateBookingForPayment(req.BookingID, userID, req.AmountPaise)
	if bookingErr != nil {
		if appErr, ok := apperr.IsAppError(bookingErr); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	// Override amount and transporter from booking to prevent client manipulation
	req.AmountPaise = booking.FinalPrice
	if booking.TransporterID != nil {
		req.TransporterID = *booking.TransporterID
	}
	resp, err := h.svc.Initiate(req)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(resp)
}

// StripeWebhook POST /payments/webhook
func (h *Handler) StripeWebhook(c *fiber.Ctx) error {
	payload := c.Body()
	sigHeader := c.Get("Stripe-Signature")
	webhookSecret := os.Getenv("STRIPE_WEBHOOK_SECRET")

	event, err := webhook.ConstructEvent(payload, sigHeader, webhookSecret)
	if err != nil {
		return c.SendStatus(400)
	}

	switch event.Type {
	case "payment_intent.succeeded":
		var pi struct {
			ID string `json:"id"`
		}
		json.Unmarshal(event.Data.Raw, &pi)
		h.svc.HandlePaymentSuccess(pi.ID)

	case "payment_intent.payment_failed":
		var pi struct {
			ID string `json:"id"`
		}
		json.Unmarshal(event.Data.Raw, &pi)
		h.svc.HandlePaymentFailed(pi.ID)

	case "charge.refunded":
		var charge struct {
			PaymentIntent string `json:"payment_intent"`
		}
		json.Unmarshal(event.Data.Raw, &charge)
		if charge.PaymentIntent != "" {
			h.svc.HandleRefundConfirmed(charge.PaymentIntent)
		}

	default:
		fmt.Printf("Unhandled webhook event: %s\n", event.Type)
	}

	return c.SendStatus(200)
}
