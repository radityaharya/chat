import { z } from 'zod';
import { type LocalTool } from '../types';

const BASE_URL = 'http://100.101.102.100:8873/api';

interface ComulineResponse<T> {
  metadata: {
    success: boolean;
    message?: string;
  };
  data: T;
}

interface Station {
  id: string;
  name: string;
}

interface Schedule {
  id: string;
  station_id: string;
  train_id: string;
  line: string;
  route: string;
  departs_at: string;
  arrives_at: string;
}

export const comulineTool: LocalTool = {
  name: 'comuline',
  description: 'Get Indonesia Commuter Line (KRL) information. Workflow: 1. Always use "get_current_time" tool FIRST to get the current time. 2. Find station ID using "search_station" with a name (e.g. "Cisauk"). 3. Get schedule using "get_schedule" with the Station ID. 4. Get specific train route using "get_route" with Train ID. Do NOT guess station IDs.',
  parameters: z.object({
    action: z.enum(['search_station', 'get_schedule', 'get_route']).describe('Action to perform. search_station: Find station ID by name. get_schedule: Get today\'s schedule for a station. get_route: Get train route details.'),
    query: z.string().optional().describe('Search term for search_station (e.g. "Manggarai", "Cisauk").'),
    id: z.string().optional().describe('Station ID for get_schedule (e.g. "MRI"), or Train ID for get_route.'),
  }),
  execute: async ({ action, query, id }) => {
    try {
      if (action === 'search_station') {
        if (!query) throw new Error('Query is required for search_station');

        const response = await fetch(`${BASE_URL}/v1/station`);
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const result = await response.json() as ComulineResponse<Station[]>;

        if (!result.data) return [];

        const normalizedQuery = query.toLowerCase();
        const matches = result.data.filter(s =>
          s.name.toLowerCase().includes(normalizedQuery) ||
          s.id.toLowerCase().includes(normalizedQuery)
        ).map(s => ({
          id: s.id,
          name: s.name,
          details: `ID: ${s.id} - ${s.name}`
        }));

        return matches.slice(0, 10); // Limit results
      }

      if (action === 'get_schedule') {
        if (!id) throw new Error('Station ID is required for get_schedule');
        const response = await fetch(`${BASE_URL}/v1/schedule/${id}`);
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const result = await response.json() as ComulineResponse<Schedule[]>;

        if (!result.data) return "No schedule data found.";

        // Filter for local today
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

        const schedules = result.data.filter(s => {
          const departure = new Date(s.departs_at);
          return departure >= startOfDay && departure < endOfDay;
        }).sort((a, b) => new Date(a.departs_at).getTime() - new Date(b.departs_at).getTime());

        // Also return upcoming trains from "now" specifically to be helpful
        const upcoming = schedules.filter(s => new Date(s.departs_at) > now).slice(0, 15);

        if (upcoming.length === 0 && schedules.length === 0) {
          return `No trains scheduled for today (${now.toLocaleDateString()}). The API might be returning outdated or future data only.`;
        }

        const results = upcoming.length > 0 ? upcoming : schedules.slice(0, 15);
        return results.map((s) => ({
          ...s,
          departs_at: new Date(s.departs_at).toLocaleString(),
          arrives_at: new Date(s.arrives_at).toLocaleString(),
        }));
      }

      if (action === 'get_route') {
        if (!id) throw new Error('Train ID is required for get_route');
        const response = await fetch(`${BASE_URL}/v1/route/${id}`);
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const result = await response.json();
        return result.data;
      }

      throw new Error(`Unknown action: ${action}`);

    } catch (error) {
      throw new Error(`Comuline Tool Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};
