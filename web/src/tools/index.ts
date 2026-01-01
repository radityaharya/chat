import * as z from 'zod';
import { calculatorTool } from './implementations/calculator';
import { timeTool } from './implementations/time';
import { weatherTool } from './implementations/weather';
import { uuidTool } from './implementations/uuid';
import { base64Tool } from './implementations/base64';
import { jsonTool } from './implementations/json';
import { urlTool } from './implementations/url';
import { randomTool } from './implementations/random';
import { hashTool } from './implementations/hash';
import { loremTool } from './implementations/lorem';
import { colorTool } from './implementations/color';
import { comulineTool } from './implementations/comuline';
import { exaTool } from './implementations/exa';
import { type LocalTool } from './types';
import {
  Calculator,
  Clock,
  Cloud,
  Fingerprint,
  Code,
  FileText,
  Link,
  Shuffle,
  Palette,
  Terminal,
  Search,
  type LucideIcon
} from 'lucide-react';

export interface ClientSideTool extends LocalTool {
  icon?: LucideIcon;
}

export const tools: Record<string, ClientSideTool> = {
  [timeTool.name]: { ...timeTool, icon: Clock },
  [calculatorTool.name]: { ...calculatorTool, icon: Calculator },
  [weatherTool.name]: { ...weatherTool, icon: Cloud },
  [uuidTool.name]: { ...uuidTool, icon: Fingerprint },
  [base64Tool.name]: { ...base64Tool, icon: Code },
  [jsonTool.name]: { ...jsonTool, icon: FileText },
  [urlTool.name]: { ...urlTool, icon: Link },
  [randomTool.name]: { ...randomTool, icon: Shuffle },
  [hashTool.name]: { ...hashTool, icon: Fingerprint },
  [loremTool.name]: { ...loremTool, icon: FileText },
  [colorTool.name]: { ...colorTool, icon: Palette },
  [comulineTool.name]: { ...comulineTool, icon: Terminal },
  [exaTool.name]: { ...exaTool, icon: Search },
};

export const getToolDefinitions = () => {
  return Object.values(tools).map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.parameters),
    },
  }));
};
