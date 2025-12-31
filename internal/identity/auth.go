package identity

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const sessionCookieName = "chat_session"

// AuthManager handles authentication and authorization
type AuthManager struct {
	db Database
}

// NewAuthManager creates a new AuthManager
func NewAuthManager(database Database) *AuthManager {
	am := &AuthManager{
		db: database,
	}
	go am.cleanupExpiredSessions()
	return am
}

// cleanupExpiredSessions periodically removes expired sessions
func (am *AuthManager) cleanupExpiredSessions() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for range ticker.C {
		am.db.DeleteExpiredSessions()
	}
}

// generateSessionToken generates a random session token
func generateSessionToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

// generateAPIKey generates a random API key
func generateAPIKey() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "chat_" + base64.URLEncoding.EncodeToString(b), nil
}

// hashAPIKey hashes an API key for storage
func hashAPIKey(key string) string {
	hash := sha256.Sum256([]byte(key))
	return hex.EncodeToString(hash[:])
}

// Login authenticates a user and creates a session
func (am *AuthManager) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	if req.Username == "" || req.Password == "" {
		http.Error(w, "username and password are required", http.StatusBadRequest)
		return
	}

	user, err := am.db.GetUserByUsername(req.Username)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	if user == nil {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	token, err := generateSessionToken()
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	expiresAt := time.Now().Add(24 * time.Hour)
	session := &Session{
		Token:     token,
		UserID:    user.ID,
		Username:  user.Username,
		ExpiresAt: expiresAt,
	}

	if err := am.db.CreateSession(session); err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"user": map[string]interface{}{
			"id":       user.ID,
			"username": user.Username,
		},
	})
}

// Logout invalidates the current session
func (am *AuthManager) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(sessionCookieName)
	if err == nil {
		am.db.DeleteSession(cookie.Value)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "logged out"})
}

// CheckAuth checks if the user is authenticated
func (am *AuthManager) CheckAuth(w http.ResponseWriter, r *http.Request) {
	session, _ := am.GetSession(r)
	if session == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"authenticated": true,
		"user": map[string]interface{}{
			"id":       session.UserID,
			"username": session.Username,
		},
	})
}

// InitialSetup creates the first user account
func (am *AuthManager) InitialSetup(w http.ResponseWriter, r *http.Request) {
	hasUsers, err := am.db.HasUsers()
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	if hasUsers {
		http.Error(w, "initial setup already completed", http.StatusBadRequest)
		return
	}

	var req CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	if req.Username == "" || req.Password == "" {
		http.Error(w, "username and password are required", http.StatusBadRequest)
		return
	}

	if len(req.Password) < 6 {
		http.Error(w, "password must be at least 6 characters", http.StatusBadRequest)
		return
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	user := &User{
		Username:     req.Username,
		PasswordHash: string(passwordHash),
	}

	if err := am.db.CreateUser(user); err != nil {
		http.Error(w, "failed to create user", http.StatusInternalServerError)
		return
	}

	token, err := generateSessionToken()
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	expiresAt := time.Now().Add(24 * time.Hour)
	session := &Session{
		Token:     token,
		UserID:    user.ID,
		Username:  user.Username,
		ExpiresAt: expiresAt,
	}

	if err := am.db.CreateSession(session); err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"user": map[string]interface{}{
			"id":       user.ID,
			"username": user.Username,
		},
	})
}

// CheckInitialSetup checks if initial setup is needed
func (am *AuthManager) CheckInitialSetup(w http.ResponseWriter, r *http.Request) {
	hasUsers, err := am.db.HasUsers()
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{
		"needs_setup": !hasUsers,
	})
}

// GetSession retrieves the current session from cookie or API key
func (am *AuthManager) GetSession(r *http.Request) (*Session, bool) {
	// Check for API key first
	if apiKey := r.Header.Get("X-API-Key"); apiKey != "" {
		keyHash := hashAPIKey(apiKey)
		key, err := am.db.GetAPIKeyByHash(keyHash)
		if err == nil && key != nil {
			// Update last used timestamp asynchronously
			go am.db.UpdateAPIKeyLastUsed(key.ID)

			// Get user info
			user, err := am.db.GetUserByID(key.UserID)
			if err == nil && user != nil {
				return &Session{
					UserID:    key.UserID,
					Username:  user.Username,
					ExpiresAt: time.Now().Add(24 * time.Hour),
				}, true
			}
		}
	}

	// Fall back to cookie-based session
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return nil, false
	}

	session, err := am.db.GetSessionByToken(cookie.Value)
	if err != nil || session == nil {
		return nil, false
	}

	return session, false
}

// RequireAuth is middleware that requires authentication
func (am *AuthManager) RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		session, _ := am.GetSession(r)
		if session == nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

// OptionalAuth is middleware that allows access if no users exist
func (am *AuthManager) OptionalAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		hasUsers, err := am.db.HasUsers()
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}

		if !hasUsers {
			next(w, r)
			return
		}

		session, _ := am.GetSession(r)
		if session == nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		next(w, r)
	}
}

// CreateAPIKey creates a new API key for the authenticated user
func (am *AuthManager) CreateAPIKey(w http.ResponseWriter, r *http.Request) {
	session, _ := am.GetSession(r)
	if session == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req CreateAPIKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	key, err := generateAPIKey()
	if err != nil {
		http.Error(w, "failed to generate API key", http.StatusInternalServerError)
		return
	}

	apiKey := &APIKey{
		UserID:  session.UserID,
		Name:    req.Name,
		KeyHash: hashAPIKey(key),
	}

	if err := am.db.CreateAPIKey(apiKey); err != nil {
		http.Error(w, "failed to create API key", http.StatusInternalServerError)
		return
	}

	apiKey.Key = key

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(apiKey)
}

// GetAPIKeys lists all API keys for the authenticated user
func (am *AuthManager) GetAPIKeys(w http.ResponseWriter, r *http.Request) {
	session, _ := am.GetSession(r)
	if session == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	keys, err := am.db.GetAPIKeysByUserID(session.UserID)
	if err != nil {
		http.Error(w, "failed to get API keys", http.StatusInternalServerError)
		return
	}

	if keys == nil {
		keys = []APIKey{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(keys)
}

// DeleteAPIKey deletes an API key
func (am *AuthManager) DeleteAPIKey(w http.ResponseWriter, r *http.Request) {
	session, _ := am.GetSession(r)
	if session == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	// Verify the key belongs to the user
	keys, err := am.db.GetAPIKeysByUserID(session.UserID)
	if err != nil {
		http.Error(w, "failed to verify API key ownership", http.StatusInternalServerError)
		return
	}

	found := false
	for _, k := range keys {
		if k.ID == req.ID {
			found = true
			break
		}
	}

	if !found {
		http.Error(w, "API key not found or unauthorized", http.StatusNotFound)
		return
	}

	if err := am.db.DeleteAPIKey(req.ID); err != nil {
		http.Error(w, "failed to delete API key", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}

// GetHistory retrieves all conversation histories for the authenticated user
func (am *AuthManager) GetHistory(w http.ResponseWriter, r *http.Request) {
	session, _ := am.GetSession(r)
	if session == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	histories, err := am.db.GetAllHistory(session.UserID)
	if err != nil {
		http.Error(w, "failed to get history", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(histories)
}

// SyncHistory syncs conversation histories with conflict resolution
func (am *AuthManager) SyncHistory(w http.ResponseWriter, r *http.Request) {
	session, _ := am.GetSession(r)
	if session == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req HistorySyncRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	var response HistorySyncResponse
	response.Conversations = []ConversationHistory{}
	response.Conflicts = []string{}

	// Process each conversation from the client
	for _, clientConv := range req.Conversations {
		// Get server version if it exists
		serverConv, err := am.db.GetHistoryByID(session.UserID, clientConv.ConversationID)
		if err != nil {
			http.Error(w, "failed to check server history", http.StatusInternalServerError)
			return
		}

		var finalConv ConversationHistory

		if serverConv == nil {
			// New conversation, save it
			finalConv = clientConv
			if err := am.db.SaveHistory(session.UserID, &finalConv); err != nil {
				http.Error(w, "failed to save history", http.StatusInternalServerError)
				return
			}
		} else {
			// Conversation exists, check for conflicts
			if clientConv.Version < serverConv.Version {
				// Server is newer, client should update
				finalConv = *serverConv
			} else if clientConv.Version > serverConv.Version {
				// Client is newer, update server
				finalConv = clientConv
				if err := am.db.SaveHistory(session.UserID, &finalConv); err != nil {
					http.Error(w, "failed to save history", http.StatusInternalServerError)
					return
				}
			} else {
				// Same version but different data = conflict
				// Use last-write-wins based on UpdatedAt
				if clientConv.UpdatedAt.After(serverConv.UpdatedAt) {
					finalConv = clientConv
					if err := am.db.SaveHistory(session.UserID, &finalConv); err != nil {
						http.Error(w, "failed to save history", http.StatusInternalServerError)
						return
					}
					response.Conflicts = append(response.Conflicts, clientConv.ConversationID)
				} else {
					finalConv = *serverConv
					response.Conflicts = append(response.Conflicts, clientConv.ConversationID)
				}
			}
		}

		response.Conversations = append(response.Conversations, finalConv)
	}

	// Get all server conversations to send back any the client doesn't have
	allServerConvs, err := am.db.GetAllHistory(session.UserID)
	if err != nil {
		http.Error(w, "failed to get all history", http.StatusInternalServerError)
		return
	}

	// Add server conversations that weren't in the client request
	clientConvIDs := make(map[string]bool)
	for _, c := range req.Conversations {
		clientConvIDs[c.ConversationID] = true
	}

	for _, serverConv := range allServerConvs {
		if !clientConvIDs[serverConv.ConversationID] {
			response.Conversations = append(response.Conversations, serverConv)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// DeleteHistoryItem deletes a specific conversation history
func (am *AuthManager) DeleteHistoryItem(w http.ResponseWriter, r *http.Request) {
	session, _ := am.GetSession(r)
	if session == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		ConversationID string `json:"conversation_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	if req.ConversationID == "" {
		http.Error(w, "conversation_id is required", http.StatusBadRequest)
		return
	}

	if err := am.db.DeleteHistory(session.UserID, req.ConversationID); err != nil {
		http.Error(w, "failed to delete history", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}
