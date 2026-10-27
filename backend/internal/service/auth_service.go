package service

import (
	"errors"

	"gorm.io/gorm"

	"spotsync-backend/internal/dto"
	"spotsync-backend/internal/models"
	"spotsync-backend/internal/repository"
	"spotsync-backend/pkg/utils"
)

// Sentinel errors returned by AuthService. Handlers translate these to HTTP
// status codes.
var (
	ErrEmailAlreadyExists = errors.New("email already exists")
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrUserNotFound       = errors.New("user not found")
)

// AuthService defines the business-logic contract for authentication flows.
type AuthService interface {
	Register(req dto.RegisterRequest) (*dto.UserResponse, error)
	Login(req dto.LoginRequest) (*dto.LoginResponse, error)
	// ListAllUsers returns every registered user. Reserved for admin-only
	// listing endpoints — the handler layer is responsible for the role guard.
	ListAllUsers() ([]dto.UserResponse, error)
	// CountUsersByRole returns the total number of users with the given role.
	CountUsersByRole(role string) (int64, error)
	// DeleteUser removes the user with the given ID. Returns ErrUserNotFound
	// when the row does not exist. Reserved for admin-only endpoints.
	DeleteUser(id uint) error
}

type authService struct {
	userRepo  repository.UserRepository
	jwtSecret string
}

// NewAuthService wires an AuthService backed by the given user repository and
// JWT signing secret.
func NewAuthService(userRepo repository.UserRepository, jwtSecret string) AuthService {
	return &authService{userRepo: userRepo, jwtSecret: jwtSecret}
}

// Register creates a new user after ensuring the email is not already taken
// and the password is securely hashed.
func (s *authService) Register(req dto.RegisterRequest) (*dto.UserResponse, error) {
	role := req.Role
	if role == "" {
		role = "driver"
	}

	// Reject duplicate emails with a stable sentinel error so the handler
	// can return 400 Bad Request.
	existing, err := s.userRepo.FindByEmail(req.Email)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	if existing != nil {
		return nil, ErrEmailAlreadyExists
	}

	hashed, err := utils.HashPassword(req.Password)
	if err != nil {
		return nil, err
	}

	user := &models.User{
		Name:     req.Name,
		Email:    req.Email,
		Password: hashed,
		Role:     role,
	}
	if err := s.userRepo.Create(user); err != nil {
		return nil, err
	}

	return &dto.UserResponse{
		ID:        user.ID,
		Name:      user.Name,
		Email:     user.Email,
		Role:      user.Role,
		CreatedAt: user.CreatedAt,
		UpdatedAt: user.UpdatedAt,
	}, nil
}

// Login verifies the credentials and returns a signed JWT along with the
// public user data.
func (s *authService) Login(req dto.LoginRequest) (*dto.LoginResponse, error) {
	user, err := s.userRepo.FindByEmail(req.Email)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	if !utils.CheckPassword(user.Password, req.Password) {
		return nil, ErrInvalidCredentials
	}

	token, err := utils.GenerateToken(user.ID, user.Role, s.jwtSecret)
	if err != nil {
		return nil, err
	}

	return &dto.LoginResponse{
		Token: token,
		User: dto.UserResponse{
			ID:        user.ID,
			Name:      user.Name,
			Email:     user.Email,
			Role:      user.Role,
			CreatedAt: user.CreatedAt,
			UpdatedAt: user.UpdatedAt,
		},
	}, nil
}

// ListAllUsers returns the full user roster for the admin dashboard.
// Sensitive fields (password) are never returned by the DTO mapping below.
func (s *authService) ListAllUsers() ([]dto.UserResponse, error) {
	users, err := s.userRepo.FindAll()
	if err != nil {
		return nil, err
	}
	out := make([]dto.UserResponse, 0, len(users))
	for _, u := range users {
		out = append(out, dto.UserResponse{
			ID:        u.ID,
			Name:      u.Name,
			Email:     u.Email,
			Role:      u.Role,
			CreatedAt: u.CreatedAt,
			UpdatedAt: u.UpdatedAt,
		})
	}
	return out, nil
}

// CountUsersByRole returns the number of users with the given role.
// Used by the admin dashboard's user KPIs.
func (s *authService) CountUsersByRole(role string) (int64, error) {
	return s.userRepo.CountByRole(role)
}

// DeleteUser removes the user with the given ID. Returns ErrUserNotFound when
// the row does not exist so the handler layer can translate to HTTP 404.
func (s *authService) DeleteUser(id uint) error {
	if err := s.userRepo.Delete(id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrUserNotFound
		}
		return err
	}
	return nil
}