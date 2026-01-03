package proxy

import (
	"llm-router/internal/model"
	"net/http"
	"os"
	"testing"

	"go.uber.org/zap"
)

func TestJoinPaths(t *testing.T) {
	tests := []struct {
		base     string
		req      string
		expected string
	}{
		{"/v1", "chat/completions", "/v1/chat/completions"},
		{"/v1/", "/chat/completions", "/v1/chat/completions"},
		{"http://api.openai.com/v1", "v1/chat/completions", "http://api.openai.com/v1/chat/completions"},
		{"/base", "sub", "/base/sub"},
	}

	for _, tt := range tests {
		t.Run(tt.base+"+"+tt.req, func(t *testing.T) {
			result := joinPaths(tt.base, tt.req)
			if result != tt.expected {
				t.Errorf("joinPaths(%s, %s) = %s, want %s", tt.base, tt.req, result, tt.expected)
			}
		})
	}
}

func TestExtractClientIP(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"1.2.3.4:1234", "1.2.3.4"},
		{"[2001:db8::1]:1234", "2001:db8::1"},
		{"127.0.0.1", "127.0.0.1"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := extractClientIP(tt.input)
			if result != tt.expected {
				t.Errorf("extractClientIP(%s) = %s, want %s", tt.input, result, tt.expected)
			}
		})
	}
}

func TestResolveAPIKeys(t *testing.T) {
	os.Setenv("TEST_KEY_ENV", "env-value")
	defer os.Unsetenv("TEST_KEY_ENV")

	backend := model.BackendConfig{
		Name:    "test",
		APIKeys: []string{"literal-key", "$TEST_KEY_ENV", "$NON_EXISTENT"},
	}

	logger := zap.NewNop()
	resolved := resolveAPIKeys(backend, logger)

	if len(resolved) != 2 {
		t.Errorf("expected 2 resolved keys, got %d", len(resolved))
	}
	if resolved[0] != "literal-key" {
		t.Errorf("expected literal-key, got %s", resolved[0])
	}
	if resolved[1] != "env-value" {
		t.Errorf("expected env-value, got %s", resolved[1])
	}
}

func TestShouldRetryWithoutTools(t *testing.T) {
	tests := []struct {
		status   int
		body     string
		expected bool
	}{
		{http.StatusNotFound, "No endpoints found that support tool use", true},
		{http.StatusNotFound, "other error", false},
		{http.StatusBadRequest, "function calling not supported", true},
		{http.StatusOK, "", false},
	}

	for _, tt := range tests {
		resp := &http.Response{StatusCode: tt.status}
		if result := shouldRetryWithoutTools(resp, tt.body); result != tt.expected {
			t.Errorf("shouldRetryWithoutTools(%d, %s) = %v, want %v", tt.status, tt.body, result, tt.expected)
		}
	}
}
