import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiKey } from '@/store';

const API_BASE_URL = '/api';

export interface BackendConfig {
  name: string;
  base_url: string;
  prefix: string;
  default?: boolean;
  require_api_key?: boolean;
  api_key?: string;
  key_env_var?: string;
  api_keys?: string[];
  role_rewrites?: Record<string, string>;
  unsupported_params?: string[];
}

export interface Settings {
  listening_port: number;
  backends: BackendConfig[];
  llmrouter_api_key_env?: string;
  llmrouter_api_key?: string;
  aliases?: Record<string, string>;
}

// Fetch current settings
export function useGetSettings() {
  const apiKey = useApiKey();

  return useQuery({
    queryKey: ['settings'],
    queryFn: async (): Promise<Settings> => {
      const response = await fetch(`${API_BASE_URL}/v1/settings`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }

      return response.json();
    },
    enabled: !!apiKey,
  });
}

// Save settings
export function useSaveSettings() {
  const apiKey = useApiKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: Settings) => {
      const response = await fetch(`${API_BASE_URL}/v1/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to save settings');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate settings query to refetch
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}
