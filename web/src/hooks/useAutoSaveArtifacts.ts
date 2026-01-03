import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMessages, useActiveConversationId } from '@/store';
import { extractArtifacts } from '@/lib/artifacts';
import { workspaceApi, type FileEntry } from '@/api/workspace';

export function useAutoSaveArtifacts(isStreaming: boolean) {
  const messages = useMessages();
  const activeConversationId = useActiveConversationId();
  const queryClient = useQueryClient();

  // Track processed artifact IDs to avoid duplicate uploads in session
  const processedArtifactIds = useRef<Set<string>>(new Set());

  // Track previous streaming state to detect completion
  const prevIsStreaming = useRef(isStreaming);

  useEffect(() => {
    const wasStreaming = prevIsStreaming.current;
    prevIsStreaming.current = isStreaming;

    // Only proceed if we just finished streaming
    if (activeConversationId) {
      // Look at the last message (it should be the assistant message that just finished)
      // We scan the last few messages just in case, but usually it's the last one.
      const recentMessages = messages.slice(-2);

      let newFiles: FileEntry[] = [];

      const processArtifacts = async () => {
        for (const msg of recentMessages) {
          if (msg.role !== 'assistant') continue;

          const artifacts = extractArtifacts(msg.content);

          for (const artifact of artifacts) {
            const uniqueId = `${msg.id}-${artifact.id}`;

            // Must be complete and have a title and not be processed yet
            if (!artifact.isIncomplete && artifact.title && !processedArtifactIds.current.has(uniqueId)) {
              processedArtifactIds.current.add(uniqueId);

              try {
                console.log(`[AutoSave] Uploading artifact: ${artifact.title}`);
                const blob = new Blob([artifact.code], { type: 'text/plain' });
                const file = new File([blob], artifact.title);
                await workspaceApi.waitForReady();
                const response = await workspaceApi.uploadFile(activeConversationId, file);

                console.log(`[AutoSave] Successfully saved ${artifact.title}`);

                // Collect new file entry for cache update
                newFiles.push({
                  name: response.name,
                  size: response.size,
                  mode: '-rw-r--r--',
                  is_dir: false,
                  mod_time: new Date().toISOString()
                });
              } catch (error) {
                console.error(`[AutoSave] Failed to save ${artifact.title}`, error);
                // Remove from processed so we might retry later?
                processedArtifactIds.current.delete(uniqueId);
              }
            }
          }
        }

        if (newFiles.length > 0) {
          // Optimistically update cache instead of invalidating
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
  }, [isStreaming, activeConversationId, messages, queryClient]);
}
