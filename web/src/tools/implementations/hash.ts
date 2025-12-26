import { z } from 'zod';
import { type LocalTool } from '../types';

export const hashTool: LocalTool = {
  name: 'hash_string',
  description: 'Generate hash values for strings using various algorithms',
  parameters: z.object({
    input: z.string().describe('The string to hash'),
    algorithm: z.enum(['sha1', 'sha256']).default('sha256').describe('Hash algorithm to use'),
  }),
  execute: async ({ input, algorithm = 'sha256' }: { input: string; algorithm?: 'sha1' | 'sha256' }) => {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(input);

      const algoMap = {
        'sha1': 'SHA-1',
        'sha256': 'SHA-256',
      };

      const hashBuffer = await crypto.subtle.digest(algoMap[algorithm], data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      return {
        algorithm,
        input_length: input.length,
        hash: hashHex,
      };
    } catch (error) {
      throw new Error(`Failed to generate hash: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};
