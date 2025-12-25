package handler

import (
	"encoding/json"
	"net/http"

	"llm-router/internal/model"
	"llm-router/internal/utils"

	"go.uber.org/zap"
)

// ValidateResponse represents the API key validation response
type ValidateResponse struct {
	Valid bool `json:"valid"`
}

// HandleValidateAPIKey validates the API key from the Authorization header
func HandleValidateAPIKey(w http.ResponseWriter, r *http.Request, cfg *model.Config) {
	logger := cfg.Logger
	logger.Info("Handling /v1/validate request")

	// Get the Authorization header
	authHeader := r.Header.Get("Authorization")
	expectedAuthHeader := "Bearer " + cfg.LLMRouterAPIKey

	// Validate the API key
	isValid := authHeader == expectedAuthHeader

	if !isValid {
		logger.Warn("Invalid API key in validation request",
			zap.String("receivedAuthHeader", utils.RedactAuthorization(authHeader)))
	} else {
		logger.Info("Valid API key in validation request")
	}

	// Return validation result
	response := ValidateResponse{
		Valid: isValid,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		logger.Error("Failed to encode validation response", zap.Error(err))
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}

	logger.Info("Successfully returned validation result", zap.Bool("valid", isValid))
}
