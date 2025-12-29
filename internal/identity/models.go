package identity

import "time"

// User represents a user account
type User struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

// Session represents an authenticated session
type Session struct {
	ID        int64     `json:"id"`
	Token     string    `json:"token"`
	UserID    int64     `json:"user_id"`
	Username  string    `json:"username"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

// APIKey represents an API key for programmatic access
type APIKey struct {
	ID         int64      `json:"id"`
	UserID     int64      `json:"user_id"`
	Name       string     `json:"name"`
	Key        string     `json:"key,omitempty"` // Only populated on creation
	KeyHash    string     `json:"-"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

// LoginRequest represents a login request
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// CreateUserRequest represents a user creation request
type CreateUserRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// CreateAPIKeyRequest represents an API key creation request
type CreateAPIKeyRequest struct {
	Name string `json:"name"`
}
