package handler

import (
	"encoding/json"
	"llm-router/internal/model"
	"llm-router/internal/tools/geo"
	"net/http"

	"go.uber.org/zap"
)

type GeoToolRequest struct {
	Action string                 `json:"action"`
	Params map[string]interface{} `json:"params"`
}

type GeoToolResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

func HandleGeoTool(w http.ResponseWriter, r *http.Request, cfg *model.Config) {
	if cfg.GeoapifyAPIKey == "" {
		cfg.Logger.Warn("Geoapify API key not configured")
		respondWithError(w, "Geoapify API key not configured", http.StatusServiceUnavailable)
		return
	}

	var req GeoToolRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		cfg.Logger.Error("Failed to decode Geo tool request", zap.Error(err))
		respondWithError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	client := geo.NewClient(cfg.GeoapifyAPIKey)

	var result interface{}
	var err error

	switch req.Action {
	case "geocode_search":
		geocodeReq := parseGeocodeSearchRequest(req.Params)
		result, err = client.GeocodeSearch(geocodeReq)

	case "geocode_reverse":
		reverseReq := parseGeocodeReverseRequest(req.Params)
		result, err = client.GeocodeReverse(reverseReq)

	case "routing":
		routingReq := parseRoutingRequest(req.Params)
		result, err = client.Routing(routingReq)

	case "static_map":
		staticMapReq := parseStaticMapRequest(req.Params)
		mapURL, err := client.StaticMap(staticMapReq)
		if err == nil {
			result = map[string]interface{}{
				"url":    mapURL,
				"width":  staticMapReq.Width,
				"height": staticMapReq.Height,
			}
		}

	case "places":
		placesReq := parsePlacesRequest(req.Params)
		result, err = client.Places(placesReq)

	default:
		respondWithError(w, "Unknown action: "+req.Action, http.StatusBadRequest)
		return
	}

	if err != nil {
		cfg.Logger.Error("Geoapify API request failed", zap.String("action", req.Action), zap.Error(err))
		respondWithError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	respondWithJSON(w, GeoToolResponse{
		Success: true,
		Data:    result,
	})
}

func parseGeocodeSearchRequest(params map[string]interface{}) geo.GeocodeSearchRequest {
	req := geo.GeocodeSearchRequest{}

	if v, ok := params["text"].(string); ok {
		req.Text = v
	}
	if v, ok := params["lang"].(string); ok {
		req.Lang = v
	}
	if v, ok := params["limit"].(float64); ok {
		req.Limit = int(v)
	}
	if v, ok := params["filter"].(string); ok {
		req.Filter = v
	}
	if v, ok := params["bias"].(string); ok {
		req.Bias = v
	}

	return req
}

func parseGeocodeReverseRequest(params map[string]interface{}) geo.GeocodeReverseRequest {
	req := geo.GeocodeReverseRequest{}

	if v, ok := params["lat"].(float64); ok {
		req.Lat = v
	}
	if v, ok := params["lon"].(float64); ok {
		req.Lon = v
	}
	if v, ok := params["lang"].(string); ok {
		req.Lang = v
	}
	if v, ok := params["type"].(string); ok {
		req.Type = v
	}

	return req
}

func parseRoutingRequest(params map[string]interface{}) geo.RoutingRequest {
	req := geo.RoutingRequest{}

	if v, ok := params["waypoints"].([]interface{}); ok {
		for _, wp := range v {
			if wpMap, ok := wp.(map[string]interface{}); ok {
				waypoint := geo.Waypoint{}
				if lat, ok := wpMap["lat"].(float64); ok {
					waypoint.Lat = lat
				}
				if lon, ok := wpMap["lon"].(float64); ok {
					waypoint.Lon = lon
				}
				req.Waypoints = append(req.Waypoints, waypoint)
			}
		}
	}
	if v, ok := params["mode"].(string); ok {
		req.Mode = v
	}
	if v, ok := params["details"].([]interface{}); ok {
		for _, detail := range v {
			if s, ok := detail.(string); ok {
				req.Details = append(req.Details, s)
			}
		}
	}

	return req
}

func parseStaticMapRequest(params map[string]interface{}) geo.StaticMapRequest {
	req := geo.StaticMapRequest{}

	if v, ok := params["style"].(string); ok {
		req.Style = v
	}
	if v, ok := params["width"].(float64); ok {
		req.Width = int(v)
	}
	if v, ok := params["height"].(float64); ok {
		req.Height = int(v)
	}
	if v, ok := params["zoom"].(float64); ok {
		req.Zoom = v
	}

	// Parse center
	if centerMap, ok := params["center"].(map[string]interface{}); ok {
		center := &geo.Waypoint{}
		if lat, ok := centerMap["lat"].(float64); ok {
			center.Lat = lat
		}
		if lon, ok := centerMap["lon"].(float64); ok {
			center.Lon = lon
		}
		req.Center = center
	}

	// Parse markers
	if markersArray, ok := params["markers"].([]interface{}); ok {
		for _, m := range markersArray {
			if markerMap, ok := m.(map[string]interface{}); ok {
				marker := geo.MapMarker{}
				if lat, ok := markerMap["lat"].(float64); ok {
					marker.Lat = lat
				}
				if lon, ok := markerMap["lon"].(float64); ok {
					marker.Lon = lon
				}
				if typ, ok := markerMap["type"].(string); ok {
					marker.Type = typ
				}
				if color, ok := markerMap["color"].(string); ok {
					marker.Color = color
				}
				if size, ok := markerMap["size"].(string); ok {
					marker.Size = size
				}
				if icon, ok := markerMap["icon"].(string); ok {
					marker.Icon = icon
				}
				if iconType, ok := markerMap["icontype"].(string); ok {
					marker.IconType = iconType
				}
				if text, ok := markerMap["text"].(string); ok {
					marker.Text = text
				}
				req.Markers = append(req.Markers, marker)
			}
		}
	}

	if v, ok := params["area"].(string); ok {
		req.Area = v
	}

	return req
}

func parsePlacesRequest(params map[string]interface{}) geo.PlacesRequest {
	req := geo.PlacesRequest{}

	if v, ok := params["categories"].([]interface{}); ok {
		for _, cat := range v {
			if s, ok := cat.(string); ok {
				req.Categories = append(req.Categories, s)
			}
		}
	}
	if v, ok := params["filter"].(string); ok {
		req.Filter = v
	}
	if v, ok := params["bias"].(string); ok {
		req.Bias = v
	}
	if v, ok := params["limit"].(float64); ok {
		req.Limit = int(v)
	}
	if v, ok := params["lang"].(string); ok {
		req.Lang = v
	}
	if v, ok := params["name"].(string); ok {
		req.Name = v
	}

	return req
}
