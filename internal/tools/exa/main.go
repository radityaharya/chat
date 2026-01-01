package exa

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	baseURL = "https://api.exa.ai"
)

type Client struct {
	APIKey     string
	HTTPClient *http.Client
}

func NewClient(apiKey string) *Client {
	return &Client{
		APIKey: apiKey,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

type SearchRequest struct {
	Query              string                 `json:"query"`
	AdditionalQueries  []string               `json:"additionalQueries,omitempty"`
	Type               string                 `json:"type,omitempty"`
	Category           string                 `json:"category,omitempty"`
	UserLocation       string                 `json:"userLocation,omitempty"`
	NumResults         int                    `json:"numResults,omitempty"`
	IncludeDomains     []string               `json:"includeDomains,omitempty"`
	ExcludeDomains     []string               `json:"excludeDomains,omitempty"`
	StartCrawlDate     string                 `json:"startCrawlDate,omitempty"`
	EndCrawlDate       string                 `json:"endCrawlDate,omitempty"`
	StartPublishedDate string                 `json:"startPublishedDate,omitempty"`
	EndPublishedDate   string                 `json:"endPublishedDate,omitempty"`
	IncludeText        []string               `json:"includeText,omitempty"`
	ExcludeText        []string               `json:"excludeText,omitempty"`
	Contents           map[string]interface{} `json:"contents,omitempty"`
}

type FindSimilarRequest struct {
	URL        string                 `json:"url"`
	NumResults int                    `json:"numResults,omitempty"`
	Contents   map[string]interface{} `json:"contents,omitempty"`
}

type GetContentsRequest struct {
	URLs     []string               `json:"urls"`
	Text     interface{}            `json:"text,omitempty"`
	Summary  map[string]interface{} `json:"summary,omitempty"`
	Subpages int                    `json:"subpages,omitempty"`
}

type Result struct {
	ID            string   `json:"id"`
	URL           string   `json:"url"`
	Title         string   `json:"title"`
	Author        string   `json:"author,omitempty"`
	PublishedDate string   `json:"publishedDate,omitempty"`
	Score         float64  `json:"score,omitempty"`
	Text          string   `json:"text,omitempty"`
	Summary       string   `json:"summary,omitempty"`
	Highlights    []string `json:"highlights,omitempty"`
	Image         string   `json:"image,omitempty"`
	Favicon       string   `json:"favicon,omitempty"`
}

type SearchResponse struct {
	RequestID  string   `json:"requestId"`
	Results    []Result `json:"results"`
	SearchType string   `json:"searchType,omitempty"`
}

type FindSimilarResponse struct {
	RequestID string   `json:"requestId"`
	Results   []Result `json:"results"`
}

type GetContentsResponse struct {
	RequestID string   `json:"requestId"`
	Results   []Result `json:"results"`
}

func (c *Client) doRequest(method, path string, body interface{}, response interface{}) error {
	var reqBody io.Reader
	if body != nil {
		jsonData, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("failed to marshal request: %w", err)
		}
		reqBody = bytes.NewReader(jsonData)
	}

	req, err := http.NewRequest(method, baseURL+path, reqBody)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", c.APIKey)

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	if response != nil {
		if err := json.NewDecoder(resp.Body).Decode(response); err != nil {
			return fmt.Errorf("failed to decode response: %w", err)
		}
	}

	return nil
}

func (c *Client) Search(req SearchRequest) (*SearchResponse, error) {
	var resp SearchResponse
	if err := c.doRequest("POST", "/search", req, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func (c *Client) FindSimilar(req FindSimilarRequest) (*FindSimilarResponse, error) {
	var resp FindSimilarResponse
	if err := c.doRequest("POST", "/findSimilar", req, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func (c *Client) GetContents(req GetContentsRequest) (*GetContentsResponse, error) {
	var resp GetContentsResponse
	if err := c.doRequest("POST", "/contents", req, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}
