package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"go.uber.org/zap"
)

func TestCORSMiddleware(t *testing.T) {
	logger := zap.NewNop()

	// Mock handler that just returns 200 OK
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	middleware := CORSMiddleware(nextHandler, logger)

	t.Run("OPTIONS Request", func(t *testing.T) {
		req, _ := http.NewRequest("OPTIONS", "/v1/test", nil)
		req.Header.Set("Origin", "http://example.com")
		req.Header.Set("Access-Control-Request-Method", "POST")
		req.Header.Set("Access-Control-Request-Headers", "Content-Type, Authorization")

		rr := httptest.NewRecorder()
		middleware.ServeHTTP(rr, req)

		if rr.Code != http.StatusNoContent {
			t.Errorf("CORSMiddleware OPTIONS status = %v, want %v", rr.Code, http.StatusNoContent)
		}

		if rr.Header().Get("Access-Control-Allow-Origin") != "http://example.com" {
			t.Errorf("Access-Control-Allow-Origin = %v, want %v", rr.Header().Get("Access-Control-Allow-Origin"), "http://example.com")
		}

		if rr.Header().Get("Access-Control-Allow-Headers") != "Content-Type, Authorization" {
			t.Errorf("Access-Control-Allow-Headers = %v, want %v", rr.Header().Get("Access-Control-Allow-Headers"), "Content-Type, Authorization")
		}
	})

	t.Run("GET Request with Origin", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/v1/test", nil)
		req.Header.Set("Origin", "http://example.com")

		rr := httptest.NewRecorder()
		middleware.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("CORSMiddleware GET status = %v, want %v", rr.Code, http.StatusOK)
		}

		if rr.Header().Get("Access-Control-Allow-Origin") != "http://example.com" {
			t.Errorf("Access-Control-Allow-Origin = %v, want %v", rr.Header().Get("Access-Control-Allow-Origin"), "http://example.com")
		}
	})

	t.Run("GET Request without Origin", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/v1/test", nil)

		rr := httptest.NewRecorder()
		middleware.ServeHTTP(rr, req)

		if rr.Header().Get("Access-Control-Allow-Origin") != "*" {
			t.Errorf("Access-Control-Allow-Origin = %v, want %v", rr.Header().Get("Access-Control-Allow-Origin"), "*")
		}
	})
}
