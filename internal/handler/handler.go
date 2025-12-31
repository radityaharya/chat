package handler

import (
	"bytes"
	"io"
	"net/http"
	"strings"

	"llm-router/internal/identity"
	"llm-router/internal/model"
	"llm-router/internal/proxy"
	"llm-router/internal/utils"

	"go.uber.org/zap"
)

const (
	chatCompletionsPath   = "/chat/completions"
	chatCompletionsV1Path = "/v1/chat/completions"
	validatePath          = "/v1/validate"
	modelsPath            = "/v1/models"
	settingsPath          = "/v1/settings"
	authLoginPath         = "/v1/auth/login"
	authLogoutPath        = "/v1/auth/logout"
	authCheckPath         = "/v1/auth/check"
	authSetupPath         = "/v1/auth/setup"
	authAPIKeysPath       = "/v1/auth/api-keys"
	historyPath           = "/v1/user/me/history"
	configPath            = "/v1/user/me/config"
	contentTypeJSON       = "application/json"
	streamTruePattern     = `"stream":true`
	peekBufferSize        = 1024
)

var authManager *identity.AuthManager

// SetAuthManager sets the global auth manager instance
func SetAuthManager(am *identity.AuthManager) {
	authManager = am
}

func HandleRequest(cfg *model.Config, w http.ResponseWriter, r *http.Request) {
	recorder := utils.NewResponseRecorder(w)
	CORSMiddleware(func(w http.ResponseWriter, r *http.Request) {
		handleRequestInternal(cfg, w, r)
	}, cfg.Logger)(recorder, r)
}

func checkStreamingRequest(r *http.Request) (bool, error) {
	if (r.URL.Path != chatCompletionsPath && r.URL.Path != chatCompletionsV1Path) || r.Method != "POST" {
		return false, nil
	}

	contentType := r.Header.Get("Content-Type")
	if !strings.Contains(contentType, contentTypeJSON) {
		return false, nil
	}

	peeked := make([]byte, peekBufferSize)
	n, _ := r.Body.Read(peeked)
	if n > 0 {
		peeked = peeked[:n]
		isStreaming := strings.Contains(string(peeked), streamTruePattern)
		combinedReader := io.MultiReader(bytes.NewReader(peeked), r.Body)
		r.Body = io.NopCloser(combinedReader)

		if r.ContentLength > 0 {
			r.ContentLength = int64(n) + r.ContentLength
		}
		return isStreaming, nil
	}
	return false, nil
}

func prepareRequestBody(r *http.Request, isStreaming bool, logger *zap.Logger) string {
	if r.Body == nil {
		return ""
	}

	var reqBody string
	if isStreaming {
		r.Body, reqBody = utils.DrainAndCapture(r.Body, isStreaming)
	} else {
		r.Body, reqBody = utils.DrainBody(r.Body)
	}

	if r.ContentLength > 0 && !isStreaming {
		bodyBytes := []byte(reqBody)
		r.ContentLength = int64(len(bodyBytes))
	}

	logger.Debug("Incoming request",
		zap.String("path", r.URL.Path),
		zap.String("method", r.Method),
		zap.Bool("streaming", isStreaming))

	return reqBody
}

func isPublicEndpoint(path, method string) bool {
	return (path == validatePath && method == "GET") ||
		(path == modelsPath && method == "GET") ||
		(path == authSetupPath && method == "GET") ||
		(path == authSetupPath && method == "POST") ||
		(path == authLoginPath && method == "POST")
}

func handlePublicEndpoints(w http.ResponseWriter, r *http.Request, cfg *model.Config) bool {
	if r.URL.Path == validatePath && r.Method == "GET" {
		HandleValidateAPIKey(w, r, cfg)
		logResponse(cfg.Logger, w)
		return true
	}

	if r.URL.Path == modelsPath && r.Method == "GET" {
		HandleModels(w, r, cfg)
		logResponse(cfg.Logger, w)
		return true
	}

	// Identity endpoints (when authManager is available)
	if authManager != nil {
		if r.URL.Path == authSetupPath && r.Method == "GET" {
			authManager.CheckInitialSetup(w, r)
			logResponse(cfg.Logger, w)
			return true
		}

		if r.URL.Path == authSetupPath && r.Method == "POST" {
			authManager.InitialSetup(w, r)
			logResponse(cfg.Logger, w)
			return true
		}

		if r.URL.Path == authLoginPath && r.Method == "POST" {
			authManager.Login(w, r)
			logResponse(cfg.Logger, w)
			return true
		}
	}

	return false
}

func authenticateRequest(r *http.Request, cfg *model.Config) bool {
	// If identity system is enabled, use it for authentication
	if authManager != nil {
		session, _ := authManager.GetSession(r)
		return session != nil
	}

	// Fall back to legacy API key authentication
	authHeader := r.Header.Get("Authorization")
	expectedAuthHeader := "Bearer " + cfg.LLMRouterAPIKey
	return authHeader == expectedAuthHeader
}

func handleProtectedEndpoints(w http.ResponseWriter, r *http.Request, cfg *model.Config) bool {
	if (r.URL.Path == chatCompletionsPath || r.URL.Path == chatCompletionsV1Path) && r.Method == "POST" {
		HandleChatCompletions(w, r, cfg)
		logResponse(cfg.Logger, w)
		return true
	}

	if r.URL.Path == settingsPath && r.Method == "GET" {
		HandleGetSettings(w, r, cfg)
		logResponse(cfg.Logger, w)
		return true
	}

	if r.URL.Path == settingsPath && r.Method == "PUT" {
		HandlePutSettings(w, r, cfg, cfg.ConfigFilePath)
		logResponse(cfg.Logger, w)
		return true
	}

	// Identity management endpoints (when authManager is available)
	if authManager != nil {
		if r.URL.Path == authLogoutPath && r.Method == "POST" {
			authManager.Logout(w, r)
			logResponse(cfg.Logger, w)
			return true
		}

		if r.URL.Path == authCheckPath && r.Method == "GET" {
			authManager.CheckAuth(w, r)
			logResponse(cfg.Logger, w)
			return true
		}

		if r.URL.Path == authAPIKeysPath && r.Method == "POST" {
			authManager.CreateAPIKey(w, r)
			logResponse(cfg.Logger, w)
			return true
		}

		if r.URL.Path == authAPIKeysPath && r.Method == "GET" {
			authManager.GetAPIKeys(w, r)
			logResponse(cfg.Logger, w)
			return true
		}

		if r.URL.Path == authAPIKeysPath && r.Method == "DELETE" {
			authManager.DeleteAPIKey(w, r)
			logResponse(cfg.Logger, w)
			return true
		}

		// History endpoints
		if r.URL.Path == historyPath && r.Method == "GET" {
			authManager.GetHistory(w, r)
			logResponse(cfg.Logger, w)
			return true
		}

		if r.URL.Path == historyPath && (r.Method == "PUT" || r.Method == "POST") {
			authManager.SyncHistory(w, r)
			logResponse(cfg.Logger, w)
			return true
		}

		if r.URL.Path == historyPath && r.Method == "DELETE" {
			authManager.DeleteHistoryItem(w, r)
			logResponse(cfg.Logger, w)
			return true
		}

		// Config endpoints
		if r.URL.Path == configPath && r.Method == "GET" {
			authManager.GetConfig(w, r)
			logResponse(cfg.Logger, w)
			return true
		}

		if r.URL.Path == configPath && (r.Method == "PUT" || r.Method == "POST") {
			authManager.UpdateConfig(w, r)
			logResponse(cfg.Logger, w)
			return true
		}
	}

	return false
}

func handleRequestInternal(cfg *model.Config, w http.ResponseWriter, r *http.Request) {
	isStreaming, _ := checkStreamingRequest(r)
	reqBody := prepareRequestBody(r, isStreaming, cfg.Logger)

	if reqBody != "" {
		utils.LogRequestResponse(cfg.Logger, r, nil, reqBody, "")
	}

	if handlePublicEndpoints(w, r, cfg) {
		return
	}

	if !authenticateRequest(r, cfg) {
		if authManager != nil {
			// Identity system is enabled but authentication failed
			cfg.Logger.Warn("Authentication failed - no valid session or API key")
		} else {
			// Legacy authentication failed
			authHeader := r.Header.Get("Authorization")
			expectedAuthHeader := "Bearer " + cfg.LLMRouterAPIKey
			cfg.Logger.Warn("Invalid or missing API key",
				zap.String("receivedAuthHeader", utils.RedactAuthorization(authHeader)),
				zap.String("expectedAuthHeader", utils.RedactAuthorization(expectedAuthHeader)))
		}
		http.Error(w, "Invalid or missing API key", http.StatusUnauthorized)
		logResponse(cfg.Logger, w)
		return
	}

	if authManager != nil {
		cfg.Logger.Debug("Authenticated via identity system")
	} else {
		cfg.Logger.Info("API key validated successfully",
			zap.String("Authorization", utils.RedactAuthorization(r.Header.Get("Authorization"))))
	}

	if handleProtectedEndpoints(w, r, cfg) {
		return
	}

	routeRequestThroughProxy(r, w, cfg.Logger)
	logResponse(cfg.Logger, w)
}

func logResponse(logger *zap.Logger, w http.ResponseWriter) {
	if recorder, ok := w.(*utils.ResponseRecorder); ok {
		logger.Debug("Response details",
			zap.Int("status", recorder.StatusCode),
			zap.Any("headers", recorder.Header()),
			zap.String("body", recorder.GetBody()))
	}
}

func routeRequestThroughProxy(r *http.Request, w http.ResponseWriter, logger *zap.Logger) {
	if proxy.DefaultProxy != nil {
		logger.Info("Routing request",
			zap.String("path", r.URL.Path),
			zap.String("method", r.Method))
		proxy.DefaultProxy.ServeHTTP(w, r)
	} else {
		logger.Info("No suitable backend configured for request",
			zap.String("path", r.URL.Path))
		http.Error(w, "No suitable backend configured", http.StatusBadGateway)
	}
}
