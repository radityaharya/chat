import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useSetApiKey } from '@/store';

const API_BASE_URL = '/api';

interface User {
  id: number;
  username: string;
}

interface AuthResponse {
  user: User;
}

interface SetupStatusResponse {
  needs_setup: boolean;
}

interface APIKey {
  id: number;
  user_id: number;
  name: string;
  key?: string; // Only present when creating
  last_used_at?: string;
  created_at: string;
}

export function useCheckSetup() {
  return useQuery({
    queryKey: ['auth', 'setup'],
    queryFn: async (): Promise<SetupStatusResponse> => {
      const response = await fetch(`${API_BASE_URL}/v1/auth/setup`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to check setup status');
      }

      return response.json();
    },
    retry: false,
  });
}

export function useInitialSetup() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const response = await fetch(`${API_BASE_URL}/v1/auth/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to create user');
      }

      return response.json() as Promise<AuthResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] });
      navigate({ to: '/' });
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const response = await fetch(`${API_BASE_URL}/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Login failed');
      }

      return response.json() as Promise<AuthResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] });
      navigate({ to: '/' });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const setApiKey = useSetApiKey();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE_URL}/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Logout failed');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] });
      setApiKey(null);
      navigate({ to: '/login' });
    },
  });
}

export function useCheckAuth() {
  return useQuery({
    queryKey: ['auth', 'check'],
    queryFn: async (): Promise<{ authenticated: boolean; user?: User }> => {
      const response = await fetch(`${API_BASE_URL}/v1/auth/check`, {
        credentials: 'include',
      });

      if (!response.ok) {
        return { authenticated: false };
      }

      const data = await response.json();
      return { authenticated: data.authenticated, user: data.user };
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCreateAPIKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const response = await fetch(`${API_BASE_URL}/v1/auth/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to create API key');
      }

      return response.json() as Promise<APIKey>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'api-keys'] });
    },
  });
}

export function useAPIKeys() {
  return useQuery({
    queryKey: ['auth', 'api-keys'],
    queryFn: async (): Promise<APIKey[]> => {
      const response = await fetch(`${API_BASE_URL}/v1/auth/api-keys`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch API keys');
      }

      return response.json();
    },
  });
}

export function useDeleteAPIKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`${API_BASE_URL}/v1/auth/api-keys`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to delete API key');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'api-keys'] });
    },
  });
}
