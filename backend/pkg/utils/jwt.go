package utils

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// JWTExpiration is the lifetime applied to every newly issued SpotSync JWT.
// Centralized so the "exactly 24 hours" rule lives in one place and cannot
// drift across issuance sites.
const JWTExpiration = 24 * time.Hour

// JWTClaims is the custom payload embedded in SpotSync JWTs.
type JWTClaims struct {
	UserID uint   `json:"user_id"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

// GenerateToken signs an HS256 JWT for the given user with a JWTExpiration
// (24h) lifetime. The expiration is computed at issuance time so every token
// embeds a fresh `exp = now + 24h`.
func GenerateToken(userID uint, role string, secret string) (string, error) {
	now := time.Now()
	claims := JWTClaims{
		UserID: userID,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(JWTExpiration)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", err
	}
	return signed, nil
}

// ValidateToken parses and verifies the JWT string and returns the embedded
// claims when valid. The underlying jwt.ParseWithClaims enforces the `exp`
// claim; expired tokens produce jwt.ErrTokenExpired which is surfaced here.
func ValidateToken(tokenStr string, secret string) (*JWTClaims, error) {
	claims := &JWTClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}
