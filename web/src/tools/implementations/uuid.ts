import { z } from 'zod';
import { type LocalTool } from '../types';

export const uuidTool: LocalTool = {
  name: 'generate_uuid',
  description: 'Generate a UUID (Universally Unique Identifier)',
  parameters: z.object({
    count: z.number().min(1).max(100).default(1).describe('Number of UUIDs to generate (1-100)'),
    version: z.enum(['v4']).default('v4').describe('UUID version (currently only v4 is supported)'),
  }),
  execute: ({ count = 1 }: { count?: number; version?: string }) => {
    const generateUUIDv4 = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };

    const uuids = Array.from({ length: count }, () => generateUUIDv4());

    return {
      uuids,
      count: uuids.length,
    };
  },
};
