import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workspaceApi } from '../api/workspace';
import { useUIStore } from '../store';

export function useWorkspaceFiles() {
  // Direct store access - avoids subscription for just reading a simple value
  const activeConversationId = useUIStore((s) => s.activeConversationId);
  const queryClient = useQueryClient();

  const queryKey = ['workspace-files', activeConversationId];

  const { data: files, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => {
      if (!activeConversationId) return Promise.resolve([]);
      return workspaceApi.listFiles(activeConversationId);
    },
    enabled: !!activeConversationId,
    staleTime: 3000, // Consider data fresh for 3 seconds to avoid redundant fetches
    refetchInterval: 10000, // Poll every 10 seconds (was 5, less aggressive)
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!activeConversationId) throw new Error("No active conversation");
      return workspaceApi.uploadFile(activeConversationId, file);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    files: files || [],
    isLoading,
    error,
    uploadFile: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
  };
}

