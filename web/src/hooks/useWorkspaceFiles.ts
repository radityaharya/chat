import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workspaceApi } from '../api/workspace';
import { useActiveConversationId } from '../store';

export function useWorkspaceFiles() {
  const activeConversationId = useActiveConversationId();
  const queryClient = useQueryClient();

  const queryKey = ['workspace-files', activeConversationId];

  const { data: files, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => {
      if (!activeConversationId) return Promise.resolve([]);
      return workspaceApi.listFiles(activeConversationId);
    },
    enabled: !!activeConversationId,
    refetchInterval: 5000, // Poll every 5 seconds to keep in sync
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
