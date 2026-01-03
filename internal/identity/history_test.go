package identity

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHistorySync(t *testing.T) {
	db := NewMockDatabase()
	am := NewAuthManager(db)

	user := &User{Username: "testuser"}
	db.CreateUser(user)
	token, _ := generateSessionToken()
	db.CreateSession(&Session{Token: token, UserID: user.ID, Username: user.Username, ExpiresAt: time.Now().Add(time.Hour)})

	t.Run("SyncNewConversation", func(t *testing.T) {
		conv := ConversationHistory{
			ConversationID: "conv1",
			Version:        1,
			Title:          "First Conv",
			Data:           json.RawMessage(`[]`),
			UpdatedAt:      time.Now(),
		}
		syncReq := HistorySyncRequest{Conversations: []ConversationHistory{conv}}
		body, _ := json.Marshal(syncReq)

		req, _ := http.NewRequest("POST", "/v1/user/me/history", bytes.NewBuffer(body))
		req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: token})
		rr := httptest.NewRecorder()

		am.SyncHistory(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rr.Code)
		}

		var resp HistorySyncResponse
		json.Unmarshal(rr.Body.Bytes(), &resp)
		if len(resp.Conversations) != 1 {
			t.Fatalf("expected 1 conversation, got %d", len(resp.Conversations))
		}
		if resp.Conversations[0].ConversationID != "conv1" {
			t.Errorf("expected conv1, got %s", resp.Conversations[0].ConversationID)
		}
	})

	t.Run("SyncConflictResolution", func(t *testing.T) {
		// Server has version 2
		now := time.Now()
		serverConv := &ConversationHistory{
			ConversationID: "conv1",
			Version:        2,
			Title:          "Server Title",
			Data:           json.RawMessage(`[]`),
			UpdatedAt:      now,
		}
		db.SaveHistory(user.ID, serverConv)

		// Client sends version 1 (older)
		clientConv := ConversationHistory{
			ConversationID: "conv1",
			Version:        1,
			Title:          "Client Title",
			Data:           json.RawMessage(`[]`),
			UpdatedAt:      now.Add(-time.Hour),
		}
		syncReq := HistorySyncRequest{Conversations: []ConversationHistory{clientConv}}
		body, _ := json.Marshal(syncReq)

		req, _ := http.NewRequest("POST", "/v1/user/me/history", bytes.NewBuffer(body))
		req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: token})
		rr := httptest.NewRecorder()

		am.SyncHistory(rr, req)

		var resp HistorySyncResponse
		json.Unmarshal(rr.Body.Bytes(), &resp)
		// Should return the server version (v2)
		if resp.Conversations[0].Version != 2 {
			t.Errorf("expected version 2 (server), got %d", resp.Conversations[0].Version)
		}
	})
}

func TestGetHistoryManifest(t *testing.T) {
	db := NewMockDatabase()
	am := NewAuthManager(db)

	user := &User{Username: "testuser"}
	db.CreateUser(user)
	token, _ := generateSessionToken()
	db.CreateSession(&Session{Token: token, UserID: user.ID, Username: user.Username, ExpiresAt: time.Now().Add(time.Hour)})

	db.SaveHistory(user.ID, &ConversationHistory{ConversationID: "c1", Hash: "h1", Version: 1})

	req, _ := http.NewRequest("GET", "/v1/user/me/history/manifest", nil)
	req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: token})
	rr := httptest.NewRecorder()

	am.GetHistoryManifest(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}

	var resp ManifestResponse
	json.Unmarshal(rr.Body.Bytes(), &resp)
	if len(resp.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(resp.Items))
	}
	if resp.Items[0].Hash != "h1" {
		t.Errorf("expected hash h1, got %s", resp.Items[0].Hash)
	}
}
