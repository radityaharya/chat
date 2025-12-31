package identity

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// GetConfig retrieves the authenticated user's configuration
func (am *AuthManager) GetConfig(w http.ResponseWriter, r *http.Request) {
	session, _ := am.GetSession(r)
	if session == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	config, err := am.db.GetUserConfig(session.UserID)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to get config: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}

// UpdateConfig updates the authenticated user's configuration
func (am *AuthManager) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	session, _ := am.GetSession(r)
	if session == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req UserConfig
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("invalid request: %v", err), http.StatusBadRequest)
		return
	}

	req.UserID = session.UserID // Ensure UserID matches session

	if err := am.db.UpdateUserConfig(&req); err != nil {
		http.Error(w, fmt.Sprintf("failed to update config: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(req)
}
