export interface UIResponseData {
  id: string;
  type?: string; // e.g., 'json', 'table', 'list', 'card', 'data', 'graph', 'weather'
  content: string;
  parsed?: any; // Parsed content based on type
}

export interface ParsedUIResponse {
  uiResponses: UIResponseData[];
  cleanedContent: string;
}

// Graph/Chart specific types
export interface GraphAxis {
  label?: string;
  data?: string[] | number[];
  min?: number;
  max?: number;
}

export interface GraphDataset {
  label: string;
  data: number[];
  color?: string;
  fill_color?: string;
  line_color?: string;
  line_style?: 'solid' | 'dashed' | 'dotted';
  show_points?: boolean;
  point_size?: number;
  colors?: string[]; // For bar charts with multiple colors
}

export interface ScatterPoint {
  x: number;
  y: number;
}

export interface ScatterDataset {
  label: string;
  points: ScatterPoint[];
  color?: string;
  point_size?: number;
}

export interface PieDataItem {
  label: string;
  value: number;
  color?: string;
}

export interface GraphConfig {
  chart_type: 'line' | 'bar' | 'pie' | 'scatter' | 'area' | 'donut';
  title?: string;
  width?: number;
  height?: number;
  x_axis?: GraphAxis;
  y_axis?: GraphAxis;
  datasets?: GraphDataset[];
  scatter_datasets?: ScatterDataset[];
  data?: PieDataItem[]; // For pie/donut charts
  categories?: string[]; // For bar charts
  orientation?: 'vertical' | 'horizontal';
  stacked?: boolean;
  show_legend?: boolean;
  legend_position?: 'top' | 'bottom' | 'left' | 'right';
  show_grid?: boolean;
  show_percentages?: boolean;
  theme?: 'light' | 'dark';
}
