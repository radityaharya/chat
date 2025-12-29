import React from 'react';
import { UIResponse, UIResponseHeader, UIResponseContent } from '@/components/ai-elements/ui-response';
import type { GraphConfig } from '@/types/ui-response';

/**
 * Demo page showcasing all graph types supported by the UI response system
 */
export function GraphDemo() {
  // Line Chart Example
  const lineChartConfig: GraphConfig = {
    chart_type: 'line',
    title: 'Temperature Over Week',
    x_axis: { label: 'Day', data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
    y_axis: { label: '°C', min: 0, max: 35 },
    datasets: [
      {
        label: 'Temperature',
        data: [22, 24, 23, 26, 28, 27, 25],
        color: '#ef4444',
      },
    ],
  };

  // Multi-dataset Line Chart
  const multiLineChartConfig: GraphConfig = {
    chart_type: 'line',
    title: 'Sales Comparison 2023 vs 2024',
    x_axis: { data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] },
    y_axis: { label: 'Sales ($)' },
    datasets: [
      { label: '2023', data: [1000, 1200, 1500, 1800, 2200, 2500], color: '#3b82f6' },
      { label: '2024', data: [1200, 1500, 1900, 2300, 2800, 3200], color: '#10b981' },
    ],
  };

  // Bar Chart Example
  const barChartConfig: GraphConfig = {
    chart_type: 'bar',
    title: 'Product Sales Comparison',
    categories: ['Product A', 'Product B', 'Product C', 'Product D'],
    datasets: [
      {
        label: 'Units Sold',
        data: [150, 230, 180, 290],
        color: '#3b82f6',
      },
    ],
  };

  // Multi-dataset Bar Chart
  const multiBarChartConfig: GraphConfig = {
    chart_type: 'bar',
    title: 'Quarterly Revenue by Channel',
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    datasets: [
      { label: 'Online', data: [100, 120, 140, 160], color: '#3b82f6' },
      { label: 'Store', data: [80, 90, 85, 95], color: '#10b981' },
    ],
  };

  // Pie Chart Example
  const pieChartConfig: GraphConfig = {
    chart_type: 'pie',
    title: 'Market Share Distribution',
    data: [
      { label: 'Company A', value: 35, color: '#3b82f6' },
      { label: 'Company B', value: 25, color: '#10b981' },
      { label: 'Company C', value: 20, color: '#f59e0b' },
      { label: 'Others', value: 20, color: '#6b7280' },
    ],
    show_legend: true,
  };

  // Donut Chart Example
  const donutChartConfig: GraphConfig = {
    chart_type: 'donut',
    title: 'Traffic Sources',
    data: [
      { label: 'Direct', value: 30, color: '#3b82f6' },
      { label: 'Organic', value: 45, color: '#10b981' },
      { label: 'Social', value: 15, color: '#f59e0b' },
      { label: 'Referral', value: 10, color: '#ef4444' },
    ],
    show_legend: true,
  };

  // Area Chart Example
  const areaChartConfig: GraphConfig = {
    chart_type: 'area',
    title: 'Website Traffic Over Time',
    x_axis: { label: 'Time', data: ['00:00', '06:00', '12:00', '18:00', '24:00'] },
    y_axis: { label: 'Visitors' },
    datasets: [
      {
        label: 'Visitors',
        data: [100, 150, 500, 800, 200],
        color: '#3b82f6',
      },
    ],
  };

  return (
    <div className="container mx-auto p-8 space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Graph UI Response Demo</h1>
        <p className="text-muted-foreground">
          This page demonstrates all the graph types supported by the UI response system.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Line Chart */}
        <UIResponse>
          <UIResponseHeader type="graph" title="Line Chart" />
          <UIResponseContent data={lineChartConfig} type="graph" />
        </UIResponse>

        {/* Multi-dataset Line Chart */}
        <UIResponse>
          <UIResponseHeader type="graph" title="Multi-dataset Line Chart" />
          <UIResponseContent data={multiLineChartConfig} type="graph" />
        </UIResponse>

        {/* Bar Chart */}
        <UIResponse>
          <UIResponseHeader type="graph" title="Bar Chart" />
          <UIResponseContent data={barChartConfig} type="graph" />
        </UIResponse>

        {/* Multi-dataset Bar Chart */}
        <UIResponse>
          <UIResponseHeader type="graph" title="Multi-dataset Bar Chart" />
          <UIResponseContent data={multiBarChartConfig} type="graph" />
        </UIResponse>

        {/* Pie Chart */}
        <UIResponse>
          <UIResponseHeader type="graph" title="Pie Chart" />
          <UIResponseContent data={pieChartConfig} type="graph" />
        </UIResponse>

        {/* Donut Chart */}
        <UIResponse>
          <UIResponseHeader type="graph" title="Donut Chart" />
          <UIResponseContent data={donutChartConfig} type="graph" />
        </UIResponse>

        {/* Area Chart */}
        <UIResponse className="lg:col-span-2">
          <UIResponseHeader type="graph" title="Area Chart" />
          <UIResponseContent data={areaChartConfig} type="graph" />
        </UIResponse>
      </div>

      <div className="space-y-4 mt-12">
        <h2 className="text-2xl font-bold">Usage Example</h2>
        <p className="text-muted-foreground">
          To use graphs in your chat responses, use the following syntax:
        </p>
        <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
          {`<ui-response type="graph">
{
  "chart_type": "line",
  "title": "Monthly Sales Data",
  "x_axis": {"label": "Month", "data": ["Jan", "Feb", "Mar"]},
  "y_axis": {"label": "Sales ($)"},
  "datasets": [{
    "label": "2024",
    "data": [1000, 1200, 1500],
    "color": "#3b82f6"
  }]
}
</ui-response>`}
        </pre>
      </div>
    </div>
  );
}
