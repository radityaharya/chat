import { z } from 'zod';
import { type LocalTool } from '../types';

export const weatherTool: LocalTool = {
  name: 'get_weather',
  description: 'Get current weather information for a location using the Open-Meteo API',
  parameters: z.object({
    latitude: z.number().min(-90).max(90).describe('Latitude of the location'),
    longitude: z.number().min(-180).max(180).describe('Longitude of the location'),
    location_name: z.string().optional().describe('Optional name of the location for reference'),
  }),
  execute: async ({ latitude, longitude, location_name }: { latitude: number; longitude: number; location_name?: string }) => {
    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto`
      );

      if (!response.ok) {
        throw new Error(`Weather API error: ${response.statusText}`);
      }

      const data = await response.json();

      const weatherCodes: Record<number, string> = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Foggy',
        48: 'Depositing rime fog',
        51: 'Light drizzle',
        53: 'Moderate drizzle',
        55: 'Dense drizzle',
        61: 'Slight rain',
        63: 'Moderate rain',
        65: 'Heavy rain',
        71: 'Slight snow',
        73: 'Moderate snow',
        75: 'Heavy snow',
        77: 'Snow grains',
        80: 'Slight rain showers',
        81: 'Moderate rain showers',
        82: 'Violent rain showers',
        85: 'Slight snow showers',
        86: 'Heavy snow showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with slight hail',
        99: 'Thunderstorm with heavy hail',
      };

      return {
        location: location_name || `${latitude}, ${longitude}`,
        temperature: `${data.current.temperature_2m}°C`,
        feels_like: `${data.current.apparent_temperature}°C`,
        humidity: `${data.current.relative_humidity_2m}%`,
        wind_speed: `${data.current.wind_speed_10m} km/h`,
        precipitation: `${data.current.precipitation} mm`,
        conditions: weatherCodes[data.current.weather_code] || 'Unknown',
        timezone: data.timezone,
      };
    } catch (error) {
      throw new Error(`Failed to fetch weather: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};
