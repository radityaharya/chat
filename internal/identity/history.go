package identity

import (
	"encoding/json"
	"net/http"

	"go.uber.org/zap"
)

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
		// Process images in conversation data before saving
		if err := am.processConversationImages(&clientConv); err != nil {
			if globalLogger != nil {
				globalLogger.Error("Failed to process conversation images",
					zap.String("conversation_id", clientConv.ConversationID),
					zap.Error(err))
			}
			// Continue with original data if image processing fails
		}

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
