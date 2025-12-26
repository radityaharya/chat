import { z } from 'zod';
import { type LocalTool } from '../types';

export const randomTool: LocalTool = {
  name: 'generate_random',
  description: 'Generate random numbers, strings, or make random selections',
  parameters: z.object({
    type: z.enum(['number', 'string', 'choice']).describe('Type of random generation'),
    min: z.number().optional().describe('Minimum value for number generation'),
    max: z.number().optional().describe('Maximum value for number generation'),
    length: z.number().min(1).max(1000).optional().describe('Length for string generation'),
    charset: z.enum(['alphanumeric', 'alphabetic', 'numeric', 'hex']).optional().describe('Character set for string generation'),
    choices: z.array(z.string()).optional().describe('Array of choices to select from'),
    count: z.number().min(1).max(100).default(1).describe('Number of items to generate'),
  }),
  execute: ({ type, min = 0, max = 100, length = 16, charset = 'alphanumeric', choices, count = 1 }: {
    type: 'number' | 'string' | 'choice';
    min?: number;
    max?: number;
    length?: number;
    charset?: 'alphanumeric' | 'alphabetic' | 'numeric' | 'hex';
    choices?: string[];
    count?: number;
  }) => {
    const results: any[] = [];

    for (let i = 0; i < count; i++) {
      if (type === 'number') {
        const random = Math.floor(Math.random() * (max - min + 1)) + min;
        results.push(random);
      } else if (type === 'string') {
        const charsets = {
          alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
          alphabetic: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
          numeric: '0123456789',
          hex: '0123456789abcdef',
        };

        const chars = charsets[charset];
        let result = '';
        for (let j = 0; j < length; j++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        results.push(result);
      } else if (type === 'choice') {
        if (!choices || choices.length === 0) {
          throw new Error('Choices array is required and must not be empty for choice type');
        }
        const randomChoice = choices[Math.floor(Math.random() * choices.length)];
        results.push(randomChoice);
      }
    }

    return {
      type,
      count,
      results: count === 1 ? results[0] : results,
    };
  },
};
