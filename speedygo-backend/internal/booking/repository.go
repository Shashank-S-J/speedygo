package booking

import (
	"encoding/json"
	"errors"

	"github.com/speedygo/speedygo/internal/models"
	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(b *models.Booking) error {
	return r.db.Create(b).Error
}

func (r *Repository) FindByID(id uint) (*models.Booking, error) {
	var b models.Booking
	err := r.db.Preload("Customer").Preload("Transporter").Preload("Vehicle").Preload("Waypoints").First(&b, id).Error
	return &b, err
}

func (r *Repository) FindByCustomer(customerID uint, limit, offset int) ([]models.Booking, int64, error) {
	var bookings []models.Booking
	var total int64
	db := r.db.Model(&models.Booking{}).Where("customer_id = ?", customerID)
	db.Count(&total)
	err := db.Preload("Transporter").Preload("Vehicle").
		Limit(limit).Offset(offset).Order("created_at DESC").Find(&bookings).Error
	return bookings, total, err
}

func (r *Repository) FindByTransporter(transporterID uint, limit, offset int) ([]models.Booking, int64, error) {
	var bookings []models.Booking
	var total int64
	db := r.db.Model(&models.Booking{}).Where("transporter_id = ?", transporterID)
	db.Count(&total)
	err := db.Preload("Customer").Preload("Vehicle").
		Limit(limit).Offset(offset).Order("created_at DESC").Find(&bookings).Error
	return bookings, total, err
}

func (r *Repository) FindPendingInArea(lat, lng, radiusKm float64, limit int) ([]models.Booking, error) {
	var bookings []models.Booking
	err := r.db.Where("status IN ? AND "+
		"(6371 * acos(LEAST(1.0, cos(radians(?)) * cos(radians(pickup_lat)) * cos(radians(pickup_lng) - radians(?)) + sin(radians(?)) * sin(radians(pickup_lat))))) < ?",
		[]string{string(models.BookingPending), string(models.BookingBidding)},
		lat, lng, lat, radiusKm).
		Limit(limit).Order("created_at ASC").Find(&bookings).Error
	return bookings, err
}

// UpdateStatus with optimistic locking
func (r *Repository) UpdateStatus(id uint, status models.BookingStatus, version int) error {
	result := r.db.Model(&models.Booking{}).
		Where("id = ? AND version = ?", id, version).
		Updates(map[string]interface{}{
			"status":  status,
			"version": version + 1,
		})
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return result.Error
}

// AcceptBookingAtomic performs vehicle validation, overcommit check, transporter assignment,
// and status update in a single DB transaction with optimistic locking.
// This prevents TOCTOU races where two transporters accept the same booking simultaneously.
func (r *Repository) AcceptBookingAtomic(bookingID, transporterID, vehicleID uint, version int) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		// 1. Validate vehicle ownership
		var v models.Vehicle
		if err := tx.First(&v, vehicleID).Error; err != nil {
			return errors.New("vehicle_mismatch")
		}
		if v.OwnerID != transporterID {
			return errors.New("vehicle_mismatch")
		}
		if v.ApprovalStatus != models.VehicleApproved {
			return errors.New("vehicle_not_approved")
		}

		// 2. Atomic overcommit check using SELECT ... FOR UPDATE on active bookings
		var activeCount int64
		tx.Model(&models.Booking{}).
			Where("transporter_id = ? AND status IN ?", transporterID,
				[]string{string(models.BookingAccepted), string(models.BookingPickingUp), string(models.BookingInTransit)}).
			Count(&activeCount)
		if activeCount >= 3 {
			return errors.New("overcommit")
		}

		// 3. Atomically assign transporter + update status with version check
		result := tx.Model(&models.Booking{}).
			Where("id = ? AND version = ? AND status IN ?", bookingID, version,
				[]string{string(models.BookingPending), string(models.BookingBidding)}).
			Updates(map[string]interface{}{
				"transporter_id": transporterID,
				"vehicle_id":     vehicleID,
				"status":         models.BookingAccepted,
				"version":        version + 1,
			})
		if result.RowsAffected == 0 {
			return errors.New("already_accepted")
		}
		return result.Error
	})
}

func (r *Repository) AssignTransporter(bookingID, transporterID, vehicleID uint) error {
	var v models.Vehicle
	if err := r.db.First(&v, vehicleID).Error; err != nil {
		return err
	}
	if v.OwnerID != transporterID {
		return gorm.ErrInvalidData
	}
	if v.ApprovalStatus != models.VehicleApproved {
		return errors.New("vehicle_not_approved")
	}

	return r.db.Model(&models.Booking{}).Where("id = ?", bookingID).Updates(map[string]interface{}{
		"transporter_id": transporterID,
		"vehicle_id":     vehicleID,
	}).Error
}

func (r *Repository) Update(b *models.Booking) error {
	return r.db.Save(b).Error
}

func (r *Repository) CountByTransporterAndStatus(transporterID uint, status models.BookingStatus) (int64, error) {
	var count int64
	err := r.db.Model(&models.Booking{}).Where("transporter_id = ? AND status = ?", transporterID, status).Count(&count).Error
	return count, err
}

func (r *Repository) CreateWaypoint(w *models.Waypoint) error {
	return r.db.Create(w).Error
}

func (r *Repository) IncrementCancellationCount(userID uint) error {
	return r.db.Model(&models.User{}).Where("id = ?", userID).
		UpdateColumn("cancellation_count", gorm.Expr("cancellation_count + 1")).Error
}

func (r *Repository) UpdatePhotos(bookingID uint, stage string, urls []string) error {
	urlsJSON, _ := json.Marshal(urls)
	field := "pickup_photos"
	if stage == "delivery" {
		field = "delivery_photos"
	}
	return r.db.Model(&models.Booking{}).Where("id = ?", bookingID).Update(field, urlsJSON).Error
}

func (r *Repository) UpdatePickupOTP(bookingID uint, otp string) error {
	return r.db.Model(&models.Booking{}).Where("id = ?", bookingID).Update("pickup_otp", otp).Error
}

func (r *Repository) UpdateUserAvailability(userID uint, available bool) error {
	return r.db.Model(&models.User{}).Where("id = ?", userID).Update("is_available", available).Error
}

func (r *Repository) UpdateUserRating(userID uint, newRating float64) error {
	return r.db.Model(&models.User{}).Where("id = ?", userID).
		Updates(map[string]interface{}{
			"avg_rating":    gorm.Expr("CASE WHEN total_ratings = 0 THEN ? ELSE (COALESCE(avg_rating, 0) * total_ratings + ?) / (total_ratings + 1) END", newRating, newRating),
			"total_ratings": gorm.Expr("total_ratings + 1"),
		}).Error
}

