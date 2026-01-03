package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"testing"

	"llm-router/internal/model"
	"llm-router/internal/proxy"

	"go.uber.org/zap"
)

func TestHandleChatCompletions(t *testing.T) {
	logger := zap.NewNop()
	cfg := &model.Config{
		Logger: logger,
		Backends: []model.BackendConfig{
			{
				Name:   "test-backend",
				Prefix: "test:",
				RoleRewrites: map[string]string{
					"user": "human",
				},
				UnsupportedParams: []string{"temperature"},
			},
		},
		Aliases: map[string]string{
			"alias-model": "test:real-model",
		},
	}

	// Mock proxy
	backendURL, _ := url.Parse("http://backend")
	mockProxy := httputil.NewSingleHostReverseProxy(backendURL)

	proxy.Proxies = map[string]*httputil.ReverseProxy{
		"test:": mockProxy,
	}

	t.Run("Model Key Missing", func(t *testing.T) {
		reqBody, _ := json.Marshal(map[string]interface{}{"messages": []interface{}{}})
		req, _ := http.NewRequest("POST", "/v1/chat/completions", bytes.NewBuffer(reqBody))
		rr := httptest.NewRecorder()

		HandleChatCompletions(rr, req, cfg)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rr.Code)
		}
	})

	t.Run("Alias and Routing", func(t *testing.T) {
		// Mock a target server for the proxy
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var body map[string]interface{}
			json.NewDecoder(r.Body).Decode(&body)

			// Verify model was trimmed and aliased
			if body["model"] != "real-model" {
				t.Errorf("expected model real-model, got %v", body["model"])
			}

			// Verify role rewrite
			messages := body["messages"].([]interface{})
			firstMsg := messages[0].(map[string]interface{})
			if firstMsg["role"] != "human" {
				t.Errorf("expected role human, got %v", firstMsg["role"])
			}

			// Verify unsupported param dropped
			if _, exists := body["temperature"]; exists {
				t.Errorf("parameter temperature should have been dropped")
			}

			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()

		targetURL, _ := url.Parse(server.URL)
		proxy.Proxies["test:"] = httputil.NewSingleHostReverseProxy(targetURL)

		chatReq := map[string]interface{}{
			"model": "alias-model",
			"messages": []map[string]string{
				{"role": "user", "content": "hi"},
			},
			"temperature": 0.7,
		}
		body, _ := json.Marshal(chatReq)
		req, _ := http.NewRequest("POST", "/v1/chat/completions", bytes.NewBuffer(body))
		rr := httptest.NewRecorder()

		HandleChatCompletions(rr, req, cfg)

		if rr.Code != http.StatusOK {
			t.Errorf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}
	})
}
