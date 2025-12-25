import { z } from 'zod';

export interface LocalTool<T = any> {
  name: string;
  description: string;
  parameters: z.ZodSchema<T>;
  execute: (args: T) => Promise<any> | any;
}
