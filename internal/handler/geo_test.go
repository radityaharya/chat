package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"llm-router/internal/model"

	"go.uber.org/zap"
)

func TestHandleGeoTool(t *testing.T) {
	logger := zap.NewNop()

	t.Run("Missing API Key", func(t *testing.T) {
		cfg := &model.Config{
			Logger:         logger,
			GeoapifyAPIKey: "",
		}
		reqBody, _ := json.Marshal(GeoToolRequest{Action: "geocode_search"})
		req, _ := http.NewRequest("POST", "/v1/geo", bytes.NewBuffer(reqBody))
		rr := httptest.NewRecorder()

		HandleGeoTool(rr, req, cfg)

		if rr.Code != http.StatusServiceUnavailable {
			t.Errorf("expected 503, got %d", rr.Code)
		}
	})

	t.Run("Invalid JSON", func(t *testing.T) {
		cfg := &model.Config{
			Logger:         logger,
			GeoapifyAPIKey: "test-key",
		}
		req, _ := http.NewRequest("POST", "/v1/geo", bytes.NewBufferString("invalid json"))
		rr := httptest.NewRecorder()

		HandleGeoTool(rr, req, cfg)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rr.Code)
		}
	})

	t.Run("Unknown Action", func(t *testing.T) {
		cfg := &model.Config{
			Logger:         logger,
			GeoapifyAPIKey: "test-key",
		}
		reqBody, _ := json.Marshal(GeoToolRequest{Action: "unknown"})
		req, _ := http.NewRequest("POST", "/v1/geo", bytes.NewBuffer(reqBody))
		rr := httptest.NewRecorder()

		HandleGeoTool(rr, req, cfg)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rr.Code)
		}
	})
}

func TestParseGeocodeSearchRequest(t *testing.T) {
	params := map[string]interface{}{
		"text":  "London",
		"lang":  "en",
		"limit": 5.0,
	}
	req := parseGeocodeSearchRequest(params)

	if req.Text != "London" {
		t.Errorf("expected London, got %s", req.Text)
	}
	if req.Lang != "en" {
		t.Errorf("expected en, got %s", req.Lang)
	}
	if req.Limit != 5 {
		t.Errorf("expected 5, got %d", req.Limit)
	}
}
