import { z } from 'zod';
import { type LocalTool } from '../types';

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

// Map weather codes to icon identifiers
const weatherIcons: Record<number, string> = {
  0: 'clear-day',
  1: 'clear-day',
  2: 'partly-cloudy',
  3: 'cloudy',
  45: 'fog',
  48: 'fog',
  51: 'drizzle',
  53: 'drizzle',
  55: 'drizzle',
  61: 'rain',
  63: 'rain',
  65: 'rain-heavy',
  71: 'snow',
  73: 'snow',
  75: 'snow-heavy',
  77: 'snow',
  80: 'rain-showers',
  81: 'rain-showers',
  82: 'rain-showers',
  85: 'snow-showers',
  86: 'snow-showers',
  95: 'thunderstorm',
  96: 'thunderstorm',
  99: 'thunderstorm',
};

export const weatherTool: LocalTool = {
  name: 'get_weather',
  description: 'Get current weather and 24-hour forecast for a location using the Open-Meteo API',
  parameters: z.object({
    latitude: z.number().min(-90).max(90).describe('Latitude of the location'),
    longitude: z.number().min(-180).max(180).describe('Longitude of the location'),
    location_name: z.string().optional().describe('Optional name of the location for reference'),
  }),
  execute: async ({ latitude, longitude, location_name }: { latitude: number; longitude: number; location_name?: string }) => {
    try {
      // Fetch both current weather and hourly forecast for next 24 hours
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,precipitation_probability,weather_code&timezone=auto&forecast_days=2`
      );

      if (!response.ok) {
        throw new Error(`Weather API error: ${response.statusText}`);
      }

      const data = await response.json();

      // Get current hour index
      const currentTime = new Date(data.current.time);
      const currentHourIndex = data.hourly.time.findIndex((time: string) => new Date(time) >= currentTime);

      // Get next 24 hours of forecast data
      const hourlyForecast = [];
      for (let i = 0; i < 24 && currentHourIndex + i < data.hourly.time.length; i++) {
        const index = currentHourIndex + i;
        const time = new Date(data.hourly.time[index]);
        hourlyForecast.push({
          time: time.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
          temperature: data.hourly.temperature_2m[index],
          precipitation_probability: data.hourly.precipitation_probability[index] || 0,
          weather_code: data.hourly.weather_code[index],
          conditions: weatherCodes[data.hourly.weather_code[index]] || 'Unknown',
          icon: weatherIcons[data.hourly.weather_code[index]] || 'unknown',
        });
      }

      return {
        location: location_name || `${latitude}, ${longitude}`,
        current: {
          temperature: data.current.temperature_2m,
          feels_like: data.current.apparent_temperature,
          humidity: data.current.relative_humidity_2m,
          wind_speed: data.current.wind_speed_10m,
          wind_direction: data.current.wind_direction_10m,
          precipitation: data.current.precipitation,
          weather_code: data.current.weather_code,
          conditions: weatherCodes[data.current.weather_code] || 'Unknown',
          icon: weatherIcons[data.current.weather_code] || 'unknown',
        },
        hourly_forecast: hourlyForecast,
        timezone: data.timezone,
        units: {
          temperature: '°C',
          wind_speed: 'km/h',
          precipitation: 'mm',
        },
      };
    } catch (error) {
      throw new Error(`Failed to fetch weather: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};
