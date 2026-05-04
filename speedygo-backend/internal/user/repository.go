package user

import (
	"github.com/speedygo/speedygo/internal/models"
	"gorm.io/gorm"
)

// Repository handles user database operations.
type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(user *models.User) error {
	return r.db.Create(user).Error
}

func (r *Repository) FindByID(id uint) (*models.User, error) {
	var user models.User
	err := r.db.First(&user, id).Error
	return &user, err
}

func (r *Repository) FindByEmail(email string) (*models.User, error) {
	var user models.User
	err := r.db.Where("email = ?", email).First(&user).Error
	return &user, err
}

func (r *Repository) FindByPhone(phone string) (*models.User, error) {
	var user models.User
	err := r.db.Where("phone = ?", phone).First(&user).Error
	return &user, err
}

func (r *Repository) Update(user *models.User) error {
	return r.db.Save(user).Error
}

func (r *Repository) UpdateStatus(id uint, status models.UserStatus, reason string) error {
	return r.db.Model(&models.User{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":        status,
		"suspend_reason": reason,
	}).Error
}

func (r *Repository) UpdateFCMToken(id uint, token string) error {
	return r.db.Model(&models.User{}).Where("id = ?", id).Update("fcm_token", token).Error
}

func (r *Repository) IncrementWarnings(id uint) error {
	return r.db.Model(&models.User{}).Where("id = ?", id).
		UpdateColumn("warning_count", gorm.Expr("warning_count + 1")).Error
}

func (r *Repository) Search(query string, role models.UserRole, limit, offset int) ([]models.User, int64, error) {
	var users []models.User
	var total int64

	db := r.db.Model(&models.User{})
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
