import { z } from 'zod';
import { type LocalTool } from '../types';

export const jsonTool: LocalTool = {
  name: 'json_format',
  description: 'Validate and format JSON strings',
  parameters: z.object({
    json_string: z.string().describe('The JSON string to validate and format'),
    indent: z.number().min(0).max(8).default(2).describe('Number of spaces for indentation (0-8)'),
  }),
  execute: ({ json_string, indent = 2 }: { json_string: string; indent?: number }) => {
    try {
      const parsed = JSON.parse(json_string);
      const formatted = JSON.stringify(parsed, null, indent);

      return {
        valid: true,
        formatted,
        type: Array.isArray(parsed) ? 'array' : typeof parsed,
        size: json_string.length,
        formatted_size: formatted.length,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid JSON',
        input: json_string,
      };
    }
  },
};
