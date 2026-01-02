import { z } from 'zod';
import { type LocalTool } from '../types';

const BASE_URL = '/api/v1/tools/geo';

interface GeoFeature {
  type: string;
  properties: Record<string, any>;
  geometry: {
    type: string;
    coordinates: any;
  };
  bbox?: number[];
}

interface GeocodeResponse {
  type: string;
  features: GeoFeature[];
  query?: {
    text?: string;
    parsed?: Record<string, any>;
    lat?: number;
    lon?: number;
  };
}

interface RoutingResponse {
  type: string;
  features: GeoFeature[];
  properties?: Record<string, any>;
}

interface StaticMapResponse {
  url: string;
  width: number;
  height: number;
}

interface PlacesResponse {
  type: string;
  features: GeoFeature[];
}

interface GeoToolResponse {
  success: boolean;
  data?: GeocodeResponse | RoutingResponse | StaticMapResponse | PlacesResponse;
  error?: string;
}

export const geoTool: LocalTool = {
  name: 'geoapify',
  description: 'Access Geoapify geocoding, routing, places, and map visualization services. IMPORTANT: If you need the user\'s current location and don\'t have coordinates yet, FIRST use the "browser_geolocation" tool to get their current position, then use this tool. Supports: 1) Forward geocoding, 2) Reverse geocoding, 3) Routing, 4) Static map, 5) Places (find nearby POIs). For location-based queries, get coordinates with browser_geolocation first.',
  parameters: z.object({
    action: z.enum(['geocode_search', 'geocode_reverse', 'routing', 'static_map', 'places']).describe('Action to perform: geocode_search, geocode_reverse, routing, static_map, places (find nearby POIs like supermarkets, restaurants).'),

    // Geocode search parameters
    text: z.string().optional().describe('Address or place name to search for (required for geocode_search).'),

    // Geocode reverse parameters
    lat: z.number().optional().describe('Latitude for reverse geocoding or routing waypoint.'),
    lon: z.number().optional().describe('Longitude for reverse geocoding or routing waypoint.'),

    // Routing parameters
    waypoints: z.array(z.object({
      lat: z.number().describe('Latitude of waypoint'),
      lon: z.number().describe('Longitude of waypoint'),
    })).optional().describe('Array of waypoints for routing (minimum 2 points required).'),
    mode: z.enum(['drive', 'truck', 'bicycle', 'walk', 'transit', 'approximated_transit']).optional().describe('Transportation mode for routing (default: drive).'),

    // Common parameters
    lang: z.string().optional().describe('Language code for results (e.g., "en", "de", "fr").'),
    limit: z.number().min(1).max(20).optional().describe('Maximum number of results for geocode_search (default: 10).'),
    filter: z.string().optional().describe('Filter results by location (e.g., "countrycode:us,gb").'),
    bias: z.string().optional().describe('Bias results towards a location (e.g., "countrycode:us").'),
    type: z.string().optional().describe('Type filter for reverse geocoding (e.g., "street", "city", "country").'),
    details: z.array(z.string()).optional().describe('Additional details to include in routing response.'),

    // Static map parameters
    center: z.object({
      lat: z.number(),
      lon: z.number(),
    }).optional().describe('Center point of the map (required for static_map if no markers).'),
    zoom: z.number().min(1).max(20).optional().describe('Zoom level for static map (1-20, default: auto-calculated from markers).'),
    width: z.number().min(100).max(1200).optional().describe('Map image width in pixels (default: 600).'),
    height: z.number().min(100).max(1200).optional().describe('Map image height in pixels (default: 400).'),
    style: z.enum(['osm-bright', 'osm-bright-grey', 'osm-bright-smooth', 'klokantech-basic', 'osm-liberty', 'maptiler-3d', 'toner', 'toner-grey', 'positron', 'positron-blue', 'positron-red', 'dark-matter', 'dark-matter-brown', 'dark-matter-dark-grey', 'dark-matter-dark-purple', 'dark-matter-purple-roads', 'dark-matter-yellow-roads']).optional().describe('Map style (default: osm-bright-smooth).'),
    markers: z.array(z.object({
      lat: z.number(),
      lon: z.number(),
      type: z.enum(['awesome', 'material']).optional(),
      color: z.string().optional().describe('Hex color (e.g., "#bb3f73")'),
      size: z.enum(['small', 'medium', 'large', 'x-large']).optional(),
      icon: z.string().optional().describe('Icon name (e.g., "paw", "tree", "home")'),
      icontype: z.enum(['awesome', 'material']).optional(),
      text: z.string().optional().describe('Text to display on marker'),
    })).optional().describe('Markers to display on the map.'),

    // Places parameters
    categories: z.array(z.string()).optional().describe('Categories of places to find (e.g., ["commercial.supermarket", "catering.restaurant"]).'),
    name: z.string().optional().describe('Filter places by name.'),
  }),
  execute: async ({ action, text, lat, lon, waypoints, mode, lang, limit, filter, bias, type, details, center, zoom, width, height, style, markers, categories, name }) => {
    try {
      const params: Record<string, any> = {};

      if (action === 'geocode_search') {
        if (!text) throw new Error('Text parameter is required for geocode_search action');
        params.text = text;
        if (lang) params.lang = lang;
        if (limit) params.limit = limit;
        if (filter) params.filter = filter;
        if (bias) params.bias = bias;
      }

      if (action === 'geocode_reverse') {
        if (lat === undefined || lon === undefined) {
          throw new Error('Lat and lon parameters are required for geocode_reverse action');
        }
        params.lat = lat;
        params.lon = lon;
        if (lang) params.lang = lang;
        if (type) params.type = type;
      }

      if (action === 'routing') {
        if (!waypoints || waypoints.length < 2) {
          throw new Error('At least 2 waypoints are required for routing action');
        }
        params.waypoints = waypoints;
        if (mode) params.mode = mode;
        if (details) params.details = details;
      }

      if (action === 'static_map') {
        if (center) params.center = center;
        if (zoom) params.zoom = zoom;
        if (width) params.width = width;
        if (height) params.height = height;
        if (style) params.style = style;
        if (markers) params.markers = markers;
      }

      if (action === 'places') {
        if (!filter && !bias) {
          throw new Error('Either filter (e.g. rect or circle) or bias is required for places action');
        }
        if (categories) params.categories = categories;
        if (filter) params.filter = filter;
        if (bias) params.bias = bias;
        if (limit) params.limit = limit;
        if (lang) params.lang = lang;
        if (name) params.name = name;
      }

      const response = await fetch(BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          params,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error (${response.status}): ${errorText}`);
      }

      const result = await response.json() as GeoToolResponse;

      if (!result.success) {
        throw new Error(result.error || 'Unknown error from Geoapify API');
      }

      // Format results based on action type
      if (action === 'static_map') {
        // Static map returns a URL directly
        const mapData = result.data as StaticMapResponse;
        return {
          type: 'static_map',
          url: mapData.url,
          width: mapData.width,
          height: mapData.height,
          message: `Map image generated. Display the image using this URL: ${mapData.url}`,
        };
      }

      if (result.data && 'features' in result.data) {
        const data = result.data as GeocodeResponse | RoutingResponse;

        if (action === 'routing') {
          // Format routing response
          const routingData = data as RoutingResponse;
          const feature = routingData.features[0];

          return {
            type: 'routing',
            distance: feature?.properties?.distance,
            distance_units: feature?.properties?.distance_units,
            time: feature?.properties?.time,
            mode: feature?.properties?.mode,
            waypoints: feature?.properties?.waypoints,
            legs: feature?.properties?.legs,
            geometry: feature?.geometry,
          };
        } else if (action === 'places') {
          // Format places response
          const placesData = data as PlacesResponse;
          const formattedResults = placesData.features.map((feature: GeoFeature) => ({
            name: feature.properties.name,
            address: feature.properties.formatted,
            categories: feature.properties.categories,
            distance: feature.properties.distance,
            lat: feature.properties.lat,
            lon: feature.properties.lon,
            place_id: feature.properties.place_id,
            details: feature.properties.details,
            opening_hours: feature.properties.opening_hours,
            website: feature.properties.website,
            phone: feature.properties.contact?.phone,
          }));

          return {
            type: 'places',
            count: formattedResults.length,
            results: formattedResults,
          };
        } else {
          // Format geocoding response
          const geocodeData = data as GeocodeResponse;
          const formattedResults = geocodeData.features.map((feature: GeoFeature) => ({
            formatted: feature.properties.formatted,
            address_line1: feature.properties.address_line1,
            address_line2: feature.properties.address_line2,
            country: feature.properties.country,
            country_code: feature.properties.country_code,
            state: feature.properties.state,
            city: feature.properties.city,
            postcode: feature.properties.postcode,
            street: feature.properties.street,
            housenumber: feature.properties.housenumber,
            lat: feature.properties.lat,
            lon: feature.properties.lon,
            result_type: feature.properties.result_type,
            category: feature.properties.category,
            timezone: feature.properties.timezone,
            plus_code: feature.properties.plus_code,
            rank: feature.properties.rank,
          }));

          return {
            type: action,
            query: geocodeData.query,
            count: formattedResults.length,
            results: formattedResults,
          };
        }
      }

      return result.data;

    } catch (error) {
      throw new Error(`Geoapify Tool Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};
