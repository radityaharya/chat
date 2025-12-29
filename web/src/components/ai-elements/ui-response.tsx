import React from 'react';
import { cn } from '@/lib/utils';
import { Sparkles, Table2, List, FileJson, Box, BarChart3, CloudSun } from 'lucide-react';
import { GraphRenderer } from './graph-renderer';
import { WeatherRenderer } from './weather-renderer';
import type { GraphConfig } from '@/types/ui-response';

interface UIResponseProps {
  children: React.ReactNode;
  className?: string;
}

export function UIResponse({ children, className }: UIResponseProps) {
  return (
    <div className={cn('rounded-lg border border-terminal-border bg-terminal-surface/50 overflow-hidden', className)}>
      {children}
    </div>
  );
}

interface UIResponseHeaderProps {
  type?: string;
  title?: string;
  className?: string;
}

export function UIResponseHeader({ type = 'data', title, className }: UIResponseHeaderProps) {
  const getIcon = () => {
    switch (type.toLowerCase()) {
      case 'table':
        return <Table2 className="size-4" />;
      case 'list':
        return <List className="size-4" />;
      case 'json':
        return <FileJson className="size-4" />;
      case 'card':
        return <Box className="size-4" />;
      case 'graph':
        return <BarChart3 className="size-4" />;
      case 'weather':
        return <CloudSun className="size-4" />;
      default:
        return <Sparkles className="size-4" />;
    }
  };

  const getTitle = () => {
    if (title) return title;
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  return (
    <div className={cn('flex items-center gap-2 px-4 py-2 border-b border-terminal-border bg-terminal-surface/80', className)}>
      <span className="text-terminal-green">{getIcon()}</span>
      <span className="text-sm font-medium text-terminal-text">{getTitle()}</span>
    </div>
  );
}

interface UIResponseContentProps {
  data: any;
  type?: string;
  className?: string;
}

export function UIResponseContent({ data, type = 'data', className }: UIResponseContentProps) {
  const renderContent = () => {
    // If data is a string, just display it
    if (typeof data === 'string') {
      return <pre className="text-sm whitespace-pre-wrap font-mono text-terminal-text">{data}</pre>;
    }

    // Handle weather type
    if (type === 'weather') {
      return <WeatherRenderer data={data} />;
    }

    // Handle graph type
    if (type === 'graph') {
      return <GraphRenderer config={data as GraphConfig} />;
    }

    // Handle table type
    if (type === 'table' && data.headers && data.rows) {
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-terminal-border">
                {data.headers.map((header: string, i: number) => (
                  <th key={i} className="px-3 py-2 text-left font-medium text-terminal-green">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row: any[], i: number) => (
                <tr key={i} className="border-b border-terminal-border/30 last:border-0 hover:bg-terminal-surface/50">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2 text-terminal-text">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // Handle list type
    if (type === 'list' && Array.isArray(data)) {
      return (
        <ul className="space-y-2 text-sm">
          {data.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-terminal-green mt-0.5">▸</span>
              <span className="text-terminal-text">{typeof item === 'object' ? JSON.stringify(item) : item}</span>
            </li>
          ))}
        </ul>
      );
    }

    // Handle card type with key-value pairs - IMPROVED LAYOUT
    if (type === 'card' && typeof data === 'object' && !Array.isArray(data)) {
      return (
        <div className="space-y-3 text-sm">
          {Object.entries(data).map(([key, value]) => (
            <div key={key} className="flex flex-col gap-1">
              <span className="text-terminal-green font-medium text-xs uppercase tracking-wide">
                {key}
              </span>
              <span className="text-terminal-text font-mono">
                {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
              </span>
            </div>
          ))}
        </div>
      );
    }

    // Default: JSON display
    return (
      <pre className="text-sm overflow-x-auto text-terminal-text">
        <code>{JSON.stringify(data, null, 2)}</code>
      </pre>
    );
  };

  return (
    <div className={cn('p-4', className)}>
      {renderContent()}
    </div>
  );
}
