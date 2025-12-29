package proxy

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"time"

	"llm-router/internal/model"
	"llm-router/internal/utils"

	"go.uber.org/zap"
)

const (
	defaultTimeout          = 30 * time.Second
	tlsHandshakeTimeout     = 10 * time.Second
	expectContinueTimeout   = 5 * time.Second
	maxIdleConns            = 100
	maxConnsPerHost         = 20
	maxIdleConnsPerHost     = 10
	credentialTimeout       = 60 * time.Second
	maxRetryAttempts        = 5
	chatCompletionsPath     = "/chat/completions"
	streamTruePattern       = `"stream":true`
	eventStreamContentType  = "text/event-stream"
	chunkedTransferEncoding = "chunked"
)

var (
	Proxies            map[string]*httputil.ReverseProxy
	DefaultProxy       *httputil.ReverseProxy
	CredentialManagers map[string]*CredentialManager
	BackendConfigs     map[string]model.BackendConfig
	retryableStatuses  = map[int]bool{
		http.StatusTooManyRequests:     true,
		http.StatusInternalServerError: true,
		http.StatusBadGateway:          true,
		http.StatusServiceUnavailable:  true,
		http.StatusGatewayTimeout:      true,
	}
)

func resolveAPIKeys(backend model.BackendConfig, logger *zap.Logger) []string {
	resolvedKeys := make([]string, 0, len(backend.APIKeys))
	for _, keyOrEnv := range backend.APIKeys {
		if strings.HasPrefix(keyOrEnv, "$") {
			envVar := keyOrEnv[1:]
			if envValue := os.Getenv(envVar); envValue != "" {
				resolvedKeys = append(resolvedKeys, envValue)
				logger.Debug("Resolved API key from environment",
					zap.String("backend", backend.Name),
					zap.String("envVar", envVar))
			} else {
				logger.Warn("Environment variable not set for API key",
					zap.String("backend", backend.Name),
					zap.String("envVar", envVar))
			}
		} else {
			resolvedKeys = append(resolvedKeys, keyOrEnv)
		}
	}
	return resolvedKeys
}

func initCredentialManager(backend model.BackendConfig, logger *zap.Logger) {
	if len(backend.APIKeys) == 0 {
		return
	}

	resolvedKeys := resolveAPIKeys(backend, logger)
	if len(resolvedKeys) == 0 {
		return
	}

	cm, err := NewCredentialManager(resolvedKeys, credentialTimeout)
	if err != nil {
		logger.Error("Failed to create credential manager",
			zap.String("backend", backend.Name),
			zap.Error(err))
		return
	}

	CredentialManagers[backend.Name] = cm
	logger.Info("Initialized credential manager for backend",
		zap.String("backend", backend.Name),
		zap.Int("keyCount", cm.GetKeyCount()))
}

func createTransport() *http.Transport {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = defaultTimeout
	transport.TLSHandshakeTimeout = tlsHandshakeTimeout
	transport.ExpectContinueTimeout = expectContinueTimeout
	transport.MaxIdleConns = maxIdleConns
	transport.MaxConnsPerHost = maxConnsPerHost
	transport.MaxIdleConnsPerHost = maxIdleConnsPerHost
	return transport
}

func InitializeProxies(backends []model.BackendConfig, logger *zap.Logger) {
	Proxies = make(map[string]*httputil.ReverseProxy)
	CredentialManagers = make(map[string]*CredentialManager)
	BackendConfigs = make(map[string]model.BackendConfig)

	for _, backend := range backends {
		BackendConfigs[backend.Name] = backend
		initCredentialManager(backend, logger)

		urlParsed, err := url.Parse(backend.BaseURL)
		if err != nil {
			logger.Fatal("Error parsing URL for backend", zap.String("backend", backend.Name), zap.Error(err))
		}

		proxy := httputil.NewSingleHostReverseProxy(urlParsed)
		proxy.Director = makeDirector(urlParsed, backend, logger)
		proxy.ErrorHandler = func(rw http.ResponseWriter, req *http.Request, err error) {
			logger.Error("Proxy error",
				zap.String("backend", backend.Name),
				zap.String("url", req.URL.String()),
				zap.Error(err))
			http.Error(rw, fmt.Sprintf("Error communicating with backend service: %v", err), http.StatusBadGateway)
		}

		proxy.Transport = &debugTransport{
			transport:   createTransport(),
			logger:      logger,
			backend:     backend.Name,
			backendConf: backend,
		}

		Proxies[strings.TrimSpace(backend.Prefix)] = proxy

		if backend.Default {
			DefaultProxy = proxy
			logger.Debug("Default proxy set", zap.String("backend", backend.Name))
		}
	}
}

type debugTransport struct {
	transport   http.RoundTripper
	logger      *zap.Logger
	backend     string
	backendConf model.BackendConfig
}

func formatRequestBody(bodyBytes []byte) string {
	var prettyJSON bytes.Buffer
	if err := json.Indent(&prettyJSON, bodyBytes, "", "  "); err == nil {
		return prettyJSON.String()
	}
	return string(bodyBytes)
}

func prepareRequestBody(req *http.Request) ([]byte, string) {
	if req.Body == nil {
		return nil, ""
	}

	bodyBytes, _ := io.ReadAll(req.Body)
	req.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

	if len(bodyBytes) > 0 {
		req.ContentLength = int64(len(bodyBytes))
	} else {
		req.ContentLength = 0
	}

	return bodyBytes, formatRequestBody(bodyBytes)
}

func (t *debugTransport) logOutgoingHeaders(req *http.Request) {
	for name, values := range req.Header {
		value := strings.Join(values, ", ")
		if strings.ToLower(name) == "authorization" {
			value = utils.RedactAuthorization(values[0])
		}
		t.logger.Debug("Outgoing header",
			zap.String("name", name),
			zap.String("value", value))
	}
}

func isStreamingResponse(resp *http.Response, reqPath, reqBody string) bool {
	if resp == nil {
		return false
	}
	contentType := resp.Header.Get("Content-Type")
	transferEncoding := resp.Header.Get("Transfer-Encoding")
	return strings.Contains(contentType, eventStreamContentType) ||
		transferEncoding == chunkedTransferEncoding ||
		(reqPath == chatCompletionsPath && strings.Contains(reqBody, streamTruePattern))
}

func shouldRetryWithoutTools(resp *http.Response, respBody string) bool {
	if resp == nil {
		return false
	}
	
	// Check for OpenRouter-style tool error (404 with specific message)
	if resp.StatusCode == http.StatusNotFound {
		if strings.Contains(respBody, "No endpoints found that support tool use") ||
			strings.Contains(respBody, "tool use") ||
			strings.Contains(respBody, "tools") {
			return true
		}
	}
	
	// Check for other common tool-related errors
	if resp.StatusCode == http.StatusBadRequest {
		if strings.Contains(respBody, "tool") ||
			strings.Contains(respBody, "function calling not supported") {
			return true
		}
	}
	
	return false
}

func removeToolsAndUpdatePrompt(bodyBytes []byte, logger *zap.Logger) ([]byte, error) {
	var chatReq map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &chatReq); err != nil {
		return nil, fmt.Errorf("failed to unmarshal request: %w", err)
	}
	
	// Check if tools parameter exists
	if _, hasTools := chatReq["tools"]; !hasTools {
		// No tools to remove, return original
		return bodyBytes, nil
	}
	
	// Remove tools parameter
	delete(chatReq, "tools")
	delete(chatReq, "tool_choice")
	logger.Info("Removed tools and tool_choice parameters from request")
	
	// Inject message into system prompt
	messages, ok := chatReq["messages"].([]interface{})
	if !ok {
		// If messages is not in expected format, just remove tools and continue
		return json.Marshal(chatReq)
	}
	
	toolNotSupportedMsg := "Note: This model does not support tool/function calling. Please answer the user's question directly without attempting to use any tools or functions."
	
	// Look for existing system message and append to it
	foundSystem := false
	for i, msg := range messages {
		if msgMap, ok := msg.(map[string]interface{}); ok {
			if role, ok := msgMap["role"].(string); ok && role == "system" {
				if content, ok := msgMap["content"].(string); ok {
					msgMap["content"] = content + "\n\n" + toolNotSupportedMsg
					messages[i] = msgMap
					foundSystem = true
					logger.Info("Appended tool-not-supported message to existing system message")
					break
				}
			}
		}
	}
	
	// If no system message found, prepend one
	if !foundSystem {
		systemMsg := map[string]interface{}{
			"role":    "system",
			"content": toolNotSupportedMsg,
		}
		messages = append([]interface{}{systemMsg}, messages...)
		logger.Info("Prepended new system message about tool support")
	}
	
	chatReq["messages"] = messages
	
	return json.Marshal(chatReq)
}

func (t *debugTransport) logStreamingResponse(resp *http.Response, respBodyStr string) {
	t.logger.Debug("Streaming response detected",
		zap.Int("status", resp.StatusCode),
		zap.String("contentType", resp.Header.Get("Content-Type")),
		zap.String("transferEncoding", resp.Header.Get("Transfer-Encoding")))

	for name, values := range resp.Header {
		t.logger.Debug("Response header",
			zap.String("name", name),
			zap.String("value", strings.Join(values, ", ")))
	}

	if len(respBodyStr) > 0 {
		t.logger.Debug("Streaming response preview", zap.String("content", respBodyStr))
	}
}

func (t *debugTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	bodyBytes, reqBodyStr := prepareRequestBody(req)
	req.Header.Del("Accept-Encoding")

	t.logger.Debug("Outgoing request to backend",
		zap.String("backend", t.backend),
		zap.String("method", req.Method),
		zap.String("url", req.URL.String()),
		zap.Int64("content-length", req.ContentLength))

	t.logOutgoingHeaders(req)

	resp, err := t.executeWithRetry(req, bodyBytes)
	if err != nil {
		return nil, err
	}

	isStreaming := isStreamingResponse(resp, req.URL.Path, reqBodyStr)

	var respBodyStr string
	if resp.Body != nil {
		resp.Body, respBodyStr = utils.DrainAndCapture(resp.Body, isStreaming)
	}

	// Check if this is a tool-use error and retry without tools if needed
	if shouldRetryWithoutTools(resp, respBodyStr) {
		t.logger.Info("Detected tool-use error, retrying without tools",
			zap.String("backend", t.backend),
			zap.Int("statusCode", resp.StatusCode))
		
		// Close the error response
		closeResponseBody(resp)
		
		// Modify request to remove tools and update system prompt
		modifiedBodyBytes, err := removeToolsAndUpdatePrompt(bodyBytes, t.logger)
		if err != nil {
			t.logger.Error("Failed to modify request for tool-less retry",
				zap.String("backend", t.backend),
				zap.Error(err))
			// Return the original error response
			resp.Body = io.NopCloser(bytes.NewBuffer([]byte(respBodyStr)))
			return resp, nil
		}
		
		// Restore request body with modified content
		restoreRequestBody(req, modifiedBodyBytes)
		
		// Retry the request
		resp, err = t.transport.RoundTrip(req)
		if err != nil {
			return nil, err
		}
		
		// Capture the new response
		if resp.Body != nil {
			resp.Body, respBodyStr = utils.DrainAndCapture(resp.Body, isStreaming)
		}
	}

	if isStreaming {
		t.logStreamingResponse(resp, respBodyStr)
	} else {
		utils.LogRequestResponse(t.logger, req, resp, reqBodyStr, respBodyStr)
	}

	return resp, nil
}

func extractCurrentKey(req *http.Request) string {
	authHeader := req.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return strings.TrimPrefix(authHeader, "Bearer ")
	}
	return ""
}

func restoreRequestBody(req *http.Request, bodyBytes []byte) {
	if bodyBytes != nil && len(bodyBytes) > 0 {
		req.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
		req.ContentLength = int64(len(bodyBytes))
	}
}

func closeResponseBody(resp *http.Response) {
	if resp != nil && resp.Body != nil {
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}
}

func (t *debugTransport) handleRetryableResponse(resp *http.Response, currentKey string, cm *CredentialManager, maxAttempts, attempt int) (*http.Response, bool) {
	if !retryableStatuses[resp.StatusCode] {
		return resp, false
	}

	t.logger.Warn("Received retryable error status from backend",
		zap.String("backend", t.backend),
		zap.Int("statusCode", resp.StatusCode),
		zap.Int("attempt", attempt+1),
		zap.Int("maxAttempts", maxAttempts))

	if currentKey != "" {
		cm.MarkKeyFailed(currentKey)
		t.logger.Info("Marked API key as failed due to error response",
			zap.String("backend", t.backend),
			zap.Int("statusCode", resp.StatusCode),
			zap.String("key", utils.RedactAuthorization("Bearer "+currentKey)))
	}

	closeResponseBody(resp)
	return resp, true
}

func (t *debugTransport) handleTransportError(err error, currentKey string, cm *CredentialManager) {
	if currentKey != "" {
		cm.MarkKeyFailed(currentKey)
		t.logger.Warn("Marked API key as failed due to transport error",
			zap.String("backend", t.backend),
			zap.Error(err),
			zap.String("key", utils.RedactAuthorization("Bearer "+currentKey)))
	}
}

func (t *debugTransport) getNextKeyForRetry(cm *CredentialManager, req *http.Request, attempt int) bool {
	newKey, err := cm.GetNextKey()
	if err != nil {
		t.logger.Error("No more API keys available for retry",
			zap.String("backend", t.backend),
			zap.Error(err))
		return false
	}

	req.Header.Set("Authorization", "Bearer "+newKey)
	t.logger.Info("Retrying request with different API key",
		zap.String("backend", t.backend),
		zap.Int("attempt", attempt+2),
		zap.String("newKey", utils.RedactAuthorization("Bearer "+newKey)))
	return true
}

func (t *debugTransport) executeWithRetry(req *http.Request, bodyBytes []byte) (*http.Response, error) {
	cm, hasCredentialManager := CredentialManagers[t.backend]

	if !hasCredentialManager {
		return t.transport.RoundTrip(req)
	}

	maxAttempts := cm.GetKeyCount()
	if maxAttempts > maxRetryAttempts {
		maxAttempts = maxRetryAttempts
	}

	var lastErr error
	var lastResp *http.Response

	for attempt := 0; attempt < maxAttempts; attempt++ {
		restoreRequestBody(req, bodyBytes)
		currentKey := extractCurrentKey(req)

		resp, err := t.transport.RoundTrip(req)

		if err == nil && resp != nil {
			var shouldRetry bool
			lastResp, shouldRetry = t.handleRetryableResponse(resp, currentKey, cm, maxAttempts, attempt)
			if !shouldRetry {
				return resp, nil
			}
		} else {
			lastErr = err
			t.handleTransportError(err, currentKey, cm)
		}

		if attempt < maxAttempts-1 {
			if !t.getNextKeyForRetry(cm, req, attempt) {
				break
			}
		}
	}

	if lastResp != nil {
		t.logger.Error("All retry attempts failed, returning last response",
			zap.String("backend", t.backend),
			zap.Int("statusCode", lastResp.StatusCode))
		return lastResp, nil
	}

	if lastErr != nil {
		t.logger.Error("All retry attempts failed with transport errors",
			zap.String("backend", t.backend),
			zap.Error(lastErr))
		return nil, lastErr
	}

	return nil, fmt.Errorf("all retry attempts exhausted for backend %s", t.backend)
}

func extractClientIP(remoteAddr string) string {
	clientIP := remoteAddr
	if idx := strings.LastIndex(clientIP, ":"); idx != -1 {
		clientIP = clientIP[:idx]
	}
	return strings.Trim(clientIP, "[]")
}

func joinPaths(basePath, requestPath string) string {
	cleanBase := strings.TrimSuffix(basePath, "/")
	cleanReq := strings.TrimPrefix(requestPath, "/")

	// Handle duplicate /v1/ segments at the junction
	if strings.HasSuffix(cleanBase, "/v1") && strings.HasPrefix(cleanReq, "v1/") {
		cleanReq = strings.TrimPrefix(cleanReq, "v1/")
	}

	return cleanBase + "/" + cleanReq
}

func setProxyHeaders(req *http.Request, targetHost, originalHost, clientIP string) {
	standardHeaders := map[string]string{
		"Host":              targetHost,
		"X-Real-IP":         clientIP,
		"X-Forwarded-Proto": "https",
		"X-Forwarded-Host":  originalHost,
	}

	for name, value := range standardHeaders {
		req.Header.Set(name, value)
	}

	if xff := req.Header.Get("X-Forwarded-For"); xff != "" {
		req.Header.Set("X-Forwarded-For", fmt.Sprintf("%s, %s", xff, clientIP))
	} else {
		req.Header.Set("X-Forwarded-For", clientIP)
	}
}

func getAPIKeyFromCredentialManager(backend model.BackendConfig, logger *zap.Logger) string {
	cm, exists := CredentialManagers[backend.Name]
	if !exists {
		return ""
	}

	key, err := cm.GetNextKey()
	if err != nil {
		logger.Error("Failed to get API key from credential manager",
			zap.String("backend", backend.Name),
			zap.Error(err))
		return ""
	}

	logger.Debug("Using API key from credential manager",
		zap.String("backend", backend.Name),
		zap.Int("availableKeys", cm.GetAvailableKeyCount()))
	return key
}

func getSingleAPIKey(backend model.BackendConfig, logger *zap.Logger) string {
	if backend.APIKey != "" {
		logger.Debug("Using plaintext API key from config",
			zap.String("backend", backend.Name))
		return backend.APIKey
	}

	if backend.KeyEnvVar != "" {
		if apiKey := os.Getenv(backend.KeyEnvVar); apiKey != "" {
			return apiKey
		}
	}

	if backend.Name == "openai" {
		return os.Getenv("OPENAI_API_KEY")
	}

	return ""
}

func setAuthorizationHeader(req *http.Request, backend model.BackendConfig, logger *zap.Logger) {
	apiKey := getAPIKeyFromCredentialManager(backend, logger)
	if apiKey == "" {
		apiKey = getSingleAPIKey(backend, logger)
	}

	if apiKey != "" {
		auth := "Bearer " + apiKey
		req.Header.Set("Authorization", auth)
		logger.Info("Set Authorization header using API key",
			zap.String("backend", backend.Name),
			zap.String("Authorization", utils.RedactAuthorization(auth)))
		return
	}

	existingAuth := req.Header.Get("Authorization")
	if existingAuth != "" {
		logger.Info("Authorization header already set, forwarding to backend",
			zap.String("backend", backend.Name),
			zap.String("Authorization", utils.RedactAuthorization(existingAuth)))
	} else {
		logger.Error("Missing required API key for backend",
			zap.String("backend", backend.Name),
			zap.String("envVar", backend.KeyEnvVar))
	}
}

func makeDirector(urlParsed *url.URL, backend model.BackendConfig, logger *zap.Logger) func(req *http.Request) {
	return func(req *http.Request) {
		originalHost := req.Host
		originalPath := req.URL.Path

		if req.Body != nil && req.Method != "GET" {
			bodyBytes, _ := io.ReadAll(req.Body)
			req.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
		}

		req.Host = urlParsed.Host
		req.URL.Scheme = urlParsed.Scheme
		req.URL.Host = urlParsed.Host
		req.URL.Path = joinPaths(urlParsed.Path, originalPath)

		logger.Info("Modified request URL and Host",
			zap.String("originalHost", originalHost),
			zap.String("newHost", req.Host),
			zap.String("originalPath", originalPath),
			zap.String("newPath", req.URL.Path))

		clientIP := extractClientIP(req.RemoteAddr)
		setProxyHeaders(req, urlParsed.Host, originalHost, clientIP)

		if backend.RequireAPIKey {
			setAuthorizationHeader(req, backend, logger)
		} else {
			req.Header.Del("Authorization")
			logger.Info("Removed Authorization header for backend", zap.String("backend", backend.Name))
		}

		logger.Info("Proxy Director handled request",
			zap.String("URL", req.URL.String()),
			zap.String("Host", req.Host),
			zap.String("Method", req.Method),
			zap.String("Protocol", req.Proto))
	}
}
