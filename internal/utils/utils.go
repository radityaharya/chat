package utils

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"unicode"

	"go.uber.org/zap"
)

const (
	maxCaptureSize    = 1024 * 1024
	streamBufferSize  = 8 * 1024
	apiKeyLength      = 48
	bearerPrefix      = "Bearer "
	redactedPrefix    = 10
	redactedSuffix    = 4
	minBearerLength   = 29
	reassembledMinLen = 25
	charset           = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
)

func RedactAuthorization(auth string) string {
	if strings.HasPrefix(auth, bearerPrefix) && len(auth) > minBearerLength {
		return auth[:redactedPrefix] + "..." + auth[len(auth)-redactedSuffix:]
	}
	return strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return r
		}
		return '*'
	}, auth)
}

func DrainBody(body io.ReadCloser) (io.ReadCloser, string) {
	if body == nil {
		return nil, ""
	}

	bodyBytes, err := io.ReadAll(body)
	if err != nil {
		return body, fmt.Sprintf("Error reading body: %v", err)
	}

	return io.NopCloser(bytes.NewBuffer(bodyBytes)), formatJSON(bodyBytes)
}

func formatJSON(data []byte) string {
	var prettyJSON bytes.Buffer
	if err := json.Indent(&prettyJSON, data, "", "  "); err == nil {
		return prettyJSON.String()
	}
	return string(data)
}

func buildHeaderMap(headers http.Header, redactAuth bool) map[string]string {
	result := make(map[string]string)
	for name, values := range headers {
		if redactAuth && strings.ToLower(name) == "authorization" {
			result[name] = RedactAuthorization(values[0])
		} else {
			result[name] = strings.Join(values, ", ")
		}
	}
	return result
}

func LogRequestResponse(logger *zap.Logger, req *http.Request, resp *http.Response, reqBody, respBody string) {
	if req != nil {
		logger.Debug("Full request details",
			zap.String("method", req.Method),
			zap.String("url", req.URL.String()),
			zap.Any("headers", buildHeaderMap(req.Header, true)),
			zap.String("body", reqBody),
		)
	}

	if resp != nil {
		logger.Debug("Full response details",
			zap.Int("status", resp.StatusCode),
			zap.Any("headers", buildHeaderMap(resp.Header, false)),
			zap.String("body", respBody),
		)
	}
}

type ResponseRecorder struct {
	http.ResponseWriter
	StatusCode     int
	Body           bytes.Buffer
	streaming      bool
	maxCaptureSize int
	capturedSize   int
}

func NewResponseRecorder(w http.ResponseWriter) *ResponseRecorder {
	return &ResponseRecorder{
		ResponseWriter: w,
		StatusCode:     http.StatusOK,
		streaming:      false,
		maxCaptureSize: maxCaptureSize,
		capturedSize:   0,
	}
}

func (r *ResponseRecorder) WriteHeader(statusCode int) {
	r.StatusCode = statusCode
	r.ResponseWriter.WriteHeader(statusCode)

	contentType := r.Header().Get("Content-Type")
	r.streaming = strings.Contains(contentType, "text/event-stream") ||
		r.Header().Get("Transfer-Encoding") == "chunked"
}

func (r *ResponseRecorder) Write(b []byte) (int, error) {
	n, err := r.ResponseWriter.Write(b)

	if err == nil && n > 0 && r.capturedSize < r.maxCaptureSize {
		remainingCapacity := r.maxCaptureSize - r.capturedSize
		if remainingCapacity > 0 {
			toCapture := b
			if len(b) > remainingCapacity {
				toCapture = b[:remainingCapacity]
			}

			bytesWritten, _ := r.Body.Write(toCapture)
			r.capturedSize += bytesWritten

			if r.capturedSize >= r.maxCaptureSize && len(b) > remainingCapacity {
				r.Body.WriteString("\n... [response truncated for logging, exceeded 1MB] ...")
			}
		}
	}

	return n, err
}

func (r *ResponseRecorder) Flush() {
	if flusher, ok := r.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (r *ResponseRecorder) Header() http.Header {
	return r.ResponseWriter.Header()
}

func extractDeltaContent(line string) string {
	if !strings.HasPrefix(line, "{") {
		return ""
	}

	var jsonObj map[string]interface{}
	if err := json.Unmarshal([]byte(line), &jsonObj); err != nil {
		return ""
	}

	choices, ok := jsonObj["choices"].([]interface{})
	if !ok || len(choices) == 0 {
		return ""
	}

	choice, ok := choices[0].(map[string]interface{})
	if !ok {
		return ""
	}

	delta, ok := choice["delta"].(map[string]interface{})
	if !ok {
		return ""
	}

	content, ok := delta["content"].(string)
	if !ok || content == "" {
		return ""
	}

	return content
}

func reassembleStreamContent(content string) string {
	var builder strings.Builder
	builder.WriteString("STREAMING RESPONSE (REASSEMBLED):\n")

	for _, line := range strings.Split(content, "data: ") {
		line = strings.TrimSpace(line)
		if line == "" || line == "[DONE]" {
			continue
		}

		if deltaContent := extractDeltaContent(line); deltaContent != "" {
			builder.WriteString(deltaContent)
		}
	}

	if builder.Len() > reassembledMinLen {
		return builder.String()
	}
	return ""
}

func (r *ResponseRecorder) GetBody() string {
	if !r.streaming {
		return formatJSON(r.Body.Bytes())
	}

	content := r.Body.String()

	if strings.Contains(content, "data: {") && strings.Contains(content, "delta") {
		if reassembled := reassembleStreamContent(content); reassembled != "" {
			return reassembled
		}
	}

	return "STREAMING CONTENT:\n" + content
}

func formatStreamEvent(line string) string {
	if !strings.HasPrefix(line, "{") {
		return line + "\n"
	}

	var jsonObj map[string]interface{}
	if err := json.Unmarshal([]byte(line), &jsonObj); err == nil {
		if prettyJSON, err := json.MarshalIndent(jsonObj, "", "  "); err == nil {
			return "--EVENT--\n" + string(prettyJSON) + "\n"
		}
	}
	return line + "\n"
}

func processStreamSample(content string) string {
	var builder strings.Builder
	builder.WriteString("STREAMING DATA (SAMPLE):\n")

	for _, line := range strings.Split(content, "data: ") {
		line = strings.TrimSpace(line)
		if line == "" || line == "[DONE]" {
			continue
		}
		builder.WriteString(formatStreamEvent(line))
	}

	return builder.String()
}

func DrainAndCapture(body io.ReadCloser, isStreaming bool) (io.ReadCloser, string) {
	if body == nil {
		return nil, ""
	}

	if isStreaming {
		peeked := make([]byte, streamBufferSize)
		n, err := body.Read(peeked)
		if err != nil && err != io.EOF {
			return body, fmt.Sprintf("Error peeking at streaming body: %v", err)
		}

		if n > 0 {
			peeked = peeked[:n]
			combinedReader := io.MultiReader(bytes.NewReader(peeked), body)
			content := string(peeked)

			if strings.Contains(content, "data: {") && strings.Contains(content, "delta") {
				return io.NopCloser(combinedReader), processStreamSample(content)
			}

			return io.NopCloser(combinedReader), "STREAMING: " + formatJSON(peeked) + "..."
		}
		return body, "STREAMING CONTENT (empty or could not be sampled)"
	}

	bodyBytes, err := io.ReadAll(body)
	if err != nil {
		return body, fmt.Sprintf("Error reading body: %v", err)
	}

	return io.NopCloser(bytes.NewBuffer(bodyBytes)), formatJSON(bodyBytes)
}

func GenerateStrongAPIKey() (string, error) {
	randomBytes := make([]byte, apiKeyLength)
	if _, err := io.ReadFull(rand.Reader, randomBytes); err != nil {
		return "", err
	}

	result := make([]byte, apiKeyLength)
	for i, b := range randomBytes {
		result[i] = charset[int(b)%len(charset)]
	}

	return "sk_" + string(result), nil
}
