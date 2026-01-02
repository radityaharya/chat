import { useEffect, useRef } from 'react';
import { useMessages, useActiveConversationId } from '@/store';
import { extractArtifacts } from '@/lib/artifacts';
import { workspaceApi } from '@/api/workspace';
import { useSendMessage } from './useChat';


export function useAutoSaveArtifacts() {
  const messages = useMessages();
  const activeConversationId = useActiveConversationId();
  const { isStreaming } = useSendMessage();

  // Track processed artifact IDs to avoid duplicate uploads in session
  const processedArtifactIds = useRef<Set<string>>(new Set());

  // Track processed message IDs to initialization
  const processedMessageIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  // Initialize with existing messages on mount so we don't re-upload old stuff
  // CRITICAL: This should only run ONCE on mount, not on every message update!
  useEffect(() => {
    console.log('[PERF] useAutoSaveArtifacts: Init effect running');
    if (!initialized.current) {
      // Get current messages at mount time
      messages.forEach(msg => {
        if (msg.role === 'assistant' && !msg.streaming) {
          processedMessageIds.current.add(msg.id);
          const artifacts = extractArtifacts(msg.content);
          artifacts.forEach(artifact => {
            processedArtifactIds.current.add(artifact.id);
          });
        }
      });
      initialized.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run ONLY once on mount

  // Process artifacts only when streaming completes
  useEffect(() => {
    console.log('[PERF] useAutoSaveArtifacts: Process effect triggered', { isStreaming, hasActiveConv: !!activeConversationId });
    // Only process when streaming has stopped
    if (isStreaming || !activeConversationId) return;

    // When streaming stops, process all messages
    messages.forEach(async (msg) => {
      // We only care about assistant messages
      if (msg.role !== 'assistant') return;

      // We only care if message is NOT streaming (complete)
      if (msg.streaming) return;

      const artifacts = extractArtifacts(msg.content);

      for (const artifact of artifacts) {
        // Must be complete and have a title (filename)
        if (!artifact.isIncomplete && artifact.title && !processedArtifactIds.current.has(artifact.id)) {
          // It's a candidate for auto-save
          processedArtifactIds.current.add(artifact.id);

          try {
            const blob = new Blob([artifact.code], { type: 'text/plain' });
            const file = new File([blob], artifact.title);
            console.log(`[AutoSave] Uploading artifact: ${artifact.title}`);
            await workspaceApi.waitForReady();
            await workspaceApi.uploadFile(activeConversationId, file);
            // Could add toast here
          } catch (error) {
            console.error(`[AutoSave] Failed to save ${artifact.title}`, error);
            // Remove from processed so we might retry later? 
            // Or better to leave it to avoid spamming errors.
          }
        }
      }
    });

    // Only run when streaming status changes (from true to false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, activeConversationId]);
}
