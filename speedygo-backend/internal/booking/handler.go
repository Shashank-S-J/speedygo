package booking

import (
	"strconv"

	apperr "github.com/speedygo/speedygo/internal/errors"
	"github.com/speedygo/speedygo/internal/models"
	"github.com/gofiber/fiber/v2"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// CreateBooking POST /bookings
func (h *Handler) CreateBooking(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uint)
	if !ok || userID == 0 {
		return c.Status(401).JSON(fiber.Map{"error": true, "message": "Unauthorized"})
	}
	role, _ := c.Locals("role").(models.UserRole)
	if role != models.RoleCustomer {
		return c.Status(403).JSON(fiber.Map{"error": true, "message": "Only customers can create bookings"})
	}
	var req CreateBookingReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid request body"})
	}
	if req.PickupAddress == "" || req.DropAddress == "" {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Pickup and drop addresses are required"})
	}
	if req.PickupLat == 0 || req.PickupLng == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Valid pickup coordinates are required"})
	}
	if req.DropLat == 0 || req.DropLng == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Valid drop coordinates are required"})
	}

	b, err := h.svc.Create(userID, req)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.Status(201).JSON(b)
}

// GetBooking GET /bookings/:id
func (h *Handler) GetBooking(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uint)
	if !ok || userID == 0 {
		return c.Status(401).JSON(fiber.Map{"error": true, "message": "Unauthorized"})
	}
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || id == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid booking ID"})
	}
	b, err := h.svc.GetByID(uint(id))
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}

	// Authorization check: must be a participant, admin, or a transporter viewing an open booking
	role, _ := c.Locals("role").(models.UserRole)
	isParticipant := b.CustomerID == userID || (b.TransporterID != nil && *b.TransporterID == userID)
	isAdmin := role == models.RoleAdmin || role == models.RoleSuperAdmin
	isTransporterViewingOpen := role == models.RoleTransporter &&
		(b.Status == models.BookingPending || b.Status == models.BookingBidding)
	if !isParticipant && !isAdmin && !isTransporterViewingOpen {
		ae := apperr.Forbidden("Not a participant of this booking")
		return c.Status(ae.Code).JSON(fiber.Map{"error": true, "message": ae.Message})
	}

	// Security: hide customer details from non-participant transporters browsing open bookings
	if isTransporterViewingOpen && !isParticipant {
		b.Customer = nil
		b.PickupContact = ""
		b.DropContact = ""
	}

	// Security: hide pickup OTP from transporter (only customer should see it to share verbally)
	isTransporter := b.TransporterID != nil && *b.TransporterID == userID
	if isTransporter {
		b.PickupOTP = ""
	}

	return c.JSON(b)
}

// GetMyBookings GET /bookings/my
func (h *Handler) GetMyBookings(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uint)
	if !ok || userID == 0 {
		return c.Status(401).JSON(fiber.Map{"error": true, "message": "Unauthorized"})
	}
	role, _ := c.Locals("role").(models.UserRole)
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	offset, _ := strconv.Atoi(c.Query("offset", "0"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	bookings, total, err := h.svc.GetMyBookings(userID, role, limit, offset)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"data": bookings, "total": total})
}

// UpdateStatus PUT /bookings/:id/status
func (h *Handler) UpdateStatus(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || id == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid booking ID"})
	}
	var req UpdateStatusReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid request body"})
	}
	if req.Status == "" {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Status is required"})
	}

	b, err := h.svc.UpdateStatus(uint(id), userID, req)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(b)
}

// AcceptBooking PUT /bookings/:id/accept
func (h *Handler) AcceptBooking(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || id == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid booking ID"})
	}

	var body struct {
		VehicleID uint `json:"vehicle_id"`
	}
	c.BodyParser(&body)
	if body.VehicleID == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "vehicle_id is required"})
	}

	b, err := h.svc.AcceptBooking(uint(id), userID, body.VehicleID)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(b)
}

// FlagGoodsMismatch PUT /bookings/:id/mismatch
func (h *Handler) FlagGoodsMismatch(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || id == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid booking ID"})
	}
	var req GoodsMismatchReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}
	b, err := h.svc.FlagGoodsMismatch(uint(id), userID, req)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(b)
}

// UploadPhotos POST /bookings/:id/photos
func (h *Handler) UploadPhotos(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || id == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid booking ID"})
	}
	var req UploadPhotosReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}
	if err := h.svc.UploadPhotos(uint(id), userID, req); err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"ok": true})
}

// GetNearbyBookings GET /bookings/nearby?lat=X&lng=Y&radius=Z
// Returns pending/bidding bookings near the transporter's location.
func (h *Handler) GetNearbyBookings(c *fiber.Ctx) error {
	role, _ := c.Locals("role").(models.UserRole)
	if role != models.RoleTransporter && role != models.RoleAdmin && role != models.RoleSuperAdmin {
		return c.Status(403).JSON(fiber.Map{"error": true, "message": "Only transporters can view nearby bookings"})
	}

	lat, err1 := strconv.ParseFloat(c.Query("lat"), 64)
	lng, err2 := strconv.ParseFloat(c.Query("lng"), 64)
	if err1 != nil || err2 != nil || c.Query("lat") == "" || c.Query("lng") == "" {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "lat and lng query parameters are required"})
	}
	radius, _ := strconv.ParseFloat(c.Query("radius", "25"), 64)
	limit, _ := strconv.Atoi(c.Query("limit", "20"))

	bookings, err := h.svc.GetNearbyBookings(lat, lng, radius, limit)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"data": bookings, "count": len(bookings)})
}

// GetPriceEstimate POST /bookings/estimate
// Returns a price estimate without creating a booking.
func (h *Handler) GetPriceEstimate(c *fiber.Ctx) error {
	var req CreateBookingReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid request body"})
	}
	price, distance, err := h.svc.GetPriceEstimate(req)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{
		"estimated_price_paise":  price,
		"estimated_distance_km":  distance,
		"currency":               "INR",
	})
}

// SendBookingOTP POST /bookings/:id/send-otp
// Sends OTP to customer's email for booking confirmation.
func (h *Handler) SendBookingOTP(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	email, _ := c.Locals("email").(string)
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || id == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid booking ID"})
	}

	if err := h.svc.SendBookingOTP(uint(id), userID, email); err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Failed to send OTP"})
	}
	return c.JSON(fiber.Map{"ok": true, "message": "OTP sent to your email"})
}

// VerifyBookingOTP POST /bookings/:id/verify-otp
// Verifies OTP and confirms the booking.
func (h *Handler) VerifyBookingOTP(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	email, _ := c.Locals("email").(string)
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || id == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid booking ID"})
	}

	var body struct {
		OTP string `json:"otp"`
	}
	if err := c.BodyParser(&body); err != nil || body.OTP == "" {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "OTP is required"})
	}

	b, err := h.svc.VerifyBookingOTP(uint(id), userID, email, body.OTP)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"ok": true, "booking": b})
}

// VerifyPickupOTP POST /bookings/:id/verify-pickup-otp
// Transporter verifies the OTP given by customer at pickup.
func (h *Handler) VerifyPickupOTP(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	role, _ := c.Locals("role").(models.UserRole)
	if role != models.RoleTransporter {
		return c.Status(403).JSON(fiber.Map{"error": true, "message": "Only transporters can verify pickup OTP"})
	}

	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || id == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid booking ID"})
	}

	var body struct {
		OTP string `json:"otp"`
	}
	if err := c.BodyParser(&body); err != nil || body.OTP == "" {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "OTP is required"})
	}

	b, err := h.svc.VerifyPickupOTP(uint(id), userID, body.OTP)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(b)
}

// CompleteBooking POST /bookings/:id/complete
// Transporter marks booking as completed.
func (h *Handler) CompleteBooking(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	role, _ := c.Locals("role").(models.UserRole)
	if role != models.RoleTransporter {
		return c.Status(403).JSON(fiber.Map{"error": true, "message": "Only transporters can complete bookings"})
	}

	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || id == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid booking ID"})
	}

	b, err := h.svc.CompleteBooking(uint(id), userID)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(b)
}

// SetAvailability PUT /bookings/availability
// Transporter sets online/offline status.
func (h *Handler) SetAvailability(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	role, _ := c.Locals("role").(models.UserRole)
	if role != models.RoleTransporter {
		return c.Status(403).JSON(fiber.Map{"error": true, "message": "Only transporters can set availability"})
	}

	var body struct {
		Available bool `json:"available"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid request body"})
	}

	if err := h.svc.SetTransporterAvailability(userID, body.Available); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Failed to update availability"})
	}
	return c.JSON(fiber.Map{"ok": true, "available": body.Available})
}
