import React from 'react';
import { Cloud, CloudRain, CloudSnow, CloudDrizzle, CloudFog, Sun, CloudSun, Wind, Droplets, Gauge, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GraphRenderer } from './graph-renderer';
import type { GraphConfig } from '@/types/ui-response';

interface WeatherData {
  location: string;
  current: {
    temperature: number;
    feels_like: number;
    humidity: number;
    wind_speed: number;
    wind_direction?: number;
    precipitation: number;
    weather_code: number;
    conditions: string;
    icon: string;
  };
  hourly_forecast?: Array<{
    time: string;
    temperature: number;
    precipitation_probability: number;
    weather_code: number;
    conditions: string;
    icon: string;
  }>;
  timezone?: string;
  units: {
    temperature: string;
    wind_speed: string;
    precipitation: string;
  };
}

interface WeatherRendererProps {
  data: WeatherData;
  className?: string;
  showGraphs?: boolean; // Optional: show detailed graphs (default: false)
}

// Weather icon mapping
const WeatherIcon = ({ iconName, className }: { iconName: string; className?: string }) => {
  const iconMap: Record<string, React.ReactNode> = {
    'clear-day': <Sun className={cn('w-12 h-12 text-yellow-500', className)} />,
    'partly-cloudy': <CloudSun className={cn('w-12 h-12 text-yellow-400', className)} />,
    'cloudy': <Cloud className={cn('w-12 h-12 text-gray-400', className)} />,
    'fog': <CloudFog className={cn('w-12 h-12 text-gray-500', className)} />,
    'drizzle': <CloudDrizzle className={cn('w-12 h-12 text-blue-400', className)} />,
    'rain': <CloudRain className={cn('w-12 h-12 text-blue-500', className)} />,
    'rain-heavy': <CloudRain className={cn('w-12 h-12 text-blue-600', className)} />,
    'rain-showers': <CloudRain className={cn('w-12 h-12 text-blue-500', className)} />,
    'snow': <CloudSnow className={cn('w-12 h-12 text-blue-200', className)} />,
    'snow-heavy': <CloudSnow className={cn('w-12 h-12 text-blue-300', className)} />,
    'snow-showers': <CloudSnow className={cn('w-12 h-12 text-blue-200', className)} />,
    'thunderstorm': <Zap className={cn('w-12 h-12 text-yellow-500', className)} />,
  };

  return iconMap[iconName] || <Cloud className={cn('w-12 h-12 text-gray-400', className)} />;
};

export function WeatherRenderer({ data, className, showGraphs = false }: WeatherRendererProps) {
  const { location, current, hourly_forecast, units } = data;

  // Prepare temperature graph data
  const temperatureGraphConfig: GraphConfig | null = hourly_forecast && hourly_forecast.length > 0 ? {
    chart_type: 'area',
    title: '24-Hour Temperature Forecast',
    x_axis: {
      label: 'Time',
      data: hourly_forecast.map(h => h.time),
    },
    y_axis: {
      label: `Temperature (${units.temperature})`,
      min: Math.floor(Math.min(...hourly_forecast.map(h => h.temperature)) - 2),
      max: Math.ceil(Math.max(...hourly_forecast.map(h => h.temperature)) + 2),
    },
    datasets: [{
      label: 'Temperature',
      data: hourly_forecast.map(h => h.temperature),
      color: '#ef4444',
      fill_color: '#ef4444',
      line_color: '#dc2626',
    }],
    show_legend: false,
    show_grid: true,
    height: 300,
  } : null;

  // Prepare precipitation probability graph
  const precipitationGraphConfig: GraphConfig | null = hourly_forecast && hourly_forecast.length > 0 ? {
    chart_type: 'bar',
    title: 'Precipitation Probability',
    categories: hourly_forecast.map(h => h.time),
    y_axis: {
      label: 'Probability (%)',
      min: 0,
      max: 100,
    },
    datasets: [{
      label: 'Rain Chance',
      data: hourly_forecast.map(h => h.precipitation_probability),
      color: '#3b82f6',
    }],
    show_legend: false,
    show_grid: true,
    height: 250,
  } : null;

  return (
    <div className={cn('w-full space-y-6', className)}>
      {/* Current Weather Card */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 p-6 shadow-lg">
        <div className="relative z-10">
          {/* Location */}
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-foreground">{location}</h2>
            <p className="text-sm text-muted-foreground">{current.conditions}</p>
          </div>

          {/* Main Temperature Display */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              <WeatherIcon iconName={current.icon} />
              <div>
                <div className="text-6xl font-bold text-foreground">
                  {Math.round(current.temperature)}
                  <span className="text-3xl text-muted-foreground">{units.temperature}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Feels like {Math.round(current.feels_like)}{units.temperature}
                </p>
              </div>
            </div>
          </div>

          {/* Weather Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2 bg-background/50 rounded-lg p-3 backdrop-blur-sm">
              <Wind className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Wind</p>
                <p className="text-sm font-semibold text-foreground">
                  {current.wind_speed} {units.wind_speed}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-background/50 rounded-lg p-3 backdrop-blur-sm">
              <Droplets className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Humidity</p>
                <p className="text-sm font-semibold text-foreground">{current.humidity}%</p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-background/50 rounded-lg p-3 backdrop-blur-sm">
              <CloudRain className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Precipitation</p>
                <p className="text-sm font-semibold text-foreground">
                  {current.precipitation} {units.precipitation}
                </p>
              </div>
            </div>

            {current.wind_direction !== undefined && (
              <div className="flex items-center gap-2 bg-background/50 rounded-lg p-3 backdrop-blur-sm">
                <Gauge className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Wind Dir</p>
                  <p className="text-sm font-semibold text-foreground">{current.wind_direction}°</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-200/20 dark:bg-blue-500/10 rounded-full blur-3xl -z-0" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-cyan-200/20 dark:bg-cyan-500/10 rounded-full blur-3xl -z-0" />
      </div>

      {/* Hourly Forecast Graphs - Only show when requested */}
      {showGraphs && temperatureGraphConfig && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <GraphRenderer config={temperatureGraphConfig} />
        </div>
      )}

      {showGraphs && precipitationGraphConfig && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <GraphRenderer config={precipitationGraphConfig} />
        </div>
      )}

      {/* Hourly Forecast Cards (first 8 hours) */}
      {hourly_forecast && hourly_forecast.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4 text-foreground">Hourly Forecast</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {hourly_forecast.slice(0, 8).map((hour, index) => (
              <div
                key={index}
                className="flex flex-col items-center gap-2 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <p className="text-xs font-medium text-muted-foreground">{hour.time}</p>
                <WeatherIcon iconName={hour.icon} className="w-8 h-8" />
                <p className="text-sm font-bold text-foreground">
                  {Math.round(hour.temperature)}{units.temperature}
                </p>
                {hour.precipitation_probability > 0 && (
                  <div className="flex items-center gap-1">
                    <Droplets className="w-3 h-3 text-blue-500" />
                    <p className="text-xs text-blue-500">{hour.precipitation_probability}%</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
