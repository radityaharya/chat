import { z } from 'zod';
import { type LocalTool } from '../types';

export const calculatorTool: LocalTool = {
  name: 'calculator',
  description: 'Perform basic arithmetic calculations',
  parameters: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide', 'power', 'sqrt']).describe('The operation to perform'),
    a: z.number().describe('The first operand'),
    b: z.number().optional().describe('The second operand (not needed for sqrt)'),
  }),
  execute: ({ operation, a, b }: { operation: string; a: number; b?: number }) => {
    switch (operation) {
      case 'add':
        return { result: a + (b ?? 0) };
      case 'subtract':
        return { result: a - (b ?? 0) };
      case 'multiply':
        return { result: a * (b ?? 1) };
      case 'divide':
        if (b === 0) throw new Error('Cannot divide by zero');
        return { result: a / (b ?? 1) };
      case 'power':
        return { result: Math.pow(a, b ?? 1) };
      case 'sqrt':
        return { result: Math.sqrt(a) };
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  },
};
