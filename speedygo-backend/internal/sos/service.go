package sos

import (
	"fmt"
	"log/slog"
	"strconv"
	"time"

	apperr "github.com/speedygo/speedygo/internal/errors"
	"github.com/speedygo/speedygo/internal/models"
	"github.com/speedygo/speedygo/internal/natsbus"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// Repository handles SOS database operations.
type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) Create(alert *models.SOSAlert) error { return r.db.Create(alert).Error }

func (r *Repository) FindByID(id string) (*models.SOSAlert, error) {
	var alert models.SOSAlert
	err := r.db.Preload("User").Preload("Booking").First(&alert, "id = ?", id).Error
	return &alert, err
}

func (r *Repository) FindActiveByBooking(bookingID uint) (*models.SOSAlert, error) {
	var alert models.SOSAlert
	err := r.db.Where("booking_id = ? AND status = ?", bookingID, models.SOSActive).First(&alert).Error
	return &alert, err
}

func (r *Repository) FindActiveAlerts(limit, offset int) ([]models.SOSAlert, int64, error) {
	var alerts []models.SOSAlert
	var total int64
	db := r.db.Model(&models.SOSAlert{}).Where("status = ?", models.SOSActive)
	db.Count(&total)
	err := db.Preload("User").Preload("Booking").
		Limit(limit).Offset(offset).Order("created_at ASC").Find(&alerts).Error
	return alerts, total, err
}

func (r *Repository) Update(alert *models.SOSAlert) error { return r.db.Save(alert).Error }

func (r *Repository) GetEmergencyContacts(userID uint) ([]models.EmergencyContact, error) {
	var contacts []models.EmergencyContact
	err := r.db.Where("user_id = ?", userID).Find(&contacts).Error
	return contacts, err
}

func (r *Repository) UpsertEmergencyContact(contact *models.EmergencyContact) error {
	return r.db.Save(contact).Error
}

func (r *Repository) DeleteEmergencyContact(id, userID uint) error {
	return r.db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.EmergencyContact{}).Error
}

// Service handles SOS/panic button business logic.
type Service struct {
	repo *Repository
	bus  *natsbus.Bus
	db   *gorm.DB
	log  *slog.Logger
}

func NewService(repo *Repository, bus *natsbus.Bus, db *gorm.DB, log *slog.Logger) *Service {
	return &Service{repo: repo, bus: bus, db: db, log: log}
}

type TriggerSOSReq struct {
	BookingID uint    `json:"booking_id"`
	Lat       float64 `json:"lat"`
	Lng       float64 `json:"lng"`
}

func (s *Service) TriggerSOS(userID uint, req TriggerSOSReq) (*models.SOSAlert, error) {
	// Validate booking exists and user is participant
	var booking models.Booking
	if err := s.db.First(&booking, req.BookingID).Error; err != nil {
		return nil, apperr.NotFound("Booking not found")
	}
	isParticipant := booking.CustomerID == userID || (booking.TransporterID != nil && *booking.TransporterID == userID)
	if !isParticipant {
		return nil, apperr.Forbidden("Not a participant of this booking")
	}

	// Only allow SOS during active booking states
	switch booking.Status {
	case models.BookingAccepted, models.BookingPickingUp, models.BookingInTransit:
		// OK
	default:
		return nil, apperr.BadRequest("SOS only available during active bookings")
	}

	// Check for existing active SOS on this booking
	existing, _ := s.repo.FindActiveByBooking(req.BookingID)
	if existing != nil && existing.ID != "" {
		return existing, nil // Return existing active SOS
	}

	alert := &models.SOSAlert{
		UserID:    userID,
		BookingID: req.BookingID,
		Lat:       req.Lat,
		Lng:       req.Lng,
		Status:    models.SOSActive,
	}
	if err := s.repo.Create(alert); err != nil {
		return nil, apperr.Internal("Failed to create SOS alert", err)
	}

	if s.bus != nil {
		// Notify all admins immediately
		s.bus.Publish("notify.sos_triggered", map[string]interface{}{
			"sos_id":     alert.ID,
			"user_id":    userID,
			"booking_id": req.BookingID,
			"lat":        req.Lat,
			"lng":        req.Lng,
		})
	}

	// Notify emergency contacts
	contacts, _ := s.repo.GetEmergencyContacts(userID)
	var user models.User
	s.db.First(&user, userID)
	if s.bus != nil {
		for _, contact := range contacts {
			s.bus.Publish("notify.sos_emergency_contact", map[string]interface{}{
				"contact_phone": contact.Phone,
				"contact_email": contact.Email,
				"contact_name":  contact.Name,
				"user_name":     user.FullName,
				"lat":           req.Lat,
				"lng":           req.Lng,
				"booking_id":    req.BookingID,
			})
		}

		// Notify the other party in the booking
		otherUserID := booking.CustomerID
		if booking.CustomerID == userID && booking.TransporterID != nil {
			otherUserID = *booking.TransporterID
		}
		s.bus.Publish("notify.sos_other_party", map[string]interface{}{
			"user_id":    otherUserID,
			"booking_id": req.BookingID,
			"triggered_by": userID,
		})
	}

	// Audit log
	s.db.Create(&models.AuditLog{
		AdminID:    0,
		Action:     "SOS_TRIGGERED",
		TargetID:   userID,
		TargetType: "USER",
		Reason:     fmt.Sprintf("SOS triggered for booking %d", req.BookingID),
	})

	s.log.Warn("SOS TRIGGERED", "user_id", userID, "booking_id", req.BookingID, "lat", req.Lat, "lng", req.Lng)
	return alert, nil
}

type ResolveSOSReq struct {
	Status string `json:"status"` // RESOLVED or FALSE_ALARM
	Note   string `json:"note"`
}

func (s *Service) ResolveSOSAdmin(sosID string, adminID uint, req ResolveSOSReq) error {
	alert, err := s.repo.FindByID(sosID)
	if err != nil {
		return apperr.NotFound("SOS alert not found")
	}
	if alert.Status != models.SOSActive {
		return apperr.Conflict("SOS already resolved")
	}

	status := models.SOSResolved
	if req.Status == "FALSE_ALARM" {
		status = models.SOSFalse
	}

	alert.Status = status
	alert.ResolvedBy = &adminID
	alert.ResolveNote = req.Note
	now := time.Now()
	alert.ResolvedAt = &now
	if err := s.repo.Update(alert); err != nil {
		return apperr.Internal("Failed to resolve SOS", err)
	}

	if s.bus != nil {
		s.bus.Publish("notify.sos_resolved", map[string]interface{}{
			"sos_id":     sosID,
			"user_id":    alert.UserID,
			"booking_id": alert.BookingID,
			"status":     status,
		})
	}

	s.db.Create(&models.AuditLog{
		AdminID:    adminID,
		Action:     "SOS_RESOLVED",
		TargetID:   alert.UserID,
		TargetType: "SOS",
		Reason:     req.Note,
	})

	return nil
}

// Handler exposes SOS HTTP endpoints.
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// TriggerSOS POST /sos/trigger
func (h *Handler) TriggerSOS(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	var req TriggerSOSReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}
	alert, err := h.svc.TriggerSOS(userID, req)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.Status(201).JSON(alert)
}

// GetActiveAlerts GET /admin/sos/active
func (h *Handler) GetActiveAlerts(c *fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	offset, _ := strconv.Atoi(c.Query("offset", "0"))
	alerts, total, err := h.svc.repo.FindActiveAlerts(limit, offset)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"data": alerts, "total": total})
}

// ResolveSOS PUT /admin/sos/:id/resolve
func (h *Handler) ResolveSOS(c *fiber.Ctx) error {
	adminID, _ := c.Locals("userID").(uint)
	sosID := c.Params("id")
	var req ResolveSOSReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}
	if err := h.svc.ResolveSOSAdmin(sosID, adminID, req); err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"ok": true})
}

// SetEmergencyContacts POST /sos/contacts
func (h *Handler) SetEmergencyContacts(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	var contacts []struct {
		Name  string `json:"name"`
		Phone string `json:"phone"`
		Email string `json:"email"`
	}
	if err := c.BodyParser(&contacts); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}
	if len(contacts) > 5 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Maximum 5 emergency contacts"})
	}
	for _, ct := range contacts {
		if ct.Name == "" || ct.Phone == "" {
			return c.Status(400).JSON(fiber.Map{"error": true, "message": "Each contact must have a name and phone number"})
		}
	}

	// Delete existing and replace
	h.svc.db.Where("user_id = ?", userID).Delete(&models.EmergencyContact{})
	for _, ct := range contacts {
		ec := &models.EmergencyContact{UserID: userID, Name: ct.Name, Phone: ct.Phone, Email: ct.Email}
		h.svc.repo.UpsertEmergencyContact(ec)
	}
	return c.JSON(fiber.Map{"ok": true, "count": len(contacts)})
}

// GetEmergencyContacts GET /sos/contacts
func (h *Handler) GetEmergencyContacts(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	contacts, err := h.svc.repo.GetEmergencyContacts(userID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(contacts)
}

