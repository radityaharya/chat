import React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { GraphConfig } from '@/types/ui-response';
import { cn } from '@/lib/utils';

interface GraphRendererProps {
  config: GraphConfig;
  className?: string;
}

const DEFAULT_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
];

export function GraphRenderer({ config, className }: GraphRendererProps) {
  const {
    chart_type,
    title,
    x_axis,
    y_axis,
    datasets = [],
    data = [],
    categories = [],
    show_legend = true,
    show_grid = true,
  } = config;

  // Prepare data for Recharts
  const prepareData = () => {
    if (chart_type === 'pie' || chart_type === 'donut') {
      return data.map((item, index) => ({
        name: item.label,
        value: item.value,
        fill: item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
      }));
    }

    if (chart_type === 'bar' && categories.length > 0) {
      // For bar charts with categories
      const chartData = categories.map((category, index) => {
        const dataPoint: any = { name: category };
        datasets.forEach((dataset) => {
          dataPoint[dataset.label] = dataset.data[index];
        });
        return dataPoint;
      });
      return chartData;
    }

    // For line, area charts
    if (x_axis?.data) {
      const chartData = x_axis.data.map((xValue, index) => {
        const dataPoint: any = { name: xValue };
        datasets.forEach((dataset) => {
          dataPoint[dataset.label] = dataset.data[index];
        });
        return dataPoint;
      });
      return chartData;
    }

    return [];
  };

  const chartData = prepareData();

  const renderChart = () => {
    switch (chart_type) {
      case 'line':
        return (
          <LineChart data={chartData}>
            {show_grid && <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />}
            <XAxis
              dataKey="name"
              label={x_axis?.label ? { value: x_axis.label, position: 'insideBottom', offset: -5 } : undefined}
              className="text-xs"
            />
            <YAxis
              domain={y_axis?.min !== undefined || y_axis?.max !== undefined ? [y_axis?.min || 'auto', y_axis?.max || 'auto'] : undefined}
              label={y_axis?.label ? { value: y_axis.label, angle: -90, position: 'insideLeft' } : undefined}
              className="text-xs"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
            />
            {show_legend && <Legend />}
            {datasets.map((dataset, index) => (
              <Line
                key={dataset.label}
                type="monotone"
                dataKey={dataset.label}
                stroke={dataset.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                strokeWidth={2}
                dot={dataset.show_points !== false}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        );

      case 'bar':
        return (
          <BarChart data={chartData}>
            {show_grid && <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />}
            <XAxis
              dataKey="name"
              label={x_axis?.label ? { value: x_axis.label, position: 'insideBottom', offset: -5 } : undefined}
              className="text-xs"
            />
            <YAxis
              domain={y_axis?.min !== undefined || y_axis?.max !== undefined ? [y_axis?.min || 'auto', y_axis?.max || 'auto'] : undefined}
              label={y_axis?.label ? { value: y_axis.label, angle: -90, position: 'insideLeft' } : undefined}
              className="text-xs"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
            />
            {show_legend && <Legend />}
            {datasets.map((dataset, index) => (
              <Bar
                key={dataset.label}
                dataKey={dataset.label}
                fill={dataset.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        );

      case 'area':
        return (
          <AreaChart data={chartData}>
            {show_grid && <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />}
            <XAxis
              dataKey="name"
              label={x_axis?.label ? { value: x_axis.label, position: 'insideBottom', offset: -5 } : undefined}
              className="text-xs"
            />
            <YAxis
              domain={y_axis?.min !== undefined || y_axis?.max !== undefined ? [y_axis?.min || 'auto', y_axis?.max || 'auto'] : undefined}
              label={y_axis?.label ? { value: y_axis.label, angle: -90, position: 'insideLeft' } : undefined}
              className="text-xs"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
            />
            {show_legend && <Legend />}
            {datasets.map((dataset, index) => (
              <Area
                key={dataset.label}
                type="monotone"
                dataKey={dataset.label}
                stroke={dataset.line_color || dataset.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                fill={dataset.fill_color || dataset.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                fillOpacity={0.6}
              />
            ))}
          </AreaChart>
        );

      case 'pie':
      case 'donut':
        return (
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              outerRadius={chart_type === 'donut' ? 100 : 120}
              innerRadius={chart_type === 'donut' ? 60 : 0}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
            />
            {show_legend && <Legend />}
          </PieChart>
        );

      default:
        return (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Unsupported chart type: {chart_type}
          </div>
        );
    }
  };

  return (
    <div className={cn('w-full', className)}>
      {title && (
        <h3 className="text-lg font-semibold text-center mb-4 text-foreground">
          {title}
        </h3>
      )}
      <ResponsiveContainer width="100%" height={config.height || 400}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}
