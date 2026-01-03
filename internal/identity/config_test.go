package identity

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestUserConfig(t *testing.T) {
	db := NewMockDatabase()
	am := NewAuthManager(db)

	user := &User{Username: "testuser"}
	db.CreateUser(user)
	token, _ := generateSessionToken()
	db.CreateSession(&Session{Token: token, UserID: user.ID, Username: user.Username, ExpiresAt: time.Now().Add(time.Hour)})

	t.Run("GetDefaultConfig", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/v1/user/me/config", nil)
		req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: token})
		rr := httptest.NewRecorder()

		am.GetConfig(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rr.Code)
		}

		var config UserConfig
		json.Unmarshal(rr.Body.Bytes(), &config)
		if config.UserID != user.ID {
			t.Errorf("expected user id %d, got %d", user.ID, config.UserID)
		}
	})

	t.Run("UpdateConfig", func(t *testing.T) {
		newConfig := UserConfig{
			DefaultModel: "gpt-4",
			Data:         json.RawMessage(`{"theme": "dark"}`),
		}
		body, _ := json.Marshal(newConfig)
		req, _ := http.NewRequest("PUT", "/v1/user/me/config", bytes.NewBuffer(body))
		req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: token})
		rr := httptest.NewRecorder()

		am.UpdateConfig(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rr.Code)
		}

		saved, _ := db.GetUserConfig(user.ID)
		if saved.DefaultModel != "gpt-4" {
			t.Errorf("expected gpt-4, got %s", saved.DefaultModel)
		}
	})
}
