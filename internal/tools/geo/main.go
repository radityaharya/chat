package geo

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	baseURL = "https://api.geoapify.com/v1"
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

// GeocodeSearchRequest represents a forward geocoding request
type GeocodeSearchRequest struct {
	Text   string `json:"text"`
	Lang   string `json:"lang,omitempty"`
	Limit  int    `json:"limit,omitempty"`
	Filter string `json:"filter,omitempty"`
	Bias   string `json:"bias,omitempty"`
}

// GeocodeReverseRequest represents a reverse geocoding request
type GeocodeReverseRequest struct {
	Lat  float64 `json:"lat"`
	Lon  float64 `json:"lon"`
	Lang string  `json:"lang,omitempty"`
	Type string  `json:"type,omitempty"`
}

// RoutingRequest represents a routing request
type RoutingRequest struct {
	Waypoints []Waypoint `json:"waypoints"`
	Mode      string     `json:"mode,omitempty"` // drive, truck, bicycle, walk, etc.
	Details   []string   `json:"details,omitempty"`
}

type Waypoint struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

// Feature represents a GeoJSON feature
type Feature struct {
	Type       string                 `json:"type"`
	Properties map[string]interface{} `json:"properties"`
	Geometry   Geometry               `json:"geometry"`
	BBox       []float64              `json:"bbox,omitempty"`
}

type Geometry struct {
	Type        string      `json:"type"`
	Coordinates interface{} `json:"coordinates"`
}

// GeocodeResponse represents the response from geocoding endpoints
type GeocodeResponse struct {
	Type     string    `json:"type"`
	Features []Feature `json:"features"`
	Query    Query     `json:"query,omitempty"`
}

type Query struct {
	Text   string                 `json:"text,omitempty"`
	Parsed map[string]interface{} `json:"parsed,omitempty"`
	Lat    float64                `json:"lat,omitempty"`
	Lon    float64                `json:"lon,omitempty"`
}

// RoutingResponse represents the response from routing endpoint
type RoutingResponse struct {
	Type       string                 `json:"type"`
	Features   []Feature              `json:"features"`
	Properties map[string]interface{} `json:"properties,omitempty"`
}

// PlacesRequest represents a request for nearby places
type PlacesRequest struct {
	Categories []string `json:"categories,omitempty"` // e.g., "commercial.supermarket", "catering.restaurant"
	Filter     string   `json:"filter,omitempty"`     // Filter by area: rect, circle, place, etc.
	Bias       string   `json:"bias,omitempty"`       // Bias results towards a location
	Limit      int      `json:"limit,omitempty"`      // Max number of results (default: 20, max: 500)
	Lang       string   `json:"lang,omitempty"`       // Language code
	Name       string   `json:"name,omitempty"`       // Filter by name
}

// PlacesResponse represents the response from places endpoint
type PlacesResponse struct {
	Type     string    `json:"type"`
	Features []Feature `json:"features"`
}

func (c *Client) doRequest(method, path string, params url.Values, response interface{}) error {
	// Add API key to params
	if params == nil {
		params = url.Values{}
	}
	params.Set("apiKey", c.APIKey)

	fullURL := baseURL + path + "?" + params.Encode()

	req, err := http.NewRequest(method, fullURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

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

// GeocodeSearch performs forward geocoding (address to coordinates)
func (c *Client) GeocodeSearch(req GeocodeSearchRequest) (*GeocodeResponse, error) {
	params := url.Values{}
	params.Set("text", req.Text)
	if req.Lang != "" {
		params.Set("lang", req.Lang)
	}
	if req.Limit > 0 {
		params.Set("limit", fmt.Sprintf("%d", req.Limit))
	}
	if req.Filter != "" {
		params.Set("filter", req.Filter)
	}
	if req.Bias != "" {
		params.Set("bias", req.Bias)
	}

	var resp GeocodeResponse
	if err := c.doRequest("GET", "/geocode/search", params, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// GeocodeReverse performs reverse geocoding (coordinates to address)
func (c *Client) GeocodeReverse(req GeocodeReverseRequest) (*GeocodeResponse, error) {
	params := url.Values{}
	params.Set("lat", fmt.Sprintf("%f", req.Lat))
	params.Set("lon", fmt.Sprintf("%f", req.Lon))
	if req.Lang != "" {
		params.Set("lang", req.Lang)
	}
	if req.Type != "" {
		params.Set("type", req.Type)
	}

	var resp GeocodeResponse
	if err := c.doRequest("GET", "/geocode/reverse", params, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// Routing calculates a route between waypoints
func (c *Client) Routing(req RoutingRequest) (*RoutingResponse, error) {
	params := url.Values{}

	// Build waypoints parameter
	var waypointsStr string
	for i, wp := range req.Waypoints {
		if i > 0 {
			waypointsStr += "|"
		}
		waypointsStr += fmt.Sprintf("%f,%f", wp.Lat, wp.Lon)
	}
	params.Set("waypoints", waypointsStr)

	if req.Mode != "" {
		params.Set("mode", req.Mode)
	}
	if len(req.Details) > 0 {
		for _, detail := range req.Details {
			params.Add("details", detail)
		}
	}

	var resp RoutingResponse
	if err := c.doRequest("GET", "/routing", params, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// Places searches for nearby places (POIs)
func (c *Client) Places(req PlacesRequest) (*PlacesResponse, error) {
	params := url.Values{}

	// Categories parameter
	if len(req.Categories) > 0 {
		params.Set("categories", strings.Join(req.Categories, ","))
	}

	// Filter parameter (required)
	if req.Filter != "" {
		params.Set("filter", req.Filter)
	}

	// Optional parameters
	if req.Bias != "" {
		params.Set("bias", req.Bias)
	}
	if req.Limit > 0 {
		params.Set("limit", fmt.Sprintf("%d", req.Limit))
	}
	if req.Lang != "" {
		params.Set("lang", req.Lang)
	}
	if req.Name != "" {
		params.Set("name", req.Name)
	}

	var resp PlacesResponse
	// Use v2 API for places
	if err := c.doRequestV2("GET", "/places", params, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// doRequestV2 is similar to doRequest but uses the v2 API base URL
func (c *Client) doRequestV2(method, path string, params url.Values, response interface{}) error {
	// Add API key to params
	if params == nil {
		params = url.Values{}
	}
	params.Set("apiKey", c.APIKey)

	fullURL := "https://api.geoapify.com/v2" + path + "?" + params.Encode()

	req, err := http.NewRequest(method, fullURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

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

// StaticMapRequest represents a request for a static map image
type StaticMapRequest struct {
	Style   string      `json:"style,omitempty"`   // Map style: osm-bright, osm-bright-grey, osm-bright-smooth, etc.
	Width   int         `json:"width,omitempty"`   // Image width in pixels
	Height  int         `json:"height,omitempty"`  // Image height in pixels
	Center  *Waypoint   `json:"center,omitempty"`  // Center point of the map
	Zoom    float64     `json:"zoom,omitempty"`    // Zoom level
	Markers []MapMarker `json:"markers,omitempty"` // Markers to display on the map
	Area    string      `json:"area,omitempty"`    // Area to highlight (GeoJSON or bbox)
}

type MapMarker struct {
	Lat      float64 `json:"lat"`
	Lon      float64 `json:"lon"`
	Type     string  `json:"type,omitempty"`     // awesome, material
	Color    string  `json:"color,omitempty"`    // Hex color
	Size     string  `json:"size,omitempty"`     // small, medium, large, x-large
	Icon     string  `json:"icon,omitempty"`     // Icon name
	IconType string  `json:"icontype,omitempty"` // awesome, material
	Text     string  `json:"text,omitempty"`     // Text to display
}

// StaticMap generates a static map image URL
func (c *Client) StaticMap(req StaticMapRequest) (string, error) {
	params := url.Values{}

	// Set defaults
	if req.Style == "" {
		req.Style = "osm-bright-smooth"
	}
	if req.Width == 0 {
		req.Width = 600
	}
	if req.Height == 0 {
		req.Height = 400
	}

	params.Set("style", req.Style)
	params.Set("width", fmt.Sprintf("%d", req.Width))
	params.Set("height", fmt.Sprintf("%d", req.Height))

	if req.Center != nil {
		params.Set("center", fmt.Sprintf("lonlat:%f,%f", req.Center.Lon, req.Center.Lat))
	}

	if req.Zoom > 0 {
		params.Set("zoom", fmt.Sprintf("%f", req.Zoom))
	}

	// Build markers parameter
	if len(req.Markers) > 0 {
		var markerStrs []string
		for _, m := range req.Markers {
			markerStr := fmt.Sprintf("lonlat:%f,%f", m.Lon, m.Lat)
			if m.Type != "" {
				markerStr += fmt.Sprintf(";type:%s", m.Type)
			}
			if m.Color != "" {
				markerStr += fmt.Sprintf(";color:%s", m.Color)
			}
			if m.Size != "" {
				markerStr += fmt.Sprintf(";size:%s", m.Size)
			}
			if m.Icon != "" {
				markerStr += fmt.Sprintf(";icon:%s", m.Icon)
			}
			if m.IconType != "" {
				markerStr += fmt.Sprintf(";icontype:%s", m.IconType)
			}
			if m.Text != "" {
				markerStr += fmt.Sprintf(";text:%s", m.Text)
			}
			markerStrs = append(markerStrs, markerStr)
		}
		params.Set("marker", strings.Join(markerStrs, "|"))
	}

	if req.Area != "" {
		params.Set("area", req.Area)
	}

	// Add API key
	params.Set("apiKey", c.APIKey)

	// Return the full URL
	return "https://maps.geoapify.com/v1/staticmap?" + params.Encode(), nil
}
