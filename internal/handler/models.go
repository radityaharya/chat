package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"llm-router/internal/model"
	"llm-router/internal/proxy"

	"go.uber.org/zap"
)

const (
	defaultClientTimeout = 10 * time.Second
	modelsEndpointSuffix = "/models"
	bearerPrefix         = "Bearer "
	headerContentType    = "Content-Type"
	contentTypeAppJSON   = "application/json"
	headerAuthorization  = "Authorization"
	methodGet            = "GET"
	modelTypeChat        = "chat"
	responseObjectList   = "list"
)

func getBackendAPIKey(backend model.BackendConfig, logger *zap.Logger) string {
	if !backend.RequireAPIKey {
		return ""
	}

	if cm, exists := proxy.CredentialManagers[backend.Name]; exists {
		if key, err := cm.GetNextKey(""); err == nil {
			logger.Debug("Using API key from credential manager for models request",
				zap.String("backend", backend.Name))
			return key
		}
		logger.Error("Failed to get API key from credential manager",
			zap.String("backend", backend.Name))
	} else if backend.KeyEnvVar != "" {
		return os.Getenv(backend.KeyEnvVar)
	}

	return ""
}

func createBackendRequest(backend model.BackendConfig, logger *zap.Logger) (*http.Request, error) {
	modelsURL := strings.TrimSuffix(backend.BaseURL, "/") + modelsEndpointSuffix
	req, err := http.NewRequest(methodGet, modelsURL, nil)
	if err != nil {
		return nil, err
	}

	if apiKey := getBackendAPIKey(backend, logger); apiKey != "" {
		req.Header.Set(headerAuthorization, bearerPrefix+apiKey)
		logger.Debug("Set Authorization header for models request",
			zap.String("backend", backend.Name))
	} else if backend.RequireAPIKey {
		logger.Warn("No API key available for backend",
			zap.String("backend", backend.Name))
	}

	return req, nil
}

func parseBackendResponse(body []byte, logger *zap.Logger) ([]model.Model, error) {
	var backendModels model.ModelsResponse
	if err := json.Unmarshal(body, &backendModels); err == nil && backendModels.Data != nil {
		return backendModels.Data, nil
	} else if err != nil {
		logger.Warn("Failed to unmarshal models response (list format)", zap.Error(err))
	}

	var models []model.Model
	if err := json.Unmarshal(body, &models); err != nil {
		logger.Warn("Failed to unmarshal models response (array format)", zap.Error(err))
		return nil, err
	}
	return models, nil
}

func fetchBackendModels(backend model.BackendConfig, logger *zap.Logger) ([]model.Model, error) {
	req, err := createBackendRequest(backend, logger)
	if err != nil {
		return nil, err
	}

	client := &http.Client{Timeout: defaultClientTimeout}
	resp, err := client.Do(req)
	if err != nil {
		logger.Warn("Failed to execute request to backend",
			zap.String("backend", backend.Name),
			zap.Error(err))
		return nil, err
	}
	defer resp.Body.Close()
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		logger.Warn("Backend returned non-OK status for models",
			zap.String("backend", backend.Name),
			zap.Int("statusCode", resp.StatusCode))
		return nil, nil
	}

	return parseBackendResponse(bodyBytes, logger)
}

func processModel(m model.Model, backend model.BackendConfig) model.Model {
	displayName := m.DisplayName
	if displayName == "" {
		displayName = m.Name
	}

	return model.Model{
		ID:            backend.Prefix + m.ID,
		Object:        m.Object,
		Created:       m.Created,
		OwnedBy:       backend.Name,
		Type:          m.Type,
		DisplayName:   displayName,
		CanonicalSlug: m.CanonicalSlug,
		Description:   m.Description,
		Organization:  m.Organization,
		Link:          m.Link,
		License:       m.License,
		ContextLength: m.ContextLength,
		Running:       m.Running,
		Pricing:       m.Pricing,
		Config:        m.Config,
		// Forward OpenRouter-specific fields
		Architecture:        m.Architecture,
		TopProvider:         m.TopProvider,
		SupportedParameters: m.SupportedParameters,
	}
}

func HandleModels(w http.ResponseWriter, r *http.Request, cfg *model.Config) {
	logger := cfg.Logger
	logger.Info("Handling /v1/models request")

	allModels := make([]model.Model, 0)
	seenModels := make(map[string]bool)

	for _, backend := range cfg.Backends {
		logger.Info("Fetching models from backend", zap.String("backend", backend.Name))

		models, err := fetchBackendModels(backend, logger)
		if err != nil {
			logger.Warn("Failed to fetch/parse models from backend",
				zap.String("backend", backend.Name),
				zap.Error(err))
			continue
		}

		logger.Info("Successfully fetched models from backend",
			zap.String("backend", backend.Name),
			zap.Int("modelCount", len(models)))

		for _, m := range models {
			// Filter out non-chat models
			loweredID := strings.ToLower(m.ID)
			loweredName := strings.ToLower(m.DisplayName)

			// If Type is explicitly set, use it. Otherwise, infer from ID/Name.
			if m.Type != "" {
				if m.Type != modelTypeChat {
					continue
				}
			} else {
				// Fallback filtering for providers that don't specify type
				nonChatKeywords := []string{"embedding", "audio", "video", "moderation", "imagegen"}
				isNonChat := false
				for _, kw := range nonChatKeywords {
					if strings.Contains(loweredID, kw) || strings.Contains(loweredName, kw) {
						isNonChat = true
						break
					}
				}
				if isNonChat {
					continue
				}
			}

			prefixedID := backend.Prefix + m.ID
			if seenModels[prefixedID] {
				continue
			}
			seenModels[prefixedID] = true

			processedModel := processModel(m, backend)
			allModels = append(allModels, processedModel)
			logger.Debug("Added model",
				zap.String("backend", backend.Name),
				zap.String("modelID", prefixedID))
		}
	}

	w.Header().Set(headerContentType, contentTypeAppJSON)
	response := model.ModelsResponse{
		Object: responseObjectList,
		Data:   allModels,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		logger.Error("Failed to encode models response", zap.Error(err))
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}

	logger.Info("Successfully returned aggregated models",
		zap.Int("totalModels", len(allModels)))
}
