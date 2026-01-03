package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"llm-router/internal/model"

	"go.uber.org/zap"
)

func TestHandleGetSettings(t *testing.T) {
	logger := zap.NewNop()
	cfg := &model.Config{
		Logger:        logger,
		ListeningPort: 8080,
		Backends: []model.BackendConfig{
			{Name: "test", BaseURL: "http://test", Prefix: "test:"},
		},
	}

	req, _ := http.NewRequest("GET", "/v1/settings", nil)
	rr := httptest.NewRecorder()

	HandleGetSettings(rr, req, cfg)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(rr.Body.Bytes(), &resp)

	if resp["listening_port"].(float64) != 8080 {
		t.Errorf("expected 8080, got %v", resp["listening_port"])
	}
}

func TestHandlePutSettings(t *testing.T) {
	logger := zap.NewNop()
	cfg := &model.Config{Logger: logger}

	tempFile, err := os.CreateTemp("", "config.json")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(tempFile.Name())

	newConfig := map[string]interface{}{
		"listening_port": 9090,
		"backends": []map[string]interface{}{
			{
				"name":     "new-backend",
				"base_url": "http://new",
				"prefix":   "new:",
			},
		},
	}
	body, _ := json.Marshal(newConfig)

	req, _ := http.NewRequest("PUT", "/v1/settings", bytes.NewBuffer(body))
	rr := httptest.NewRecorder()

	HandlePutSettings(rr, req, cfg, tempFile.Name())

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	// Verify file content
	content, _ := os.ReadFile(tempFile.Name())
	var savedConfig map[string]interface{}
	json.Unmarshal(content, &savedConfig)

	if savedConfig["listening_port"].(float64) != 9090 {
		t.Errorf("expected 9090 in file, got %v", savedConfig["listening_port"])
	}
}

func TestHandlePutSettingsInvalid(t *testing.T) {
	logger := zap.NewNop()
	cfg := &model.Config{Logger: logger}

	tests := []struct {
		name   string
		config map[string]interface{}
		status int
	}{
		{
			name: "Invalid Port",
			config: map[string]interface{}{
				"listening_port": -1,
				"backends":       []interface{}{},
			},
			status: http.StatusBadRequest,
		},
		{
			name: "Missing Backends",
			config: map[string]interface{}{
				"listening_port": 8080,
				"backends":       []interface{}{},
			},
			status: http.StatusBadRequest,
		},
		{
			name: "Invalid Backend",
			config: map[string]interface{}{
				"listening_port": 8080,
				"backends": []map[string]interface{}{
					{"name": ""},
				},
			},
			status: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(tt.config)
			req, _ := http.NewRequest("PUT", "/v1/settings", bytes.NewBuffer(body))
			rr := httptest.NewRecorder()
			HandlePutSettings(rr, req, cfg, "dummy.json")

			if rr.Code != tt.status {
				t.Errorf("expected %d, got %d", tt.status, rr.Code)
			}
		})
	}
}
