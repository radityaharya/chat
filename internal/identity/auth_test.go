package identity

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

func TestAuthManager(t *testing.T) {
	db := NewMockDatabase()
	am := NewAuthManager(db)

	t.Run("InitialSetup", func(t *testing.T) {
		reqBody, _ := json.Marshal(CreateUserRequest{
			Username: "admin",
			Password: "password123",
		})
		req, _ := http.NewRequest("POST", "/v1/auth/setup", bytes.NewBuffer(reqBody))
		rr := httptest.NewRecorder()

		am.InitialSetup(rr, req)

		if rr.Code != http.StatusCreated {
			t.Errorf("expected 201, got %d", rr.Code)
		}

		hasUsers, _ := db.HasUsers()
		if !hasUsers {
			t.Error("expected user to be created")
		}
	})

	t.Run("Login", func(t *testing.T) {
		reqBody, _ := json.Marshal(LoginRequest{
			Username: "admin",
			Password: "password123",
		})
		req, _ := http.NewRequest("POST", "/v1/auth/login", bytes.NewBuffer(reqBody))
		rr := httptest.NewRecorder()

		am.Login(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rr.Code)
		}

		cookies := rr.Result().Cookies()
		found := false
		for _, c := range cookies {
			if c.Name == sessionCookieName {
				found = true
				break
			}
		}
		if !found {
			t.Error("session cookie not found")
		}
	})

	t.Run("CreateAPIKey", func(t *testing.T) {
		// Mock a session
		token, _ := generateSessionToken()
		user, _ := db.GetUserByUsername("admin")
		db.CreateSession(&Session{Token: token, UserID: user.ID, Username: user.Username, ExpiresAt: time.Now().Add(time.Hour)})

		reqBody, _ := json.Marshal(CreateAPIKeyRequest{Name: "test-key"})
		req, _ := http.NewRequest("POST", "/v1/auth/api-keys", bytes.NewBuffer(reqBody))
		req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: token})
		rr := httptest.NewRecorder()

		am.CreateAPIKey(rr, req)

		if rr.Code != http.StatusCreated {
			t.Errorf("expected 201, got %d", rr.Code)
		}

		var key APIKey
		json.Unmarshal(rr.Body.Bytes(), &key)
		if key.Key == "" {
			t.Error("API key should be returned on creation")
		}
	})
}

func TestVerifyAPIKey(t *testing.T) {
	db := NewMockDatabase()
	am := NewAuthManager(db)

	passwordHash, _ := bcrypt.GenerateFromPassword([]byte("password"), 10)
	user := &User{Username: "user", PasswordHash: string(passwordHash)}
	db.CreateUser(user)

	rawKey, _ := generateAPIKey()
	db.CreateAPIKey(&APIKey{UserID: user.ID, Name: "key", KeyHash: hashAPIKey(rawKey)})

	req, _ := http.NewRequest("GET", "/v1/test", nil)
	req.Header.Set("X-API-Key", rawKey)

	session, isAPIKey := am.GetSession(req)
	if session == nil {
		t.Fatal("session should not be nil")
	}
	if !isAPIKey {
		t.Error("expected isAPIKey to be true")
	}
	if session.Username != "user" {
		t.Errorf("expected username user, got %s", session.Username)
	}
}
