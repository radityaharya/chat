package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"llm-router/internal/model"

	"go.uber.org/zap"
)

func TestHandleValidateAPIKey(t *testing.T) {
	logger := zap.NewNop()
	cfg := &model.Config{
		Logger:          logger,
		LLMRouterAPIKey: "test-api-key",
	}

	tests := []struct {
		name           string
		authHeader     string
		expectedValid  bool
		expectedStatus int
	}{
		{
			name:           "Valid API Key",
			authHeader:     "Bearer test-api-key",
			expectedValid:  true,
			expectedStatus: http.StatusOK,
		},
		{
			name:           "Invalid API Key",
			authHeader:     "Bearer wrong-key",
			expectedValid:  false,
			expectedStatus: http.StatusOK,
		},
		{
			name:           "Missing Bearer Prefix",
			authHeader:     "test-api-key",
			expectedValid:  false,
			expectedStatus: http.StatusOK,
		},
		{
			name:           "Empty Header",
			authHeader:     "",
			expectedValid:  false,
			expectedStatus: http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := http.NewRequest("GET", "/v1/validate", nil)
			if err != nil {
				t.Fatal(err)
			}
			req.Header.Set("Authorization", tt.authHeader)

			rr := httptest.NewRecorder()
			HandleValidateAPIKey(rr, req, cfg)

			if rr.Code != tt.expectedStatus {
				t.Errorf("HandleValidateAPIKey() status code = %v, want %v", rr.Code, tt.expectedStatus)
			}

			var response ValidateResponse
			if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
				t.Fatalf("Failed to unmarshal response: %v", err)
			}

			if response.Valid != tt.expectedValid {
				t.Errorf("HandleValidateAPIKey() valid = %v, want %v", response.Valid, tt.expectedValid)
			}
		})
	}
}
