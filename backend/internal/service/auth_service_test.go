package service

import (
	"errors"
	"testing"

	"gorm.io/gorm"

	"spotsync-backend/internal/dto"
	"spotsync-backend/internal/models"
)

type memoryUserRepository struct {
	users map[string]*models.User
}

func (r *memoryUserRepository) Create(user *models.User) error {
	if r.users == nil {
		r.users = make(map[string]*models.User)
	}
	user.ID = uint(len(r.users) + 1)
	r.users[user.Email] = user
	return nil
}

func (r *memoryUserRepository) FindByEmail(email string) (*models.User, error) {
	if user, ok := r.users[email]; ok {
		return user, nil
	}
	return nil, gorm.ErrRecordNotFound
}

func (r *memoryUserRepository) FindByID(id uint) (*models.User, error) {
	for _, user := range r.users {
		if user.ID == id {
			return user, nil
		}
	}
	return nil, gorm.ErrRecordNotFound
}

func (r *memoryUserRepository) FindAll() ([]models.User, error) {
	return nil, nil
}

func (r *memoryUserRepository) CountByRole(string) (int64, error) {
	return 0, nil
}

func (r *memoryUserRepository) Delete(uint) error {
	return errors.New("not implemented")
}

func TestRegisterNeverGrantsAdministrativeRole(t *testing.T) {
	repo := &memoryUserRepository{users: make(map[string]*models.User)}
	svc := NewAuthService(repo, "test-secret")

	user, err := svc.Register(dto.RegisterRequest{
		Name:     "New Account",
		Email:    "new@example.com",
		Password: "password123",
		Role:     "admin",
	})
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	if user.Role != "driver" {
		t.Fatalf("Register() role = %q, want driver", user.Role)
	}
}
