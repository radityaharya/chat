package handler

import (
	"net/http"

	"go.uber.org/zap"
)

// CORSMiddleware wraps an http.Handler with CORS headers that allow all origins
func CORSMiddleware(next http.HandlerFunc, logger *zap.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers for all requests
		origin := r.Header.Get("Origin")
		if origin == "" {
			origin = "*"
		}

		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers")

		// Handle preflight OPTIONS requests
		if r.Method == "OPTIONS" {
			logger.Debug("Handling OPTIONS request for CORS preflight")

			// Get requested headers from the preflight request
			reqHeaders := r.Header.Get("Access-Control-Request-Headers")
			if reqHeaders != "" {
				w.Header().Set("Access-Control-Allow-Headers", reqHeaders)
			} else {
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept")
			}

			// Log the requested method in preflight
			if reqMethod := r.Header.Get("Access-Control-Request-Method"); reqMethod != "" {
				logger.Debug("Preflight requested method", zap.String("method", reqMethod))
			}

			w.Header().Set("Access-Control-Max-Age", "86400") // 24 hours
			w.Header().Set("Content-Type", "text/plain")
			w.Header().Set("Content-Length", "0")
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// For non-OPTIONS requests, set allowed headers
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept")

		// Call the next handler
		next(w, r)
	}
}
