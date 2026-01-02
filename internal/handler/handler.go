package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"

	"llm-router/internal/identity"
	"llm-router/internal/model"
	"llm-router/internal/proxy"
	"llm-router/internal/tools/containers"
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
	historyManifestPath   = "/v1/user/me/history/manifest"
	historyDeltaPath      = "/v1/user/me/history/delta"
	configPath            = "/v1/user/me/config"
	attachmentsPath       = "/v1/attachments/"
	exaToolPath           = "/v1/tools/exa"
	geoToolPath           = "/v1/tools/geo"
	containerToolPath     = "/v1/tools/container"
	contentTypeJSON       = "application/json"
	streamTruePattern     = `"stream":true`
	peekBufferSize        = 1024
)

var authManager *identity.AuthManager
var attachmentStore identity.AttachmentStore

// SetAuthManager sets the global auth manager instance
func SetAuthManager(am *identity.AuthManager) {
	authManager = am
}

// SetAttachmentStore sets the global attachment store instance
func SetAttachmentStore(store identity.AttachmentStore) {
	attachmentStore = store
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

	// Attachment serving endpoint (public)
	if strings.HasPrefix(r.URL.Path, attachmentsPath) && r.Method == "GET" {
		HandleAttachment(w, r, cfg)
		logResponse(cfg.Logger, w)
		return true
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

		// History manifest endpoint (lightweight sync)
		if r.URL.Path == historyManifestPath && r.Method == "GET" {
			authManager.GetHistoryManifest(w, r)
			logResponse(cfg.Logger, w)
			return true
		}

		// History delta sync endpoint
		if r.URL.Path == historyDeltaPath && r.Method == "POST" {
			authManager.DeltaSyncHistory(w, r)
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

	// Attachment upload endpoint (protected)
	if r.URL.Path == "/v1/attachments/upload" && r.Method == "POST" {
		HandleAttachmentUpload(w, r, cfg)
		logResponse(cfg.Logger, w)
		return true
	}

	// Exa tool endpoint (protected)
	if r.URL.Path == exaToolPath && r.Method == "POST" {
		HandleExaTool(w, r, cfg)
		logResponse(cfg.Logger, w)
		return true
	}

	// Geo tool endpoint (protected)
	if r.URL.Path == geoToolPath && r.Method == "POST" {
		HandleGeoTool(w, r, cfg)
		logResponse(cfg.Logger, w)
		return true
	}

	// Container tool endpoint (protected)
	if r.URL.Path == containerToolPath && r.Method == "POST" {
		HandleContainerTool(w, r, cfg)
		logResponse(cfg.Logger, w)
		return true
	}

	// Workspace endpoints (protected)
	// /v1/workspaces/{conversationId}/files OR /v1/workspaces/{conversationId}/files/{filename}
	if strings.HasPrefix(r.URL.Path, "/v1/workspaces/") && strings.Contains(r.URL.Path, "/files") {
		// Method check handled inside HandleWorkspaceFiles or here
		if r.Method == "GET" || r.Method == "POST" {
			HandleWorkspaceFiles(w, r, cfg)
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

// HandleContainerTool handles requests to the container tool
func HandleContainerTool(w http.ResponseWriter, r *http.Request, cfg *model.Config) {
	// 1. Authenticate and get User ID
	session, _ := authManager.GetSession(r)
	if session == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// 2. Parse Request
	var req struct {
		Action          string `json:"action"`
		ContainerAction string `json:"container_action,omitempty"`
		Command         string `json:"command,omitempty"`
		Path            string `json:"path,omitempty"`
		Content         string `json:"content,omitempty"`
		Name            string `json:"name,omitempty"` // Optional override check? No, we force isolation
		WorkDir         string `json:"work_dir,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// 3. Enforce Isolation
	// Container name is fixed based on User ID
	containerName := fmt.Sprintf("llm-sandbox-%d", session.UserID)

	// 4. Initialize Client
	cli, err := containers.NewClient("", cfg.Logger) // Use default host (socket or env)
	if err != nil {
		cfg.Logger.Error("failed to create docker client", zap.Error(err))
		http.Error(w, "failed to initialize container backend", http.StatusInternalServerError)
		return
	}
	defer cli.Close()

	// 5. Execute Action
	ctx := r.Context()
	response := make(map[string]interface{})

	switch req.Action {
	case "manage_container":
		info, err := cli.Manage(ctx, req.ContainerAction, containerName)
		if err != nil {
			response["error"] = err.Error()
			response["success"] = false
		} else {
			response["success"] = true
			response["data"] = info
		}

	case "run_command":
		if req.Command == "" {
			response["error"] = "command is required"
			response["success"] = false
		} else {
			// Split command string into args? Or assume user provided full shell command?
			// Use sh -c to allow complex commands
			cmd := []string{"/bin/sh", "-c", req.Command}
			output, exitCode, err := cli.Execute(ctx, containerName, cmd, req.WorkDir)
			if err != nil {
				response["error"] = err.Error()
				response["success"] = false
			} else {
				response["success"] = true
				response["output"] = output
				response["exit_code"] = exitCode
			}
		}

	case "write_file":
		if req.Path == "" || req.Content == "" {
			response["error"] = "path and content are required"
			response["success"] = false
		} else {
			err := cli.WriteFile(ctx, containerName, req.Path, []byte(req.Content))
			if err != nil {
				response["error"] = err.Error()
				response["success"] = false
			} else {
				response["success"] = true
				response["message"] = "file written successfully"
			}
		}

	case "read_file":
		if req.Path == "" {
			response["error"] = "path is required"
			response["success"] = false
		} else {
			content, err := cli.ReadFile(ctx, containerName, req.Path)
			if err != nil {
				response["error"] = err.Error()
				response["success"] = false
			} else {
				response["success"] = true
				response["content"] = string(content)
			}
		}

	default:
		response["error"] = "unknown action"
		response["success"] = false
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func getWorkspacePath(conversationID string) string {
	// sanitize conversationID to prevent directory traversal
	// uuid usually safe, but good to be sure it doesn't contain .. or /
	safeID := strings.ReplaceAll(conversationID, "/", "")
	safeID = strings.ReplaceAll(safeID, "..", "")
	return fmt.Sprintf("/root/workspaces/%s", safeID)
}

// HandleWorkspaceFiles handles file uploads to a workspace
func HandleWorkspaceFiles(w http.ResponseWriter, r *http.Request, cfg *model.Config) {
	// 1. Authenticate
	session, _ := authManager.GetSession(r)
	if session == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Extract conversation ID from URL path
	// URL: /v1/workspaces/{conversationId}/files
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 5 {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}
	conversationID := parts[3]
	if conversationID == "" {
		http.Error(w, "conversation id required", http.StatusBadRequest)
		return
	}

	containerName := fmt.Sprintf("llm-sandbox-%d", session.UserID)
	cli, err := containers.NewClient("", cfg.Logger)
	if err != nil {
		cfg.Logger.Error("failed to create docker client", zap.Error(err))
		http.Error(w, "backend error", http.StatusInternalServerError)
		return
	}
	defer cli.Close()

	ctx := r.Context()
	workspacePath := getWorkspacePath(conversationID)

	// Ensure workspace exists
	if err := cli.EnsureDirectory(ctx, containerName, workspacePath); err != nil {
		cfg.Logger.Error("failed to ensure workspace directory", zap.Error(err))
		http.Error(w, "failed to setup workspace", http.StatusInternalServerError)
		return
	}

	// Check if this is a file read request (path has more than 5 parts)
	// /v1/workspaces/cid/files/filename
	if len(parts) > 5 {
		filename := strings.Join(parts[5:], "/")
		if strings.Contains(filename, "..") {
			http.Error(w, "invalid filename", http.StatusBadRequest)
			return
		}

		filePath := filepath.Join(workspacePath, filename)
		content, err := cli.ReadFile(ctx, containerName, filePath)
		if err != nil {
			// Log but don't error 500 if just not found?
			// checking err string might be fragile.
			http.Error(w, fmt.Sprintf("failed to read file: %v", err), http.StatusNotFound)
			return
		}

		// Detect content type
		ext := filepath.Ext(filename)
		contentType := "text/plain"
		switch ext {
		case ".html", ".htm":
			contentType = "text/html"
		case ".json":
			contentType = "application/json"
		case ".js":
			contentType = "application/javascript"
		case ".css":
			contentType = "text/css"
		case ".png":
			contentType = "image/png"
		case ".jpg", ".jpeg":
			contentType = "image/jpeg"
		case ".svg":
			contentType = "image/svg+xml"
		}

		w.Header().Set("Content-Type", contentType)
		w.Write(content)
		return
	}

	if r.Method == "GET" {
		// List files
		files, err := cli.ListFiles(ctx, containerName, workspacePath)
		if err != nil {
			cfg.Logger.Error("failed to list files", zap.Error(err))
			http.Error(w, "failed to list files", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"files":   files,
		})
		return
	}

	if r.Method == "POST" {
		// Upload file
		// limit to 10MB for now
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			http.Error(w, "failed to parse multipart form", http.StatusBadRequest)
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "file is required", http.StatusBadRequest)
			return
		}
		defer file.Close()

		// Read content
		content, err := io.ReadAll(file)
		if err != nil {
			http.Error(w, "failed to read file", http.StatusInternalServerError)
			return
		}

		targetPath := fmt.Sprintf("%s/%s", workspacePath, header.Filename)

		// Use existing WriteFile (takes byte slice)
		// For larger files, we might want to implement stream copying in containers package
		if err := cli.WriteFile(ctx, containerName, targetPath, content); err != nil {
			cfg.Logger.Error("failed to write file to container", zap.Error(err))
			http.Error(w, "failed to save file", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"path":    targetPath,
			"name":    header.Filename,
			"size":    len(content),
		})
		return
	}

	http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
}

// HandleReadWorkspaceFile reads a file from the workspace
func HandleReadWorkspaceFile(w http.ResponseWriter, r *http.Request, cfg *model.Config, client *containers.Client) {
	// Path: /v1/workspaces/{conversationId}/files/{filename}
	parts := strings.Split(r.URL.Path, "/")
	// /v1/workspaces/uid/files/filename -> 6 parts: "", v1, workspaces, uid, files, filename
	if len(parts) < 6 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	conversationId := parts[3]
	// filename might contain slashes if we support subdirs in future, but for now simple
	// Reconstruct filename from parts[5:] to allow slashes e.g. /files/dir/file.txt
	filename := strings.Join(parts[5:], "/")

	if strings.Contains(filename, "..") {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	workspacePath := getWorkspacePath(conversationId)

	// We need to resolve user id to construct container name llm-sandbox-{uid}
	// The middleware should have put user_id in context
	// But wait, getWorkspacePath relies on context? No, it takes conversationId.
	// We need container name.

	val := r.Context().Value("user_id")
	userId, ok := val.(string)
	if !ok {
		http.Error(w, "User ID not found in context", http.StatusUnauthorized)
		return
	}

	containerName := fmt.Sprintf("llm-sandbox-%s", userId)
	filePath := filepath.Join(workspacePath, filename)

	content, err := client.ReadFile(r.Context(), containerName, filePath)
	if err != nil {
		// Log error?
		http.Error(w, fmt.Sprintf("Failed to read file: %v", err), http.StatusNotFound)
		return
	}

	// Simple content type detection based on extension
	ext := filepath.Ext(filename)
	contentType := "text/plain"
	switch ext {
	case ".html", ".htm":
		contentType = "text/html"
	case ".json":
		contentType = "application/json"
	case ".js":
		contentType = "application/javascript"
	case ".css":
		contentType = "text/css"
	case ".png":
		contentType = "image/png"
	case ".jpg", ".jpeg":
		contentType = "image/jpeg"
	case ".svg":
		contentType = "image/svg+xml"
	}

	w.Header().Set("Content-Type", contentType)
	w.Write(content)
}
