package handler

import (
	"encoding/json"
	"net/http"
	"os"

	"llm-router/internal/model"

	"go.uber.org/zap"
)

// HandleGetSettings returns the current configuration (excluding sensitive runtime data)
func HandleGetSettings(w http.ResponseWriter, r *http.Request, cfg *model.Config) {
	logger := cfg.Logger

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	logger.Info("Handling GET /v1/settings request")

	// Create a sanitized copy of the config for the response
	// We'll exclude the Logger and UseGeneratedKey fields
	response := struct {
		ListeningPort      int                   `json:"listening_port"`
		Backends           []model.BackendConfig `json:"backends"`
		LLMRouterAPIKeyEnv string                `json:"llmrouter_api_key_env,omitempty"`
		Aliases            map[string]string     `json:"aliases,omitempty"`
	}{
		ListeningPort:      cfg.ListeningPort,
		Backends:           cfg.Backends,
		LLMRouterAPIKeyEnv: cfg.LLMRouterAPIKeyEnv,
		Aliases:            cfg.Aliases,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		logger.Error("Failed to encode settings response", zap.Error(err))
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}

	logger.Info("Successfully returned settings")
}

// HandlePutSettings updates the configuration and writes it to config.json
func HandlePutSettings(w http.ResponseWriter, r *http.Request, cfg *model.Config, configFilePath string) {
	logger := cfg.Logger

	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	logger.Info("Handling PUT /v1/settings request")

	// Parse the incoming configuration
	var newConfig struct {
		ListeningPort      int                   `json:"listening_port"`
		Backends           []model.BackendConfig `json:"backends"`
		LLMRouterAPIKeyEnv string                `json:"llmrouter_api_key_env,omitempty"`
		LLMRouterAPIKey    string                `json:"llmrouter_api_key,omitempty"`
		Aliases            map[string]string     `json:"aliases,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&newConfig); err != nil {
		logger.Error("Failed to decode settings request", zap.Error(err))
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Validate the configuration
	if newConfig.ListeningPort <= 0 || newConfig.ListeningPort > 65535 {
		http.Error(w, "Invalid listening port", http.StatusBadRequest)
		return
	}

	if len(newConfig.Backends) == 0 {
		http.Error(w, "At least one backend is required", http.StatusBadRequest)
		return
	}

	// Validate each backend
	for i, backend := range newConfig.Backends {
		if backend.Name == "" {
			logger.Error("Backend missing name", zap.Int("index", i))
			http.Error(w, "Backend name is required", http.StatusBadRequest)
			return
		}
		if backend.BaseURL == "" {
			logger.Error("Backend missing base_url", zap.String("backend", backend.Name))
			http.Error(w, "Backend base_url is required", http.StatusBadRequest)
			return
		}
		if backend.Prefix == "" {
			logger.Error("Backend missing prefix", zap.String("backend", backend.Name))
			http.Error(w, "Backend prefix is required", http.StatusBadRequest)
			return
		}
	}

	// Write the configuration to file
	configData, err := json.MarshalIndent(newConfig, "", "  ")
	if err != nil {
		logger.Error("Failed to marshal config", zap.Error(err))
		http.Error(w, "Failed to serialize configuration", http.StatusInternalServerError)
		return
	}

	if err := os.WriteFile(configFilePath, configData, 0644); err != nil {
		logger.Error("Failed to write config file", zap.String("path", configFilePath), zap.Error(err))
		http.Error(w, "Failed to write configuration file", http.StatusInternalServerError)
		return
	}

	logger.Info("Configuration saved successfully", zap.String("path", configFilePath))

	// Return success response
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Configuration saved successfully. Please restart the server for changes to take effect.",
	})
}
