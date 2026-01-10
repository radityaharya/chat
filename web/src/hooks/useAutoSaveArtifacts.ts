import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMessages, useActiveConversationId } from '@/store';
import { extractArtifacts } from '@/lib/artifacts';
import { workspaceApi, type FileEntry } from '@/api/workspace';

export function useAutoSaveArtifacts(isStreaming: boolean) {
  const messages = useMessages();
  const activeConversationId = useActiveConversationId();
  const queryClient = useQueryClient();

  const processedArtifactIds = useRef<Set<string>>(new Set());

  const prevIsStreaming = useRef(isStreaming);

  useEffect(() => {
    const wasStreaming = prevIsStreaming.current;
    prevIsStreaming.current = isStreaming;

    if (!wasStreaming || isStreaming) return;

    if (activeConversationId) {
      const recentMessages = messages.slice(-2);
      let newFiles: FileEntry[] = [];

      const processArtifacts = async () => {
        for (const msg of recentMessages) {
          if (msg.role !== 'assistant') continue;

          const artifacts = extractArtifacts(msg.content);

          for (const artifact of artifacts) {
            const uniqueId = `${msg.id}-${artifact.id}`;

            if (!artifact.isIncomplete && artifact.title && !processedArtifactIds.current.has(uniqueId)) {
              processedArtifactIds.current.add(uniqueId);

              try {
                const blob = new Blob([artifact.code], { type: 'text/plain' });
                const file = new File([blob], artifact.title);
                await workspaceApi.waitForReady();
                const response = await workspaceApi.uploadFile(activeConversationId, file);

                newFiles.push({
                  name: response.name,
                  size: response.size,
                  mode: '-rw-r--r--',
                  is_dir: false,
                  mod_time: new Date().toISOString()
                });
              } catch (error) {
                processedArtifactIds.current.delete(uniqueId);
              }
            }
          }
        }

        if (newFiles.length > 0) {
          const queryKey = ['workspace-files', activeConversationId];
          queryClient.setQueryData<FileEntry[]>(queryKey, (oldFiles) => {
            if (!oldFiles) return newFiles;

            const mergedFiles = [...oldFiles];
            for (const newFile of newFiles) {
              const index = mergedFiles.findIndex(f => f.name === newFile.name);
              if (index !== -1) {
                mergedFiles[index] = newFile;
              } else {
                mergedFiles.push(newFile);
              }
            }
            return mergedFiles;
          });
        }
      };

      processArtifacts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, activeConversationId, queryClient]);
}
