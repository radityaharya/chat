package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"llm-router/internal/model"
	"llm-router/internal/proxy"

	"go.uber.org/zap"
)

// HandleChatCompletions processes the chat completions endpoint with model routing and transformations
func HandleChatCompletions(w http.ResponseWriter, r *http.Request, cfg *model.Config) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Error reading request body", http.StatusInternalServerError)
		return
	}

	var chatReq map[string]interface{}
	if err := json.Unmarshal(body, &chatReq); err != nil {
		http.Error(w, "Error unmarshalling request body", http.StatusInternalServerError)
		return
	}

	modelName, ok := chatReq["model"].(string)
	if !ok {
		http.Error(w, "Model key missing or not a string", http.StatusBadRequest)
		return
	}

	logger := cfg.Logger
	logger.Info("Incoming request for model", zap.String("model", modelName))

	// Check for model aliases
	if cfg.Aliases != nil {
		if aliasTarget, exists := cfg.Aliases[modelName]; exists {
			logger.Info("Applying model alias",
				zap.String("originalModel", modelName),
				zap.String("aliasTarget", aliasTarget))
			modelName = aliasTarget
			chatReq["model"] = modelName
		}
	}

	for prefix, proxyHandler := range proxy.Proxies {
		if strings.HasPrefix(modelName, prefix) {
			newModelName := strings.TrimPrefix(modelName, prefix)
			chatReq["model"] = newModelName

			// Apply role rewrites for the selected backend if available
			var selectedBackend model.BackendConfig
			for _, backend := range cfg.Backends {
				if strings.TrimSpace(backend.Prefix) == prefix {
					selectedBackend = backend
					break
				}
			}

			// Apply role rewrites if configured for this backend
			if selectedBackend.RoleRewrites != nil && len(selectedBackend.RoleRewrites) > 0 {
				// Check if there are messages to rewrite
				if messages, ok := chatReq["messages"].([]interface{}); ok {
					for i, msg := range messages {
						if msgMap, ok := msg.(map[string]interface{}); ok {
							if role, ok := msgMap["role"].(string); ok {
								// Check if this role needs to be rewritten
								if newRole, exists := selectedBackend.RoleRewrites[role]; exists {
									logger.Info("Rewriting message role",
										zap.String("originalRole", role),
										zap.String("newRole", newRole))
									msgMap["role"] = newRole
									messages[i] = msgMap
								}
							}
						}
					}
					chatReq["messages"] = messages
				}
			}

			// Remove unsupported parameters if configured for this backend
			if selectedBackend.UnsupportedParams != nil && len(selectedBackend.UnsupportedParams) > 0 {
				for _, param := range selectedBackend.UnsupportedParams {
					if _, exists := chatReq[param]; exists {
						logger.Info("Dropping unsupported parameter",
							zap.String("parameter", param))
						delete(chatReq, param)
					}
				}
			}

			modifiedBody, err := json.Marshal(chatReq)
			if err != nil {
				http.Error(w, "Error re-marshalling request body", http.StatusInternalServerError)
				return
			}
			r.Body = io.NopCloser(bytes.NewBuffer(modifiedBody))
			// Let Go calculate and handle Content-Length automatically
			r.ContentLength = int64(len(modifiedBody))
			// Don't set Content-Length header explicitly - let http.Client handle it

			logger.Info("Routing model to new model", zap.String("originalModel", modelName), zap.String("newModel", newModelName))

			proxyHandler.ServeHTTP(w, r)
			return
		}
	}

	// If no prefix matches, use the default proxy
	if proxy.DefaultProxy != nil {
		logger.Info("Routing request to default proxy", zap.String("model", modelName))

		r.Body = io.NopCloser(bytes.NewBuffer(body))
		// Let Go calculate and handle Content-Length automatically
		r.ContentLength = int64(len(body))
		// Don't set Content-Length header explicitly - let http.Client handle it

		proxy.DefaultProxy.ServeHTTP(w, r)
		return
	}

	logger.Warn("No suitable backend found", zap.String("model", modelName))
	http.Error(w, "No suitable backend found", http.StatusBadGateway)
}
