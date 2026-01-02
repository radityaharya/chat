import { z } from 'zod';
import { type LocalTool } from '../types';

export const geolocationTool: LocalTool = {
  name: 'browser_geolocation',
  description: 'Get the user\'s current geographic location from their browser. ALWAYS use this tool FIRST when the user asks about: nearby places, current location, weather near me, directions from here, local time, or any location-based query where you need their coordinates. This will prompt the user for location permission if needed. Returns precise latitude, longitude, and accuracy.',
  parameters: z.object({
    enableHighAccuracy: z.boolean().optional().default(false).describe('Request high accuracy location using GPS. Default: false (faster, less battery).'),
    timeout: z.number().min(0).max(60000).optional().default(10000).describe('Maximum wait time in milliseconds. Default: 10000.'),
    maximumAge: z.number().min(0).optional().default(0).describe('Accept cached position age in milliseconds. Default: 0 (always fresh).'),
  }).optional().default({}),
  execute: async ({ enableHighAccuracy = false, timeout = 10000, maximumAge = 0 }) => {
    try {
      // Check if geolocation is supported
      if (!navigator.geolocation) {
        throw new Error('Geolocation is not supported by this browser');
      }

      // Request geolocation with options
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy,
            timeout,
            maximumAge,
          }
        );
      });

      // Format the response
      return {
        success: true,
        timestamp: new Date(position.timestamp).toISOString(),
        coordinates: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          altitudeAccuracy: position.coords.altitudeAccuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
        },
        // Provide helpful context
        accuracy_description: position.coords.accuracy < 100
          ? 'High accuracy (< 100m)'
          : position.coords.accuracy < 1000
            ? 'Medium accuracy (< 1km)'
            : 'Low accuracy (> 1km)',
        // Format for easy use with other tools
        formatted: {
          decimal: `${position.coords.latitude}, ${position.coords.longitude}`,
          geoapify_params: {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          },
        },
      };

    } catch (error) {
      // Handle specific geolocation errors
      if (error instanceof GeolocationPositionError) {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            throw new Error('User denied the request for geolocation. Please grant location permission in your browser settings.');
          case error.POSITION_UNAVAILABLE:
            throw new Error('Location information is unavailable. Please check your device settings and try again.');
          case error.TIMEOUT:
            throw new Error(`Location request timed out after ${timeout}ms. Try increasing the timeout or check your connection.`);
          default:
            throw new Error(`Geolocation error: ${error.message}`);
        }
      }

      throw new Error(`Browser Geolocation Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};
