import { z } from 'zod';
import { type LocalTool } from '../types';

export const base64Tool: LocalTool = {
  name: 'base64_convert',
  description: 'Encode or decode base64 strings',
  parameters: z.object({
    operation: z.enum(['encode', 'decode']).describe('Operation to perform'),
    input: z.string().describe('The string to encode or decode'),
  }),
  execute: ({ operation, input }: { operation: 'encode' | 'decode'; input: string }) => {
    try {
      if (operation === 'encode') {
        const encoded = btoa(input);
        return {
          operation: 'encode',
          input,
          output: encoded,
        };
      } else {
        const decoded = atob(input);
        return {
          operation: 'decode',
          input,
          output: decoded,
        };
      }
    } catch (error) {
      throw new Error(`Failed to ${operation}: ${error instanceof Error ? error.message : 'Invalid input'}`);
    }
  },
};
