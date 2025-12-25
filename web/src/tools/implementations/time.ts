import { z } from 'zod';
import { type LocalTool } from '../types';

export const timeTool: LocalTool = {
  name: 'get_current_time',
  description: 'Get the current local time',
  parameters: z.object({}),
  execute: () => {
    return {
      time: new Date().toLocaleTimeString(),
      date: new Date().toLocaleDateString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  },
};
