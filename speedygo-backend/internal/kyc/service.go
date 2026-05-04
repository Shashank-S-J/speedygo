package kyc

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	apperr "github.com/speedygo/speedygo/internal/errors"
	"github.com/speedygo/speedygo/internal/config"
	"github.com/speedygo/speedygo/internal/models"
	"github.com/speedygo/speedygo/internal/natsbus"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) Create(k *models.KYCVerification) error { return r.db.Create(k).Error }

func (r *Repository) FindByUserID(userID uint) (*models.KYCVerification, error) {
	var k models.KYCVerification
	err := r.db.Where("user_id = ?", userID).Order("created_at DESC").First(&k).Error
	return &k, err
}

func (r *Repository) FindByID(id string) (*models.KYCVerification, error) {
	var k models.KYCVerification
	err := r.db.Preload("User").First(&k, "id = ?", id).Error
	return &k, err
}

func (r *Repository) FindPendingQueue(limit, offset int) ([]models.KYCVerification, int64, error) {
	var items []models.KYCVerification
	var total int64
	db := r.db.Model(&models.KYCVerification{}).Where("status IN ?",
		[]string{"PENDING", "MANUAL_REVIEW", "INCONCLUSIVE"})
	db.Count(&total)
	err := db.Preload("User").Limit(limit).Offset(offset).Order("created_at ASC").Find(&items).Error
	return items, total, err
}

func (r *Repository) Update(k *models.KYCVerification) error { return r.db.Save(k).Error }

// DiditClient handles Didit.me API calls.
type DiditClient struct {
	baseURL      string
	clientID     string
	clientSecret string
	httpClient   *http.Client
}

func NewDiditClient(cfg config.KYCConfig) *DiditClient {
	return &DiditClient{
		baseURL:      cfg.DiditBaseURL,
		clientID:     cfg.DiditClientID,
		clientSecret: cfg.DiditClientSecret,
		httpClient:   &http.Client{Timeout: 30 * time.Second},
	}
}

type DiditSessionResponse struct {
	SessionID string `json:"session_id"`
	URL       string `json:"url"`
}

func (d *DiditClient) CreateSession(email string) (*DiditSessionResponse, error) {
	if d.clientID == "" {
		return nil, fmt.Errorf("Didit not configured")
	}
	body, _ := json.Marshal(map[string]string{
		"workflow_id": "id-verify-liveness-face",
		"vendor_data": email,
	})
	req, _ := http.NewRequest("POST", d.baseURL+"/sessions/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", d.clientSecret))

	resp, err := d.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("didit API error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 && resp.StatusCode != 201 {
		return nil, fmt.Errorf("didit returned status %d", resp.StatusCode)
	}
	var result DiditSessionResponse
	json.NewDecoder(resp.Body).Decode(&result)
	return &result, nil
}

// Service handles KYC verification logic.
type Service struct {
	repo  *Repository
	didit *DiditClient
	bus   *natsbus.Bus
	log   *slog.Logger
	userDB *gorm.DB
}

func NewService(repo *Repository, didit *DiditClient, bus *natsbus.Bus, userDB *gorm.DB, log *slog.Logger) *Service {
	return &Service{repo: repo, didit: didit, bus: bus, userDB: userDB, log: log}
}

type SubmitKYCReq struct {
	AadhaarNumber string   `json:"aadhaar_number,omitempty"`
	PANNumber     string   `json:"pan_number,omitempty"`
	DLNumber      string   `json:"dl_number,omitempty"`
	DocURLs       []string `json:"doc_urls"`
}

func (s *Service) Submit(userID uint, req SubmitKYCReq) (*models.KYCVerification, error) {
	// Check if already verified
	existing, _ := s.repo.FindByUserID(userID)
	if existing != nil && existing.Status == models.KYCVerified {
		return existing, nil
	}

	docJSON, _ := json.Marshal(req.DocURLs)
	kyc := &models.KYCVerification{
		UserID:  userID,
		DocURLs: docJSON,
		Status:  models.KYCProcessing,
	}
	if err := s.repo.Create(kyc); err != nil {
		return nil, apperr.Internal("Failed to create KYC record", err)
	}

	// Update user status
	s.userDB.Model(&models.User{}).Where("id = ?", userID).Update("status", models.StatusKYCReview)

	// Try Didit API
	var user models.User
	s.userDB.First(&user, userID)

	session, err := s.didit.CreateSession(user.Email)
	if err != nil {
		s.log.Warn("Didit API failed, queuing for manual review", "error", err)
		kyc.Status = models.KYCManualReview
		s.repo.Update(kyc)
		if s.bus != nil {
			s.bus.Publish("kyc.manual_review", map[string]interface{}{
				"kyc_id": kyc.ID, "user_id": userID,
			})
		}
		return kyc, nil
	}

	kyc.DiditSessionID = session.SessionID
	s.repo.Update(kyc)

	if s.bus != nil {
		s.bus.Publish("kyc.submitted", map[string]interface{}{
			"kyc_id": kyc.ID, "user_id": userID, "session_id": session.SessionID,
		})
	}
	return kyc, nil
}

func (s *Service) GetStatus(userID uint) (*models.KYCVerification, error) {
	kyc, err := s.repo.FindByUserID(userID)
	if err != nil {
		return nil, apperr.NotFound("No KYC submission found")
	}
	return kyc, nil
}

type ReviewReq struct {
	Approved  bool   `json:"approved"`
	AdminNote string `json:"admin_note"`
}

func (s *Service) AdminReview(kycID string, adminID uint, req ReviewReq) error {
	kyc, err := s.repo.FindByID(kycID)
	if err != nil {
		return apperr.NotFound("KYC record not found")
	}
	if kyc.Status == models.KYCVerified || kyc.Status == models.KYCRejected {
		return apperr.Conflict("KYC already reviewed")
	}

	kyc.AdminID = &adminID
	kyc.AdminNote = req.AdminNote

	if req.Approved {
		kyc.Status = models.KYCVerified
		now := time.Now()
		kyc.VerifiedAt = &now
		s.userDB.Model(&models.User{}).Where("id = ?", kyc.UserID).Update("status", models.StatusActive)
		if s.bus != nil {
			s.bus.Publish("kyc.verified", map[string]interface{}{
				"user_id": kyc.UserID, "kyc_id": kycID,
			})
		}
	} else {
		kyc.Status = models.KYCRejected
		if s.bus != nil {
			s.bus.Publish("kyc.rejected", map[string]interface{}{
				"user_id": kyc.UserID, "kyc_id": kycID, "reason": req.AdminNote,
			})
		}
	}
	return s.repo.Update(kyc)
}

// Handler for KYC HTTP endpoints.
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// SubmitKYC POST /kyc/submit
func (h *Handler) SubmitKYC(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	var req SubmitKYCReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}
	kyc, err := h.svc.Submit(userID, req)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.Status(201).JSON(kyc)
}

// GetKYCStatus GET /kyc/status
func (h *Handler) GetKYCStatus(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	kyc, err := h.svc.GetStatus(userID)
	if err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(kyc)
}

// GetKYCQueue GET /admin/kyc/queue
func (h *Handler) GetKYCQueue(c *fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	offset, _ := strconv.Atoi(c.Query("offset", "0"))
	items, total, err := h.svc.repo.FindPendingQueue(limit, offset)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"data": items, "total": total})
}

// ReviewKYC PUT /admin/kyc/:id/review
func (h *Handler) ReviewKYC(c *fiber.Ctx) error {
	adminID, _ := c.Locals("userID").(uint)
	kycID := c.Params("id")
	var req ReviewReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}
	if err := h.svc.AdminReview(kycID, adminID, req); err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"ok": true})
}

// GetKYCHistory GET /admin/kyc/history
func (h *Handler) GetKYCHistory(c *fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	offset, _ := strconv.Atoi(c.Query("offset", "0"))
	status := c.Query("status") // VERIFIED or REJECTED

	var items []models.KYCVerification
	var total int64
	q := h.svc.repo.db.Model(&models.KYCVerification{}).Preload("User")
	if status != "" {
		q = q.Where("status = ?", status)
	} else {
		q = q.Where("status IN ?", []string{"VERIFIED", "REJECTED"})
	}
	q.Count(&total)
	q.Order("updated_at DESC").Limit(limit).Offset(offset).Find(&items)
	return c.JSON(fiber.Map{"data": items, "total": total})
}
