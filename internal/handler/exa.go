package handler

import (
	"encoding/json"
	"llm-router/internal/model"
	"llm-router/internal/tools/exa"
	"net/http"

	"go.uber.org/zap"
)

type ExaToolRequest struct {
	Action string                 `json:"action"`
	Params map[string]interface{} `json:"params"`
}

type ExaToolResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

func HandleExaTool(w http.ResponseWriter, r *http.Request, cfg *model.Config) {
	if cfg.ExaAPIKey == "" {
		cfg.Logger.Warn("Exa API key not configured")
		respondWithError(w, "Exa API key not configured", http.StatusServiceUnavailable)
		return
	}

	var req ExaToolRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		cfg.Logger.Error("Failed to decode Exa tool request", zap.Error(err))
		respondWithError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	client := exa.NewClient(cfg.ExaAPIKey)

	var result interface{}
	var err error

	switch req.Action {
	case "search":
		searchReq := parseSearchRequest(req.Params)
		result, err = client.Search(searchReq)

	case "find_similar":
		findSimilarReq := parseFindSimilarRequest(req.Params)
		result, err = client.FindSimilar(findSimilarReq)

	case "get_contents":
		getContentsReq := parseGetContentsRequest(req.Params)
		result, err = client.GetContents(getContentsReq)

	default:
		respondWithError(w, "Unknown action: "+req.Action, http.StatusBadRequest)
		return
	}

	if err != nil {
		cfg.Logger.Error("Exa API request failed", zap.String("action", req.Action), zap.Error(err))
		respondWithError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	respondWithJSON(w, ExaToolResponse{
		Success: true,
		Data:    result,
	})
}

func parseSearchRequest(params map[string]interface{}) exa.SearchRequest {
	req := exa.SearchRequest{}

	if v, ok := params["query"].(string); ok {
		req.Query = v
	}
	if v, ok := params["type"].(string); ok {
		req.Type = v
	}
	if v, ok := params["category"].(string); ok {
		req.Category = v
	}
	if v, ok := params["numResults"].(float64); ok {
		req.NumResults = int(v)
	}
	if v, ok := params["includeDomains"].([]interface{}); ok {
		req.IncludeDomains = toStringSlice(v)
	}
	if v, ok := params["excludeDomains"].([]interface{}); ok {
		req.ExcludeDomains = toStringSlice(v)
	}
	if v, ok := params["includeText"].([]interface{}); ok {
		req.IncludeText = toStringSlice(v)
	}
	if v, ok := params["excludeText"].([]interface{}); ok {
		req.ExcludeText = toStringSlice(v)
	}
	if v, ok := params["contents"].(map[string]interface{}); ok {
		req.Contents = v
	}

	return req
}

func parseFindSimilarRequest(params map[string]interface{}) exa.FindSimilarRequest {
	req := exa.FindSimilarRequest{}

	if v, ok := params["url"].(string); ok {
		req.URL = v
	}
	if v, ok := params["numResults"].(float64); ok {
		req.NumResults = int(v)
	}
	if v, ok := params["contents"].(map[string]interface{}); ok {
		req.Contents = v
	}

	return req
}

func parseGetContentsRequest(params map[string]interface{}) exa.GetContentsRequest {
	req := exa.GetContentsRequest{}

	if v, ok := params["urls"].([]interface{}); ok {
		req.URLs = toStringSlice(v)
	}
	if v, ok := params["text"]; ok {
		req.Text = v
	}
	if v, ok := params["summary"].(map[string]interface{}); ok {
		req.Summary = v
	}
	if v, ok := params["subpages"].(float64); ok {
		req.Subpages = int(v)
	}

	return req
}

func toStringSlice(v []interface{}) []string {
	result := make([]string, 0, len(v))
	for _, item := range v {
		if s, ok := item.(string); ok {
			result = append(result, s)
		}
	}
	return result
}

func respondWithJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func respondWithError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(ExaToolResponse{
		Success: false,
		Error:   message,
	})
}
