package repository

import (
	"errors"

	"gorm.io/gorm"

	"spotsync-backend/internal/models"
)

// UserRepository defines the persistence contract for User records.
type UserRepository interface {
	Create(user *models.User) error
	FindByEmail(email string) (*models.User, error)
	FindByID(id uint) (*models.User, error)
	// FindAll returns every user in the system, newest-first.
	// Reserved for admin-only listing endpoints.
	FindAll() ([]models.User, error)
	// CountByRole returns the number of users that match the given role.
	// Used by the admin dashboard to summarize the user base by role.
	CountByRole(role string) (int64, error)
	// Delete removes the user with the given ID. Returns
	// gorm.ErrRecordNotFound when the row does not exist.
	Delete(id uint) error
}

type userRepository struct {
	db *gorm.DB
}

// NewUserRepository wires a UserRepository backed by the given GORM DB.
func NewUserRepository(db *gorm.DB) UserRepository {
	return &userRepository{db: db}
}

// Create inserts a new user record into the database.
func (r *userRepository) Create(user *models.User) error {
	if err := r.db.Create(user).Error; err != nil {
		return err
	}
	return nil
}

// FindByEmail returns the user with the given email or gorm.ErrRecordNotFound.
func (r *userRepository) FindByEmail(email string) (*models.User, error) {
	var user models.User
	if err := r.db.Where("email = ?", email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, err
	}
	return &user, nil
}

// FindByID returns the user with the given primary key or gorm.ErrRecordNotFound.
func (r *userRepository) FindByID(id uint) (*models.User, error) {
	var user models.User
	if err := r.db.First(&user, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, err
	}
	return &user, nil
}

// FindAll returns every user in the system, ordered newest-first by id.
// Used by the admin dashboard's user listing.
func (r *userRepository) FindAll() ([]models.User, error) {
	var users []models.User
	if err := r.db.Order("id DESC").Find(&users).Error; err != nil {
		return nil, err
	}
	return users, nil
}

// CountByRole returns the total number of users with the supplied role.
// Used by the admin dashboard to summarize drivers vs admins.
func (r *userRepository) CountByRole(role string) (int64, error) {
	var count int64
	if err := r.db.Model(&models.User{}).Where("role = ?", role).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

// Delete removes the user with the given ID. Returns gorm.ErrRecordNotFound
// if the row does not exist so the handler can surface a 404.
func (r *userRepository) Delete(id uint) error {
	result := r.db.Delete(&models.User{}, id)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}