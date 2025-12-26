import { z } from 'zod';
import { type LocalTool } from '../types';

export const urlTool: LocalTool = {
  name: 'parse_url',
  description: 'Parse and analyze URLs to extract components',
  parameters: z.object({
    url: z.string().describe('The URL to parse'),
  }),
  execute: ({ url }: { url: string }) => {
    try {
      const parsed = new URL(url);
      const params: Record<string, string> = {};

      parsed.searchParams.forEach((value, key) => {
        params[key] = value;
      });

      return {
        original: url,
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? '443' : '80'),
        pathname: parsed.pathname,
        search: parsed.search,
        hash: parsed.hash,
        origin: parsed.origin,
        parameters: Object.keys(params).length > 0 ? params : null,
      };
    } catch (error) {
      throw new Error(`Invalid URL: ${error instanceof Error ? error.message : 'Failed to parse URL'}`);
    }
  },
};
