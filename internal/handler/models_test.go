package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"llm-router/internal/model"

	"go.uber.org/zap"
)

func TestHandleModels(t *testing.T) {
	logger := zap.NewNop()

	// Mock a backend server that returns models
	backendServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		models := model.ModelsResponse{
			Object: "list",
			Data: []model.Model{
				{ID: "gpt-4", Object: "model"},
				{ID: "gpt-3.5-turbo", Object: "model", Type: "chat"},
				{ID: "text-embedding", Object: "model", Type: "embedding"},
				{ID: "google/embedding-gecko", Object: "model"}, // No type, but should be filtered
			},
		}
		json.NewEncoder(w).Encode(models)
	}))
	defer backendServer.Close()

	cfg := &model.Config{
		Logger: logger,
		Backends: []model.BackendConfig{
			{
				Name:    "openai",
				BaseURL: backendServer.URL,
				Prefix:  "oa:",
			},
		},
	}

	req, _ := http.NewRequest("GET", "/v1/models", nil)
	rr := httptest.NewRecorder()

	HandleModels(rr, req, cfg)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}

	var resp model.ModelsResponse
	json.Unmarshal(rr.Body.Bytes(), &resp)

	if len(resp.Data) != 2 {
		t.Errorf("expected 2 models, got %d", len(resp.Data))
	}

	for _, m := range resp.Data {
		if m.ID == "oa:text-embedding" {
			t.Errorf("text-embedding should have been filtered out")
		}
	}
}
