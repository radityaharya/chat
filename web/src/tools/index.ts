import * as z from 'zod';
import { calculatorTool } from './implementations/calculator';
import { timeTool } from './implementations/time';
import { type LocalTool } from './types';

export const tools: Record<string, LocalTool> = {
  [timeTool.name]: timeTool,
  [calculatorTool.name]: calculatorTool,
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
