package seeder

import (
	"log"

	"gorm.io/gorm"

	"spotsync-backend/internal/models"
	"spotsync-backend/pkg/utils"
)

// SeedUserSpec is the in-memory specification of a single seeded user.
// Keeping these as named values (instead of raw models) makes the demo
// credentials easy to find in one place — the login page's quick-fill
// buttons advertise exactly the accounts created here.
type SeedUserSpec struct {
	Name     string
	Email    string
	Password string
	Role     string
}

// DefaultDemoUsers is the canonical list of demo accounts that should
// exist on first boot. The credentials are intentionally published in
// the frontend (login page quick-fill) so they form a usable
// out-of-the-box demo.
//
//	admin@spotsync.com / adminpassword  -> full admin console access
//	john@spotsync.com  / password123    -> driver persona
//	jane@spotsync.com  / password123    -> driver persona
var DefaultDemoUsers = []SeedUserSpec{
	{Name: "Site Administrator", Email: "admin@spotsync.com", Password: "adminpassword", Role: "admin"},
	{Name: "John Driver", Email: "john@spotsync.com", Password: "password123", Role: "driver"},
	{Name: "Jane Driver", Email: "jane@spotsync.com", Password: "password123", Role: "driver"},
}

// SeedUsersIfNeeded inserts the default demo users on a fresh database.
// The function is idempotent and self-healing:
//
//   - If no row exists for the email, create it with the seeded name,
//     bcrypt-hashed password, and role.
//   - If a row exists but its role doesn't match the spec, fix the role
//     in place. This corrects the common case where an admin email was
//     accidentally registered as a driver via /register.
//   - If a row exists with the demo email, always reset its password to
//     the seeded value so the published credentials on the login page
//     keep working even if someone manually changed the password.
//
// Returns the number of users inserted (created from scratch). Role
// corrections and password resets are not counted — they're logged but
// treated as a no-op for the insert counter.
func SeedUsersIfNeeded(db *gorm.DB) (int, error) {
	inserted := 0
	for _, spec := range DefaultDemoUsers {
		var existing models.User
		err := db.Where("email = ?", spec.Email).First(&existing).Error
		if err == nil {
			// User already exists. Repair role + password so the demo
			// login credentials stay accurate even after manual changes.
			repaired := false
			if existing.Role != spec.Role {
				if updateErr := db.Model(&existing).Update("role", spec.Role).Error; updateErr != nil {
					return inserted, updateErr
				}
				log.Printf("Repaired role for %s: %s -> %s", spec.Email, existing.Role, spec.Role)
				repaired = true
			}
			hashed, hashErr := utils.HashPassword(spec.Password)
			if hashErr != nil {
				return inserted, hashErr
			}
			if existing.Password != hashed {
				if updateErr := db.Model(&existing).Update("password", hashed).Error; updateErr != nil {
					return inserted, updateErr
				}
				log.Printf("Reset password for %s to published demo value", spec.Email)
				repaired = true
			}
			_ = repaired
			continue
		}
		hashed, hashErr := utils.HashPassword(spec.Password)
		if hashErr != nil {
			return inserted, hashErr
		}
		user := models.User{
			Name:     spec.Name,
			Email:    spec.Email,
			Password: hashed,
			Role:     spec.Role,
		}
		if createErr := db.Create(&user).Error; createErr != nil {
			return inserted, createErr
		}
		inserted++
		log.Printf("Seeded user %s (%s)", spec.Email, spec.Role)
	}
	return inserted, nil
}
