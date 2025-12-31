import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiKey, useSetSelectedModel } from '@/store';

const API_BASE_URL = '/api';

interface UserConfig {
  user_id: number;
  default_model: string;
  data: any;
}

// Fetch user config
export function useConfig() {
  const apiKey = useApiKey();
  const setSelectedModel = useSetSelectedModel();

  return useQuery({
    queryKey: ['user-config'],
    queryFn: async (): Promise<UserConfig> => {
      const response = await fetch(`${API_BASE_URL}/v1/user/me/config`, {
        method: 'GET',
        headers: apiKey ? {
          'Authorization': `Bearer ${apiKey}`,
        } : {},
        credentials: 'include',
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('Fetch config error:', response.status, text);
        throw new Error(`Failed to fetch config: ${response.status} ${text}`);
      }

      const data = await response.json();

      // Update store with fetched config
      if (data.default_model) {
        setSelectedModel(data.default_model);
      }

      return data;
    },
    enabled: true, // Optimistic fetching, relying on backend auth check
    retry: false,
  });
}

// Update user config
export function useUpdateConfig() {
  const apiKey = useApiKey();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: Partial<UserConfig>) => {
      const response = await fetch(`${API_BASE_URL}/v1/user/me/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('Update config error:', response.status, text);
        throw new Error(`Failed to update config: ${response.status} ${text}`);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-config'] });
    },
  });
}
