package vehicle

import (
	"log/slog"
	"strconv"
	"time"

	apperr "github.com/speedygo/speedygo/internal/errors"
	"github.com/speedygo/speedygo/internal/models"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(v *models.Vehicle) error {
	return r.db.Create(v).Error
}

func (r *Repository) FindByID(id uint) (*models.Vehicle, error) {
	var v models.Vehicle
	err := r.db.Preload("Owner").First(&v, id).Error
	return &v, err
}

func (r *Repository) FindByOwner(ownerID uint) ([]models.Vehicle, error) {
	var vehicles []models.Vehicle
	err := r.db.Where("owner_id = ?", ownerID).Find(&vehicles).Error
	return vehicles, err
}

func (r *Repository) FindNearby(lat, lng, radiusKm float64, vehicleType string, limit int) ([]models.Vehicle, error) {
	var vehicles []models.Vehicle
	query := r.db.Where("is_active = true AND approval_status = 'APPROVED' AND "+
		"(6371 * acos(LEAST(1.0, cos(radians(?)) * cos(radians(current_lat)) * cos(radians(current_lng) - radians(?)) + sin(radians(?)) * sin(radians(current_lat))))) < ?",
		lat, lng, lat, radiusKm)
	if vehicleType != "" {
		query = query.Where("type = ?", vehicleType)
	}
	err := query.Preload("Owner").Limit(limit).Find(&vehicles).Error
	return vehicles, err
}

func (r *Repository) UpdateLocation(id uint, lat, lng float64) error {
	now := time.Now()
	return r.db.Model(&models.Vehicle{}).Where("id = ?", id).Updates(map[string]interface{}{
		"current_lat":     lat,
		"current_lng":     lng,
		"last_gps_update": now,
	}).Error
}

func (r *Repository) Update(v *models.Vehicle) error {
	return r.db.Save(v).Error
}

func (r *Repository) Delete(id uint) error {
	return r.db.Delete(&models.Vehicle{}, id).Error
}

func (r *Repository) FindPendingApproval(limit, offset int) ([]models.Vehicle, int64, error) {
	var vehicles []models.Vehicle
	var total int64
	db := r.db.Model(&models.Vehicle{}).Where("approval_status = ?", models.VehiclePendingApproval)
	db.Count(&total)
	err := db.Preload("Owner").Limit(limit).Offset(offset).Order("created_at ASC").Find(&vehicles).Error
	return vehicles, total, err
}

func (r *Repository) Search(query string, vType models.VehicleType, limit, offset int) ([]models.Vehicle, int64, error) {
	var vehicles []models.Vehicle
	var total int64
	db := r.db.Model(&models.Vehicle{}).Where("is_active = true")
	if vType != "" {
		db = db.Where("type = ?", vType)
	}
	if query != "" {
		db = db.Where("registration_no ILIKE ? OR make ILIKE ? OR model_name ILIKE ?",
			"%"+query+"%", "%"+query+"%", "%"+query+"%")
	}
	db.Count(&total)
	err := db.Preload("Owner").Limit(limit).Offset(offset).Find(&vehicles).Error
	return vehicles, total, err
}

// ─── Pricing ───

func (r *Repository) GetAllPricing() ([]models.Pricing, error) {
	var pricing []models.Pricing
	err := r.db.Find(&pricing).Error
	return pricing, err
}

func (r *Repository) UpsertPricing(p *models.Pricing) error {
	var existing models.Pricing
	err := r.db.Where("vehicle_type = ?", p.VehicleType).First(&existing).Error
	if err == gorm.ErrRecordNotFound {
		return r.db.Create(p).Error
	}
	return r.db.Model(&existing).Updates(map[string]interface{}{
		"base_price_paise":     p.BasePricePaise,
		"price_per_km_paise":   p.PricePerKmPaise,
		"loading_charges_paise": p.LoadingChargesPaise,
		"surge_multiplier":     p.SurgeMultiplier,
		"min_distance_km":      p.MinDistanceKm,
		"updated_by_id":        p.UpdatedByID,
	}).Error
}

// Handler exposes vehicle HTTP endpoints.
type Handler struct {
	repo *Repository
	log  *slog.Logger
}

func NewHandler(repo *Repository, log *slog.Logger) *Handler {
	return &Handler{repo: repo, log: log}
}

// RegisterVehicle POST /vehicles
func (h *Handler) RegisterVehicle(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	var v models.Vehicle
	if err := c.BodyParser(&v); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}
	if v.RegistrationNo == "" {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Registration number is required"})
	}
	if v.Type == "" {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Vehicle type is required"})
	}
	if v.MaxWeightKg <= 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Max weight must be positive"})
	}

	// Enforce 1 vehicle per transporter at a time
	existing, _ := h.repo.FindByOwner(userID)
	if len(existing) > 0 {
		return c.Status(409).JSON(fiber.Map{"error": true, "message": "You already have a vehicle registered. Delete it first to add a new one."})
	}

	v.OwnerID = userID
	v.ID = 0
	v.ApprovalStatus = models.VehiclePendingApproval
	v.IsActive = false // inactive until approved
	if err := h.repo.Create(&v); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Failed to register vehicle"})
	}
	return c.Status(201).JSON(v)
}

// UpdateVehicle PUT /vehicles/:id
func (h *Handler) UpdateVehicle(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || id == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid vehicle ID"})
	}
	v, err := h.repo.FindByID(uint(id))
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": true, "message": "Vehicle not found"})
	}
	if v.OwnerID != userID {
		ae := apperr.Forbidden("Not vehicle owner")
		return c.Status(ae.Code).JSON(fiber.Map{"error": true, "message": ae.Message})
	}

	var body struct {
		Make              string  `json:"make"`
		Model             string  `json:"model"`
		Year              int     `json:"year"`
		MaxWeightKg       float64 `json:"max_weight_kg"`
		InsuranceExpiry   string  `json:"insurance_expiry"`
		InsuranceNo       string  `json:"insurance_no"`
		InsuranceProvider string  `json:"insurance_provider"`
		Photos            []string `json:"photos"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}
	if body.Make != "" {
		v.Make = body.Make
	}
	if body.Model != "" {
		v.ModelName = body.Model
	}
	if body.Year > 0 {
		v.Year = body.Year
	}
	if body.MaxWeightKg > 0 {
		v.MaxWeightKg = body.MaxWeightKg
	}
	if body.InsuranceNo != "" {
		v.InsuranceNo = body.InsuranceNo
	}
	if body.InsuranceProvider != "" {
		v.InsuranceProvider = body.InsuranceProvider
	}
	if body.InsuranceExpiry != "" {
		t, err := time.Parse("2006-01-02", body.InsuranceExpiry)
		if err == nil {
			v.InsuranceExpiry = &t
		}
	}

	if err := h.repo.Update(v); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Failed to update"})
	}
	return c.JSON(v)
}

// DeleteVehicle DELETE /vehicles/:id
func (h *Handler) DeleteVehicle(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || id == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid vehicle ID"})
	}
	v, err := h.repo.FindByID(uint(id))
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": true, "message": "Vehicle not found"})
	}
	if v.OwnerID != userID {
		ae := apperr.Forbidden("Not vehicle owner")
		return c.Status(ae.Code).JSON(fiber.Map{"error": true, "message": ae.Message})
	}
	if err := h.repo.Delete(uint(id)); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Failed to delete"})
	}
	return c.JSON(fiber.Map{"ok": true})
}

// GetVehicle GET /vehicles/:id
func (h *Handler) GetVehicle(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || id == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid vehicle ID"})
	}
	v, err := h.repo.FindByID(uint(id))
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": true, "message": "Vehicle not found"})
	}
	return c.JSON(v)
}

// GetMyVehicles GET /vehicles/my
func (h *Handler) GetMyVehicles(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uint)
	vehicles, err := h.repo.FindByOwner(userID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(vehicles)
}

// SearchNearby GET /vehicles/nearby
func (h *Handler) SearchNearby(c *fiber.Ctx) error {
	lat, _ := strconv.ParseFloat(c.Query("lat"), 64)
	lng, _ := strconv.ParseFloat(c.Query("lng"), 64)
	radius, _ := strconv.ParseFloat(c.Query("radius", "10"), 64)
	vType := c.Query("type")
	limit, _ := strconv.Atoi(c.Query("limit", "20"))

	if c.Query("lat") == "" || c.Query("lng") == "" {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "lat and lng query parameters are required"})
	}
	if radius <= 0 || radius > 500 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "radius must be between 0 and 500 km"})
	}

	vehicles, err := h.repo.FindNearby(lat, lng, radius, vType, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(vehicles)
}

// SearchVehicles GET /vehicles/search
func (h *Handler) SearchVehicles(c *fiber.Ctx) error {
	query := c.Query("q")
	vType := models.VehicleType(c.Query("type"))
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	offset, _ := strconv.Atoi(c.Query("offset", "0"))

	vehicles, total, err := h.repo.Search(query, vType, limit, offset)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"data": vehicles, "total": total})
}

// UpdateLocation PUT /vehicles/:id/location
func (h *Handler) UpdateLocation(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || id == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid vehicle ID"})
	}
	var body struct {
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}
	if body.Lat < -90 || body.Lat > 90 || body.Lng < -180 || body.Lng > 180 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid coordinates"})
	}
	if body.Lat == 0 && body.Lng == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Coordinates (0,0) are not valid"})
	}

	v, err := h.repo.FindByID(uint(id))
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": true, "message": "Vehicle not found"})
	}
	userID, _ := c.Locals("userID").(uint)
	if v.OwnerID != userID {
		ae := apperr.Forbidden("Not vehicle owner")
		return c.Status(ae.Code).JSON(fiber.Map{"error": true, "message": ae.Message})
	}

	h.repo.UpdateLocation(uint(id), body.Lat, body.Lng)
	return c.JSON(fiber.Map{"ok": true})
}

// ─── Admin Vehicle Approval ───

// GetPendingVehicles GET /admin/vehicles/pending
func (h *Handler) GetPendingVehicles(c *fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	offset, _ := strconv.Atoi(c.Query("offset", "0"))
	vehicles, total, err := h.repo.FindPendingApproval(limit, offset)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(fiber.Map{"data": vehicles, "total": total})
}

// ReviewVehicle PUT /admin/vehicles/:id/review
func (h *Handler) ReviewVehicle(c *fiber.Ctx) error {
	adminID, _ := c.Locals("userID").(uint)
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || id == 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid vehicle ID"})
	}
	var body struct {
		Action string `json:"action"` // "approve" or "reject"
		Note   string `json:"note"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}
	v, err := h.repo.FindByID(uint(id))
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": true, "message": "Vehicle not found"})
	}
	switch body.Action {
	case "approve":
		v.ApprovalStatus = models.VehicleApproved
		v.IsActive = true
	case "reject":
		v.ApprovalStatus = models.VehicleRejected
		v.IsActive = false
	default:
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "action must be 'approve' or 'reject'"})
	}
	v.ApprovalNote = body.Note
	v.ApprovedByID = &adminID
	if err := h.repo.Update(v); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Failed to update"})
	}
	return c.JSON(v)
}

// ─── Pricing Endpoints ───

// GetPricing GET /admin/pricing
func (h *Handler) GetPricing(c *fiber.Ctx) error {
	pricing, err := h.repo.GetAllPricing()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(pricing)
}

// UpsertPricing PUT /admin/pricing
func (h *Handler) UpsertPricing(c *fiber.Ctx) error {
	adminID, _ := c.Locals("userID").(uint)
	var p models.Pricing
	if err := c.BodyParser(&p); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "Invalid body"})
	}
	if p.VehicleType == "" {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "vehicle_type is required"})
	}
	if p.PricePerKmPaise <= 0 {
		return c.Status(400).JSON(fiber.Map{"error": true, "message": "price_per_km_paise must be positive"})
	}
	p.UpdatedByID = &adminID
	if err := h.repo.UpsertPricing(&p); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Failed to save pricing"})
	}
	return c.JSON(fiber.Map{"ok": true})
}

// GetPublicPricing GET /pricing (public for customers to see rates)
func (h *Handler) GetPublicPricing(c *fiber.Ctx) error {
	pricing, err := h.repo.GetAllPricing()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": true, "message": "Internal error"})
	}
	return c.JSON(pricing)
}

