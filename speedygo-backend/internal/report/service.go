package report

import (
	"fmt"
	"log/slog"
	"strconv"
	"time"

	apperr "github.com/speedygo/speedygo/internal/errors"
	"github.com/speedygo/speedygo/internal/models"
	"github.com/speedygo/speedygo/internal/natsbus"
	"github.com/gofiber/fiber/v2"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) Create(rpt *models.Report) error { return r.db.Create(rpt).Error }

func (r *Repository) FindByID(id string) (*models.Report, error) {
	var rpt models.Report
	err := r.db.Preload("Reporter").Preload("Reported").First(&rpt, "id = ?", id).Error
	return &rpt, err
}

func (r *Repository) FindPending(limit, offset int) ([]models.Report, int64, error) {
	var reports []models.Report
	var total int64
	db := r.db.Model(&models.Report{}).Where("status IN ?", []string{"PENDING", "UNDER_REVIEW"})
	db.Count(&total)
	err := db.Preload("Reporter").Preload("Reported").
		Limit(limit).Offset(offset).Order("created_at ASC").Find(&reports).Error
	return reports, total, err
}

func (r *Repository) Update(rpt *models.Report) error { return r.db.Save(rpt).Error }

func (r *Repository) CountDismissedByReporter(reporterID uint) (int64, int64, error) {
	var total, dismissed int64
	r.db.Model(&models.Report{}).Where("reporter_id = ?", reporterID).Count(&total)
	r.db.Model(&models.Report{}).Where("reporter_id = ? AND status = 'DISMISSED'", reporterID).Count(&dismissed)
	return total, dismissed, nil
}

type Service struct {
	repo *Repository
	bus  *natsbus.Bus
	log  *slog.Logger
}

func NewService(repo *Repository, bus *natsbus.Bus, log *slog.Logger) *Service {
	return &Service{repo: repo, bus: bus, log: log}
}

type CreateReportReq struct {
	ReportedID  uint                 `json:"reported_id"`
	BookingID   uint                 `json:"booking_id"`
	Type        models.ReportType    `json:"type"`
	Category    models.ReportCategory `json:"category"`
	Description string               `json:"description"`
}

// reportTimeWindowHours returns the allowed reporting window by category.
func reportTimeWindowHours(category models.ReportCategory) time.Duration {
	switch category {
	case models.CatDamagedGoods:
		return 7 * 24 * time.Hour // 7 days for goods damage
	case models.CatOvercharged, models.CatExtraPayment, models.CatRefusedPayment:
		return 30 * 24 * time.Hour // 30 days for financial disputes
	default:
		return 48 * time.Hour // 48h standard window
	}
}

func (s *Service) Create(reporterID uint, req CreateReportReq) (*models.Report, error) {
	// Cannot report yourself
	if reporterID == req.ReportedID {
		return nil, apperr.BadRequest("Cannot report yourself")
	}

	// Validate booking exists and reporter is participant
	var booking models.Booking
	if err := s.repo.db.First(&booking, req.BookingID).Error; err != nil {
		return nil, apperr.NotFound("Booking not found")
	}
	isParticipant := booking.CustomerID == reporterID || (booking.TransporterID != nil && *booking.TransporterID == reporterID)
	if !isParticipant {
		return nil, apperr.Forbidden("You must be a participant of this booking to file a report")
	}

	// Validate reported user is the OTHER participant in this booking
	isReportedParticipant := booking.CustomerID == req.ReportedID || (booking.TransporterID != nil && *booking.TransporterID == req.ReportedID)
	if !isReportedParticipant {
		return nil, apperr.BadRequest("Reported user must be the other participant of this booking")
	}

	// Enforce report time window based on category
	window := reportTimeWindowHours(req.Category)
	var referenceTime time.Time
	if booking.CompletedAt != nil {
		referenceTime = *booking.CompletedAt
	} else if booking.CancelledAt != nil {
		referenceTime = *booking.CancelledAt
	} else {
		referenceTime = booking.UpdatedAt
	}
	if time.Since(referenceTime) > window {
		return nil, apperr.BadRequest(fmt.Sprintf("Report window has closed (allowed: %d hours)", int(window.Hours())))
	}

	// Check reporter credibility — reduce weight but still allow
	total, dismissed, _ := s.repo.CountDismissedByReporter(reporterID)
	lowCredibility := false
	if total > 5 && float64(dismissed)/float64(total) > 0.4 {
		lowCredibility = true
		s.log.Warn("low credibility reporter", "reporter_id", reporterID,
			"total", total, "dismissed", dismissed)
	}

	rpt := &models.Report{
		ReporterID:  reporterID,
		ReportedID:  req.ReportedID,
		BookingID:   req.BookingID,
		Type:        req.Type,
		Category:    req.Category,
		Description: req.Description,
		Status:      models.ReportPending,
	}
	if err := s.repo.Create(rpt); err != nil {
		return nil, apperr.Internal("Failed to create report", err)
	}

	// Publish for AI triage
	if s.bus != nil {
		s.bus.Publish("report.created", map[string]interface{}{
		"report_id":      rpt.ID,
		"category":       req.Category,
		"description":    req.Description,
		"reporter_id":    reporterID,
		"reported_id":    req.ReportedID,
		"low_credibility": lowCredibility,
		})
	}
	return rpt, nil
}

type ResolveReq struct {
	Resolution models.ResolutionType `json:"resolution"`
	AdminNote  string                `json:"admin_note"`
}

func (s *Service) Resolve(reportID string, adminID uint, req ResolveReq) error {
	rpt, err := s.repo.FindByID(reportID)
	if err != nil {
		return apperr.NotFound("Report not found")
	}
	rpt.Status = models.ReportResolved
	rpt.Resolution = req.Resolution
	rpt.AdminID = &adminID
	rpt.AdminNote = req.AdminNote
	if err := s.repo.Update(rpt); err != nil {
		return apperr.Internal("Failed to resolve report", err)
	}

	if s.bus != nil {
		s.bus.Publish("report.resolved", map[string]interface{}{
			"report_id":   reportID,
			"reported_id": rpt.ReportedID,
			"resolution":  req.Resolution,
		})
	}
	return nil
}

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// CreateReport POST /reports
func (h *Handler) CreateReport(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	var req CreateReportReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}
	rpt, err := h.svc.Create(userID, req)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.Status(201).JSON(rpt)
}

// GetPendingReports GET /admin/reports (with filters)
func (h *Handler) GetPendingReports(c *fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	offset, _ := strconv.Atoi(c.Query("offset", "0"))
	reportType := c.Query("type")
	category := c.Query("category")
	status := c.Query("status")
	reportedID := c.Query("reported_id")

	var reports []models.Report
	var total int64
	q := h.svc.repo.db.Model(&models.Report{})
	if reportType != "" {
		q = q.Where("type = ?", reportType)
	}
	if category != "" {
		q = q.Where("category = ?", category)
	}
	if status != "" {
		q = q.Where("status = ?", status)
	} else {
		// Default: show all (not just pending)
	}
	if reportedID != "" {
		q = q.Where("reported_id = ?", reportedID)
	}
	q.Count(&total)
	q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&reports)
	return c.JSON(fiber.Map{"data": reports, "total": total})
}

// ResolveReport PUT /admin/reports/:id/resolve
func (h *Handler) ResolveReport(c *fiber.Ctx) error {
	adminID, _ := c.Locals("userID").(uint)
	reportID := c.Params("id")
	var req ResolveReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}
	if err := h.svc.Resolve(reportID, adminID, req); err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"ok": true})
}

// GetBanQueue GET /admin/ban-queue
// Returns users with 6+ reports from different people (auto-ban candidates awaiting approval)
func (h *Handler) GetBanQueue(c *fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	offset, _ := strconv.Atoi(c.Query("offset", "0"))

	type BanCandidate struct {
		UserID      uint        `json:"user_id"`
		User        models.User `json:"user" gorm:"foreignKey:UserID"`
		ReportCount int         `json:"report_count"`
		WarningSent bool        `json:"warning_sent"`
	}

	// Find users with 4+ reports from different reporters
	var candidates []BanCandidate
	h.svc.repo.db.Raw(`
		SELECT reported_id as user_id, COUNT(DISTINCT reporter_id) as report_count,
			CASE WHEN COUNT(DISTINCT reporter_id) >= 4 THEN true ELSE false END as warning_sent
		FROM reports
		WHERE status = 'PENDING' OR status = 'RESOLVED'
		GROUP BY reported_id
		HAVING COUNT(DISTINCT reporter_id) >= 6
		ORDER BY report_count DESC
		LIMIT ? OFFSET ?
	`, limit, offset).Scan(&candidates)

	// Load user data and filter out already banned
	var result []BanCandidate
	for i := range candidates {
		var user models.User
		if h.svc.repo.db.First(&user, candidates[i].UserID).Error == nil {
			if user.Status != models.StatusBanned {
				candidates[i].User = user
				candidates[i].WarningSent = candidates[i].ReportCount >= 4
				result = append(result, candidates[i])
			}
		}
	}

	return c.JSON(fiber.Map{"data": result, "total": len(result)})
}

// ApproveBan PUT /admin/ban-queue/:id/approve
func (h *Handler) ApproveBan(c *fiber.Ctx) error {
	adminID, _ := c.Locals("userID").(uint)
	targetID, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || targetID == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid user ID"})
	}

	// Require re-auth
	reAuthPwd := c.Get("X-Admin-Password")
	if reAuthPwd == "" {
		return c.Status(403).JSON(fiber.Map{"error": true, "message": "Re-authentication required"})
	}

	// Verify admin password
	var admin models.User
	if h.svc.repo.db.First(&admin, adminID).Error != nil {
		return c.Status(401).JSON(fiber.Map{"error": true, "message": "Admin not found"})
	}
	if err := bcrypt.CompareHashAndPassword([]byte(admin.PasswordHash), []byte(reAuthPwd)); err != nil {
		return c.Status(401).JSON(fiber.Map{"error": true, "message": "Re-authentication failed: incorrect password"})
	}

	var target models.User
	if h.svc.repo.db.First(&target, targetID).Error != nil {
		return c.Status(404).JSON(fiber.Map{"error": true, "message": "User not found"})
	}
	if target.Status == models.StatusBanned {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "User already banned"})
	}
	if target.Role == models.RoleAdmin || target.Role == models.RoleSuperAdmin {
		return c.Status(403).JSON(fiber.Map{"error": true, "message": "Cannot ban admin users via ban queue. Use admin management."})
	}

	// Ban the user
	now := time.Now()
	h.svc.repo.db.Model(&target).Updates(map[string]interface{}{
		"status":         models.StatusBanned,
		"suspended_at":   now,
		"suspend_reason": "Auto-ban approved by admin (6+ reports from different users)",
	})

	// Revoke sessions
	h.svc.repo.db.Exec("INSERT INTO revoked_sessions (user_id) VALUES (?) ON CONFLICT DO NOTHING", targetID)

	// Audit log
	h.svc.repo.db.Create(&models.AuditLog{
		AdminID:    adminID,
		Action:     "APPROVE_BAN",
		TargetID:   uint(targetID),
		TargetType: "USER",
		Reason:     "Ban approved from ban queue (6+ reports from different users)",
	})

	// Notify
	if h.svc.bus != nil {
		h.svc.bus.Publish("notify.account_banned", map[string]interface{}{
			"user_id": targetID,
			"reason":  "Multiple reports from different users",
		})
	}

	h.svc.log.Info("ban approved", "admin_id", adminID, "target_id", targetID)
	return c.JSON(fiber.Map{"ok": true})
}

