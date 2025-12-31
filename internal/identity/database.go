package identity

import (
	"database/sql"
	"fmt"
	"net/url"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

// Database interface defines all database operations for identity management
type Database interface {
	Close() error

	// User operations
	CreateUser(user *User) error
	GetUserByUsername(username string) (*User, error)
	GetUserByID(id int64) (*User, error)
	HasUsers() (bool, error)

	// Session operations
	CreateSession(session *Session) error
	GetSessionByToken(token string) (*Session, error)
	DeleteSession(token string) error
	DeleteExpiredSessions() error

	// API Key operations
	CreateAPIKey(key *APIKey) error
	GetAPIKeyByHash(hash string) (*APIKey, error)
	GetAPIKeysByUserID(userID int64) ([]APIKey, error)
	DeleteAPIKey(id int64) error
	UpdateAPIKeyLastUsed(id int64) error

	// History operations
	SaveHistory(userID int64, history *ConversationHistory) error
	GetAllHistory(userID int64) ([]ConversationHistory, error)
	GetHistoryByID(userID int64, conversationID string) (*ConversationHistory, error)
	DeleteHistory(userID int64, conversationID string) error
}

// PostgresDB implements the Database interface using PostgreSQL
type PostgresDB struct {
	db *sql.DB
}

// normalizeConnString normalizes the connection string and disables SSL by default
// if sslmode is not explicitly specified
func normalizeConnString(connString string) string {
	if strings.Contains(connString, "sslmode=") {
		return connString
	}

	if strings.HasPrefix(connString, "postgres://") || strings.HasPrefix(connString, "postgresql://") {
		parsed, err := url.Parse(connString)
		if err != nil {
			return connString + "?sslmode=disable"
		}

		query := parsed.Query()
		if query.Get("sslmode") == "" {
			query.Set("sslmode", "disable")
			parsed.RawQuery = query.Encode()
			return parsed.String()
		}
		return connString
	}

	if !strings.Contains(connString, "sslmode=") {
		if strings.Contains(connString, "?") {
			return connString + "&sslmode=disable"
		}
		return connString + "?sslmode=disable"
	}

	return connString
}

// NewPostgresDB creates a new PostgreSQL database connection
func NewPostgresDB(connString string) (*PostgresDB, error) {
	normalizedConnString := normalizeConnString(connString)
	db, err := sql.Open("postgres", normalizedConnString)
	if err != nil {
		return nil, fmt.Errorf("failed to open postgres connection: %w", err)
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping postgres: %w", err)
	}

	d := &PostgresDB{db: db}
	if err := d.initSchema(); err != nil {
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	return d, nil
}

// Close closes the database connection
func (d *PostgresDB) Close() error {
	return d.db.Close()
}

// initSchema initializes the database schema
func (d *PostgresDB) initSchema() error {
	schema := `
	-- Users table
	CREATE TABLE IF NOT EXISTS users (
		id BIGSERIAL PRIMARY KEY,
		username TEXT NOT NULL UNIQUE,
		password_hash TEXT NOT NULL,
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	-- API Keys table
	CREATE TABLE IF NOT EXISTS api_keys (
		id BIGSERIAL PRIMARY KEY,
		user_id BIGINT NOT NULL,
		name TEXT NOT NULL,
		key_hash TEXT NOT NULL UNIQUE,
		last_used_at TIMESTAMP WITH TIME ZONE,
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);

	-- Sessions table
	CREATE TABLE IF NOT EXISTS sessions (
		id BIGSERIAL PRIMARY KEY,
		token TEXT NOT NULL UNIQUE,
		user_id BIGINT NOT NULL,
		username TEXT NOT NULL,
		expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
	CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

	-- Conversation Histories table
	CREATE TABLE IF NOT EXISTS conversation_histories (
		id BIGSERIAL PRIMARY KEY,
		user_id BIGINT NOT NULL,
		conversation_id TEXT NOT NULL,
		version BIGINT NOT NULL DEFAULT 1,
		title TEXT NOT NULL,
		data JSONB NOT NULL,
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		UNIQUE(user_id, conversation_id)
	);
	CREATE INDEX IF NOT EXISTS idx_conversation_histories_user_id ON conversation_histories(user_id);
	CREATE INDEX IF NOT EXISTS idx_conversation_histories_updated_at ON conversation_histories(updated_at);
	`

	_, err := d.db.Exec(schema)
	return err
}

// User operations

func (d *PostgresDB) CreateUser(user *User) error {
	err := d.db.QueryRow(`
		INSERT INTO users (username, password_hash)
		VALUES ($1, $2)
		RETURNING id, created_at
	`, user.Username, user.PasswordHash).Scan(&user.ID, &user.CreatedAt)
	return err
}

func (d *PostgresDB) GetUserByUsername(username string) (*User, error) {
	var user User
	err := d.db.QueryRow(`
		SELECT id, username, password_hash, created_at
		FROM users
		WHERE username = $1
	`, username).Scan(&user.ID, &user.Username, &user.PasswordHash, &user.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (d *PostgresDB) GetUserByID(id int64) (*User, error) {
	var user User
	err := d.db.QueryRow(`
		SELECT id, username, password_hash, created_at
		FROM users
		WHERE id = $1
	`, id).Scan(&user.ID, &user.Username, &user.PasswordHash, &user.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (d *PostgresDB) HasUsers() (bool, error) {
	var count int
	err := d.db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// Session operations

func (d *PostgresDB) CreateSession(session *Session) error {
	err := d.db.QueryRow(`
		INSERT INTO sessions (token, user_id, username, expires_at)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at
	`, session.Token, session.UserID, session.Username, session.ExpiresAt).Scan(&session.ID, &session.CreatedAt)
	return err
}

func (d *PostgresDB) GetSessionByToken(token string) (*Session, error) {
	var session Session
	err := d.db.QueryRow(`
		SELECT id, token, user_id, username, expires_at, created_at
		FROM sessions
		WHERE token = $1 AND expires_at > NOW()
	`, token).Scan(&session.ID, &session.Token, &session.UserID, &session.Username, &session.ExpiresAt, &session.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &session, nil
}

func (d *PostgresDB) DeleteSession(token string) error {
	_, err := d.db.Exec("DELETE FROM sessions WHERE token = $1", token)
	return err
}

func (d *PostgresDB) DeleteExpiredSessions() error {
	_, err := d.db.Exec("DELETE FROM sessions WHERE expires_at < NOW()")
	return err
}

// API Key operations

func (d *PostgresDB) CreateAPIKey(key *APIKey) error {
	err := d.db.QueryRow(`
		INSERT INTO api_keys (user_id, name, key_hash)
		VALUES ($1, $2, $3)
		RETURNING id, created_at
	`, key.UserID, key.Name, key.KeyHash).Scan(&key.ID, &key.CreatedAt)
	return err
}

func (d *PostgresDB) GetAPIKeyByHash(hash string) (*APIKey, error) {
	var key APIKey
	err := d.db.QueryRow(`
		SELECT id, user_id, name, key_hash, last_used_at, created_at
		FROM api_keys
		WHERE key_hash = $1
	`, hash).Scan(&key.ID, &key.UserID, &key.Name, &key.KeyHash, &key.LastUsedAt, &key.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &key, nil
}

func (d *PostgresDB) GetAPIKeysByUserID(userID int64) ([]APIKey, error) {
	rows, err := d.db.Query(`
		SELECT id, user_id, name, key_hash, last_used_at, created_at
		FROM api_keys
		WHERE user_id = $1
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []APIKey
	for rows.Next() {
		var key APIKey
		if err := rows.Scan(&key.ID, &key.UserID, &key.Name, &key.KeyHash, &key.LastUsedAt, &key.CreatedAt); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}

	return keys, rows.Err()
}

func (d *PostgresDB) DeleteAPIKey(id int64) error {
	_, err := d.db.Exec("DELETE FROM api_keys WHERE id = $1", id)
	return err
}

func (d *PostgresDB) UpdateAPIKeyLastUsed(id int64) error {
	_, err := d.db.Exec("UPDATE api_keys SET last_used_at = NOW() WHERE id = $1", id)
	return err
}

// History operations

func (d *PostgresDB) SaveHistory(userID int64, history *ConversationHistory) error {
	// Upsert: insert or update if exists
	err := d.db.QueryRow(`
		INSERT INTO conversation_histories (user_id, conversation_id, version, title, data, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		ON CONFLICT (user_id, conversation_id)
		DO UPDATE SET
			version = conversation_histories.version + 1,
			title = EXCLUDED.title,
			data = EXCLUDED.data,
			updated_at = NOW()
		RETURNING id, version, created_at, updated_at
	`, userID, history.ConversationID, history.Version, history.Title, history.Data).Scan(
		&history.ID, &history.Version, &history.CreatedAt, &history.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to save history: %w", err)
	}

	history.UserID = userID
	return nil
}

func (d *PostgresDB) GetAllHistory(userID int64) ([]ConversationHistory, error) {
	rows, err := d.db.Query(`
		SELECT id, user_id, conversation_id, version, title, data, updated_at, created_at
		FROM conversation_histories
		WHERE user_id = $1
		ORDER BY updated_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get history: %w", err)
	}
	defer rows.Close()

	var histories []ConversationHistory
	for rows.Next() {
		var h ConversationHistory
		if err := rows.Scan(&h.ID, &h.UserID, &h.ConversationID, &h.Version, &h.Title, &h.Data, &h.UpdatedAt, &h.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan history: %w", err)
		}
		histories = append(histories, h)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating history rows: %w", err)
	}

	if histories == nil {
		histories = []ConversationHistory{}
	}

	return histories, nil
}

func (d *PostgresDB) GetHistoryByID(userID int64, conversationID string) (*ConversationHistory, error) {
	var h ConversationHistory
	err := d.db.QueryRow(`
		SELECT id, user_id, conversation_id, version, title, data, updated_at, created_at
		FROM conversation_histories
		WHERE user_id = $1 AND conversation_id = $2
	`, userID, conversationID).Scan(&h.ID, &h.UserID, &h.ConversationID, &h.Version, &h.Title, &h.Data, &h.UpdatedAt, &h.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get history by id: %w", err)
	}

	return &h, nil
}

func (d *PostgresDB) DeleteHistory(userID int64, conversationID string) error {
	result, err := d.db.Exec("DELETE FROM conversation_histories WHERE user_id = $1 AND conversation_id = $2", userID, conversationID)
	if err != nil {
		return fmt.Errorf("failed to delete history: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("conversation not found")
	}

	return nil
}
