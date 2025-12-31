package identity

import (
	"encoding/json"
	"time"
)

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

// ConversationHistory represents a stored conversation with sync metadata
type ConversationHistory struct {
	ID             int64           `json:"id,omitempty"`
	UserID         int64           `json:"user_id,omitempty"`
	ConversationID string          `json:"conversation_id"`
	Version        int64           `json:"version"`
	Title          string          `json:"title"`
	Data           json.RawMessage `json:"data"` // Stores the full conversation state (messages, checkpoints, etc.)
	UpdatedAt      time.Time       `json:"updated_at"`
	CreatedAt      time.Time       `json:"created_at"`
}

// HistorySyncRequest represents a request to sync conversation histories
type HistorySyncRequest struct {
	Conversations []ConversationHistory `json:"conversations"`
}

// HistorySyncResponse represents the response from a sync operation
type HistorySyncResponse struct {
	Conversations []ConversationHistory `json:"conversations"`
	Conflicts     []string              `json:"conflicts,omitempty"` // IDs of conversations with conflicts
}

// UserConfig represents a user's configuration settings
type UserConfig struct {
	UserID       int64           `json:"user_id,omitempty"`
	DefaultModel string          `json:"default_model"`
	Data         json.RawMessage `json:"data,omitempty"`
}
