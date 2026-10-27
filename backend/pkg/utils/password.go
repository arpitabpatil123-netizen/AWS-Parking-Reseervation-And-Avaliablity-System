package utils

import "golang.org/x/crypto/bcrypt"

// HashPassword returns a bcrypt hash of the given plain-text password using the
// default cost (10).
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

// CheckPassword compares a bcrypt-hashed password with a plain-text candidate
// and returns true if they match.
func CheckPassword(hashedPassword, password string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
	return err == nil
}
