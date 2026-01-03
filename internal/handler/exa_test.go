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

func TestHandleExaTool(t *testing.T) {
	logger := zap.NewNop()

	t.Run("Missing API Key", func(t *testing.T) {
		cfg := &model.Config{
			Logger:    logger,
			ExaAPIKey: "",
		}
		reqBody, _ := json.Marshal(ExaToolRequest{Action: "search"})
		req, _ := http.NewRequest("POST", "/v1/exa", bytes.NewBuffer(reqBody))
		rr := httptest.NewRecorder()

		HandleExaTool(rr, req, cfg)

		if rr.Code != http.StatusServiceUnavailable {
			t.Errorf("expected 503, got %d", rr.Code)
		}
	})

	t.Run("Invalid JSON", func(t *testing.T) {
		cfg := &model.Config{
			Logger:    logger,
			ExaAPIKey: "test-key",
		}
		req, _ := http.NewRequest("POST", "/v1/exa", bytes.NewBufferString("invalid json"))
		rr := httptest.NewRecorder()

		HandleExaTool(rr, req, cfg)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rr.Code)
		}
	})

	t.Run("Unknown Action", func(t *testing.T) {
		cfg := &model.Config{
			Logger:    logger,
			ExaAPIKey: "test-key",
		}
		reqBody, _ := json.Marshal(ExaToolRequest{Action: "unknown"})
		req, _ := http.NewRequest("POST", "/v1/exa", bytes.NewBuffer(reqBody))
		rr := httptest.NewRecorder()

		HandleExaTool(rr, req, cfg)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rr.Code)
		}
	})
}

func TestToStringSlice(t *testing.T) {
	input := []interface{}{"a", "b", 123, "c"}
	expected := []string{"a", "b", "c"}
	result := toStringSlice(input)

	if len(result) != len(expected) {
		t.Fatalf("expected length %d, got %d", len(expected), len(result))
	}

	for i, v := range result {
		if v != expected[i] {
			t.Errorf("at index %d: expected %s, got %s", i, expected[i], v)
		}
	}
}
