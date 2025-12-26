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
import { type LocalTool } from './types';

export const tools: Record<string, LocalTool> = {
  [timeTool.name]: timeTool,
  [calculatorTool.name]: calculatorTool,
  [weatherTool.name]: weatherTool,
  [uuidTool.name]: uuidTool,
  [base64Tool.name]: base64Tool,
  [jsonTool.name]: jsonTool,
  [urlTool.name]: urlTool,
  [randomTool.name]: randomTool,
  [hashTool.name]: hashTool,
  [loremTool.name]: loremTool,
  [colorTool.name]: colorTool,
  [comulineTool.name]: comulineTool,
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
