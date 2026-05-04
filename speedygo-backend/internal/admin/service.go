package admin

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"time"

	apperr "github.com/speedygo/speedygo/internal/errors"
	"github.com/speedygo/speedygo/internal/models"
	"github.com/speedygo/speedygo/internal/natsbus"
	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type Service struct {
	db  *gorm.DB
	rdb *redis.Client
	bus *natsbus.Bus
	log *slog.Logger
}

func NewService(db *gorm.DB, rdb *redis.Client, bus *natsbus.Bus, log *slog.Logger) *Service {
	return &Service{db: db, rdb: rdb, bus: bus, log: log}
}

type DisableRequest struct {
	Reason   string `json:"reason"`
	Duration string `json:"duration"` // 7d, 30d, permanent
}

// ─── Permission Hierarchy ───
// ADMIN can:
//   - Suspend CUSTOMER/TRANSPORTER (7d, 30d only)
//   - Enable suspended CUSTOMER/TRANSPORTER
//   - View/search all users
//   - Review KYC, reports, SOS
//
// SUPER_ADMIN can do everything ADMIN can, plus:
//   - Permaban users
//   - Suspend/enable other ADMINs
//   - Enable BANNED users (lift permaban)
//   - Change user roles (promote/demote to ADMIN)
//   - All destructive operations

func (s *Service) DisableUser(adminID, targetID uint, adminRole models.UserRole, req DisableRequest) error {
	if adminID == targetID {
		return apperr.BadRequest("Cannot suspend your own account")
	}

	// Validate duration
	validDurations := map[string]bool{"7d": true, "30d": true, "permanent": true}
	if !validDurations[req.Duration] {
		return apperr.BadRequest("Invalid duration. Must be one of: 7d, 30d, permanent")
	}
	if req.Reason == "" {
		return apperr.BadRequest("Reason is required")
	}

	var target models.User
	if err := s.db.First(&target, targetID).Error; err != nil {
		return apperr.NotFound("User not found")
	}

	// Hierarchy enforcement
	if target.Role == models.RoleSuperAdmin {
		return apperr.Forbidden("Cannot suspend a Super Admin")
	}
	if target.Role == models.RoleAdmin && adminRole != models.RoleSuperAdmin {
		return apperr.Forbidden("Only Super Admin can suspend other Admins")
	}
	if req.Duration == "permanent" && adminRole != models.RoleSuperAdmin {
		return apperr.Forbidden("Only Super Admin can issue permanent bans")
	}

	if target.Status == models.StatusBanned {
		return apperr.BadRequest("User is already permanently banned")
	}
	if target.Status == models.StatusSuspended {
		return apperr.BadRequest("User is already suspended")
	}

	status := models.StatusSuspended
	action := "SUSPEND_USER"
	if req.Duration == "permanent" {
		status = models.StatusBanned
		action = "BAN_USER"
	}

	now := time.Now()
	s.db.Model(&target).Updates(map[string]interface{}{
		"status":         status,
		"suspended_at":   now,
		"suspend_reason": req.Reason,
	})

	// Revoke active sessions via per-user Redis key
	if s.rdb != nil {
		ctx := context.Background()
		revokeKey := fmt.Sprintf("revoked:user:%d", targetID)
		s.rdb.SAdd(ctx, "revoked:users", targetID)
		if req.Duration == "permanent" {
			s.rdb.Set(ctx, revokeKey, "1", 365*24*time.Hour)
		} else {
			s.rdb.Set(ctx, revokeKey, "1", 30*24*time.Hour)
		}
	}

	// Cancel active bookings for transporter
	if target.Role == models.RoleTransporter && s.bus != nil {
		s.bus.Publish("booking.cancel_by_transporter", map[string]interface{}{
			"transporter_id": targetID,
		})
	}

	if s.bus != nil {
		s.bus.Publish("notify.account_suspended", map[string]interface{}{
			"user_id": targetID, "reason": req.Reason, "duration": req.Duration,
		})
	}

	metadata, _ := json.Marshal(map[string]string{"duration": req.Duration})
	s.db.Create(&models.AuditLog{
		AdminID:    adminID,
		Action:     action,
		TargetID:   targetID,
		TargetType: "USER",
		Reason:     req.Reason,
		Metadata:   metadata,
	})

	s.log.Info("user disabled", "admin_id", adminID, "target_id", targetID, "duration", req.Duration)
	return nil
}

func (s *Service) EnableUser(adminID, targetID uint, adminRole models.UserRole) error {
	if adminID == targetID {
		return apperr.BadRequest("Cannot modify your own account")
	}

	var target models.User
	if err := s.db.First(&target, targetID).Error; err != nil {
		return apperr.NotFound("User not found")
	}

	if target.Status == models.StatusActive {
		return apperr.BadRequest("User is already active")
	}

	// Only SUPER_ADMIN can lift permanent bans
	if target.Status == models.StatusBanned && adminRole != models.RoleSuperAdmin {
		return apperr.Forbidden("Only Super Admin can lift permanent bans")
	}
	// Only SUPER_ADMIN can enable other admins
	if target.Role == models.RoleAdmin && adminRole != models.RoleSuperAdmin {
		return apperr.Forbidden("Only Super Admin can enable other Admins")
	}

	s.db.Model(&target).Updates(map[string]interface{}{
		"status":         models.StatusActive,
		"suspended_at":   nil,
		"suspend_reason": "",
	})

	if s.rdb != nil {
		ctx := context.Background()
		s.rdb.SRem(ctx, "revoked:users", targetID)
		s.rdb.Del(ctx, fmt.Sprintf("revoked:user:%d", targetID))
	}

	s.db.Create(&models.AuditLog{
		AdminID:    adminID,
		Action:     "ENABLE_USER",
		TargetID:   targetID,
		TargetType: "USER",
		Reason:     "Admin re-enabled",
	})

	s.log.Info("user enabled", "admin_id", adminID, "target_id", targetID)
	return nil
}

// ChangeUserRole allows SUPER_ADMIN to promote/demote users.
// Can promote CUSTOMER/TRANSPORTER → ADMIN, or demote ADMIN → their original role.
func (s *Service) ChangeUserRole(adminID, targetID uint, newRole models.UserRole) error {
	if adminID == targetID {
		return apperr.BadRequest("Cannot change your own role")
	}

	var target models.User
	if err := s.db.First(&target, targetID).Error; err != nil {
		return apperr.NotFound("User not found")
	}

	if target.Role == models.RoleSuperAdmin {
		return apperr.Forbidden("Cannot change Super Admin role")
	}
	if newRole == models.RoleSuperAdmin {
		return apperr.Forbidden("Cannot promote to Super Admin")
	}

	// Validate allowed transitions
	validRoles := map[models.UserRole]bool{
		models.RoleCustomer:    true,
		models.RoleTransporter: true,
		models.RoleAdmin:       true,
	}
	if !validRoles[newRole] {
		return apperr.BadRequest("Invalid target role")
	}
	if target.Role == newRole {
		return apperr.BadRequest("User already has this role")
	}

	oldRole := target.Role
	s.db.Model(&target).Update("role", newRole)

	metadata, _ := json.Marshal(map[string]string{
		"old_role": string(oldRole),
		"new_role": string(newRole),
	})
	s.db.Create(&models.AuditLog{
		AdminID:    adminID,
		Action:     "CHANGE_ROLE",
		TargetID:   targetID,
		TargetType: "USER",
		Reason:     "Role changed from " + string(oldRole) + " to " + string(newRole),
		Metadata:   metadata,
	})

	s.log.Info("user role changed", "admin_id", adminID, "target_id", targetID,
		"old_role", oldRole, "new_role", newRole)
	return nil
}

func (s *Service) SearchUsers(query string, role string, limit, offset int) ([]models.User, int64, error) {
	var users []models.User
	var total int64
	db := s.db.Model(&models.User{})
	if role != "" {
		db = db.Where("role = ?", role)
	}
	if query != "" {
		db = db.Where("full_name ILIKE ? OR email ILIKE ? OR phone ILIKE ?",
			"%"+query+"%", "%"+query+"%", "%"+query+"%")
	}
	db.Count(&total)
	err := db.Limit(limit).Offset(offset).Order("created_at DESC").Find(&users).Error
	return users, total, err
}

// verifyReAuth checks the X-Admin-Password header against the admin's actual password.
func (s *Service) verifyReAuth(adminID uint, password string) error {
	var admin models.User
	if err := s.db.First(&admin, adminID).Error; err != nil {
		return apperr.Unauthorized("Admin not found")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(admin.PasswordHash), []byte(password)); err != nil {
		return apperr.Unauthorized("Re-authentication failed: incorrect password")
	}
	return nil
}

// ─── Handler ───

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// UpdateUserStatus PUT /admin/users/:id/status
func (h *Handler) UpdateUserStatus(c *fiber.Ctx) error {
	adminID, _ := c.Locals("userID").(uint)
	adminRole, _ := c.Locals("role").(models.UserRole)
	targetID, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || targetID == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid user ID"})
	}

	var body struct {
		Action string `json:"action"` // enable or disable
		DisableRequest
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}

	// Require re-authentication for destructive operations
	if body.Duration == "permanent" || body.Action == "enable" {
		reAuthPwd := c.Get("X-Admin-Password")
		if reAuthPwd == "" {
			return c.Status(403).JSON(fiber.Map{
				"error":   true,
				"message": "Re-authentication required. Provide X-Admin-Password header for this operation.",
			})
		}
		if err := h.svc.verifyReAuth(adminID, reAuthPwd); err != nil {
			if ae, ok := apperr.IsAppError(err); ok {
				return c.Status(ae.Code).JSON(fiber.Map{"error": true, "message": ae.Message})
			}
			return c.Status(401).JSON(fiber.Map{"error": true, "message": "Re-authentication failed"})
		}
	}

	var svcErr error
	if body.Action == "enable" {
		svcErr = h.svc.EnableUser(adminID, uint(targetID), adminRole)
	} else {
		svcErr = h.svc.DisableUser(adminID, uint(targetID), adminRole, body.DisableRequest)
	}
	if svcErr != nil {
		if appErr, ok := apperr.IsAppError(svcErr); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ChangeUserRole PUT /admin/users/:id/role (SUPER_ADMIN only)
func (h *Handler) ChangeUserRole(c *fiber.Ctx) error {
	adminID, _ := c.Locals("userID").(uint)
	targetID, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || targetID == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid user ID"})
	}

	var body struct {
		Role models.UserRole `json:"role"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}

	// Require re-authentication
	reAuthPwd := c.Get("X-Admin-Password")
	if reAuthPwd == "" {
		return c.Status(403).JSON(fiber.Map{
			"error":   true,
			"message": "Re-authentication required. Provide X-Admin-Password header.",
		})
	}
	if err := h.svc.verifyReAuth(adminID, reAuthPwd); err != nil {
		if ae, ok := apperr.IsAppError(err); ok {
			return c.Status(ae.Code).JSON(fiber.Map{"error": true, "message": ae.Message})
		}
		return c.Status(401).JSON(fiber.Map{"error": true, "message": "Re-authentication failed"})
	}

	if err := h.svc.ChangeUserRole(adminID, uint(targetID), body.Role); err != nil {
		if appErr, ok := apperr.IsAppError(err); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": true, "message": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"ok": true})
}

// SearchUsers GET /admin/users/search
func (h *Handler) SearchUsers(c *fiber.Ctx) error {
	query := c.Query("q")
	role := c.Query("role")
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	offset, _ := strconv.Atoi(c.Query("offset", "0"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	users, total, err := h.svc.SearchUsers(query, role, limit, offset)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"data": users, "total": total})
}

// ─── Admin Management (SUPER_ADMIN only) ───

// GetAdmins GET /admin/admins
func (h *Handler) GetAdmins(c *fiber.Ctx) error {
	var admins []models.User
	h.svc.db.Where("role IN ?", []models.UserRole{models.RoleAdmin, models.RoleSuperAdmin}).
		Order("role DESC, created_at ASC").Find(&admins)
	return c.JSON(admins)
}

// CreateAdmin POST /admin/admins
func (h *Handler) CreateAdmin(c *fiber.Ctx) error {
	adminID, _ := c.Locals("userID").(uint)

	reAuthPwd := c.Get("X-Admin-Password")
	if reAuthPwd == "" {
		return c.Status(403).JSON(fiber.Map{"error": true, "message": "Re-authentication required"})
	}
	if err := h.svc.verifyReAuth(adminID, reAuthPwd); err != nil {
		return c.Status(401).JSON(fiber.Map{"error": true, "message": "Re-authentication failed"})
	}

	var body struct {
		Email    string `json:"email"`
		Phone    string `json:"phone"`
		FullName string `json:"full_name"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}
	if body.Email == "" || body.FullName == "" || body.Password == "" {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "email, full_name, and password are required"})
	}

	// Check if email already exists
	var existing models.User
	if h.svc.db.Where("email = ?", body.Email).First(&existing).Error == nil {
		return c.Status(409).JSON(fiber.Map{"error": true, "message": "Email already registered"})
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}

	newAdmin := models.User{
		Email:        body.Email,
		Phone:        body.Phone,
		FullName:     body.FullName,
		PasswordHash: string(hash),
		Role:         models.RoleAdmin,
		Status:       models.StatusActive,
	}
	if err := h.svc.db.Create(&newAdmin).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Failed to create admin"})
	}

	metadata, _ := json.Marshal(map[string]string{"new_admin_email": body.Email})
	h.svc.db.Create(&models.AuditLog{
		AdminID:    adminID,
		Action:     "CREATE_ADMIN",
		TargetID:   newAdmin.ID,
		TargetType: "USER",
		Reason:     "New admin account created",
		Metadata:   metadata,
	})

	h.svc.log.Info("admin created", "admin_id", adminID, "new_admin_id", newAdmin.ID)
	return c.Status(201).JSON(newAdmin)
}

// DeleteAdmin DELETE /admin/admins/:id
func (h *Handler) DeleteAdmin(c *fiber.Ctx) error {
	adminID, _ := c.Locals("userID").(uint)
	targetID, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || targetID == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid admin ID"})
	}
	if adminID == uint(targetID) {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Cannot delete your own admin account"})
	}

	reAuthPwd := c.Get("X-Admin-Password")
	if reAuthPwd == "" {
		return c.Status(403).JSON(fiber.Map{"error": true, "message": "Re-authentication required"})
	}
	if err := h.svc.verifyReAuth(adminID, reAuthPwd); err != nil {
		return c.Status(401).JSON(fiber.Map{"error": true, "message": "Re-authentication failed"})
	}

	var target models.User
	if err := h.svc.db.First(&target, targetID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": true, "message": "Admin not found"})
	}
	if target.Role == models.RoleSuperAdmin {
		return c.Status(403).JSON(fiber.Map{"error": true, "message": "Cannot delete Super Admin account"})
	}
	if target.Role != models.RoleAdmin {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Target is not an admin"})
	}

	// Demote to CUSTOMER rather than hard delete
	h.svc.db.Model(&target).Update("role", models.RoleCustomer)

	// Revoke sessions
	if h.svc.rdb != nil {
		ctx := context.Background()
		h.svc.rdb.Set(ctx, fmt.Sprintf("revoked:user:%d", targetID), "1", 24*time.Hour)
	}

	metadata, _ := json.Marshal(map[string]string{"deleted_admin_email": target.Email})
	h.svc.db.Create(&models.AuditLog{
		AdminID:    adminID,
		Action:     "DELETE_ADMIN",
		TargetID:   uint(targetID),
		TargetType: "USER",
		Reason:     "Admin account removed",
		Metadata:   metadata,
	})

	h.svc.log.Info("admin deleted", "admin_id", adminID, "target_id", targetID)
	return c.JSON(fiber.Map{"ok": true})
}
