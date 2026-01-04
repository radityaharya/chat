/**
 * Hook for editing messages and artifacts
 * 
 * This hook handles editing operations that need to:
 * 1. Update IndexedDB (source of truth for messages)
 * 2. Update Zustand state (for reactivity)
 * 3. Trigger sync to server
 */

import { useCallback } from 'react';
import { useUIStore, useActiveConversationId } from '@/store';
import {
  editMessage as editMessageInDB,
  editArtifactInMessage,
  editArtifactByCode as editArtifactByCodeInDB
} from '@/lib/conversation-manager';

export function useMessageEditor() {
  const activeConversationId = useActiveConversationId();

  /**
   * Edit a message's content
   * Updates both IndexedDB and Zustand state
   */
  const editMessage = useCallback(async (messageId: string, newContent: string): Promise<boolean> => {
    if (!activeConversationId) {
      console.error('[MessageEditor] No active conversation');
      return false;
    }

    try {
      // 1. Update IndexedDB (source of truth)
      const updatedConv = await editMessageInDB(activeConversationId, messageId, newContent);
      if (!updatedConv) {
        console.error('[MessageEditor] Failed to update message in IndexedDB');
        return false;
      }

      // 2. Update Zustand state for reactivity
      // Only update the messages array in the active conversation
      useUIStore.setState((state) => {
        const conv = state.conversations[activeConversationId];
        if (!conv) return state;

        return {
          conversations: {
            ...state.conversations,
            [activeConversationId]: {
              ...conv,
              messages: updatedConv.messages,
              updatedAt: updatedConv.updatedAt,
            },
          },
        };
      });

      console.log(`[MessageEditor] Successfully edited message ${messageId}`);
      return true;
    } catch (error) {
      console.error('[MessageEditor] Error editing message:', error);
      return false;
    }
  }, [activeConversationId]);

  /**
   * Edit an artifact's code within a message by title
   * Falls back to code matching if title is empty
   */
  const editArtifact = useCallback(async (
    messageId: string,
    artifactTitle: string | undefined,
    newCode: string,
    language?: string,
    originalCode?: string
  ): Promise<boolean> => {
    if (!activeConversationId) {
      console.error('[MessageEditor] No active conversation');
      return false;
    }

    try {
      let updatedConv = null;

      // Try title-based matching first if we have a title
      if (artifactTitle && artifactTitle.trim()) {
        updatedConv = await editArtifactInMessage(
          activeConversationId,
          messageId,
          artifactTitle,
          newCode
        );
      }

      // Fall back to code-based matching if title matching failed or no title
      if (!updatedConv && language && originalCode) {
        updatedConv = await editArtifactByCodeInDB(
          activeConversationId,
          messageId,
          language,
          originalCode,
          newCode
        );
      }

      if (!updatedConv) {
        console.error('[MessageEditor] Failed to update artifact in IndexedDB');
        return false;
      }

      // 2. Update Zustand state for reactivity
      useUIStore.setState((state) => {
        const conv = state.conversations[activeConversationId];
        if (!conv) return state;

        return {
          conversations: {
            ...state.conversations,
            [activeConversationId]: {
              ...conv,
              messages: updatedConv.messages,
              updatedAt: updatedConv.updatedAt,
            },
          },
        };
      });

      console.log(`[MessageEditor] Successfully edited artifact ${artifactTitle || '(untitled)'}`);
      return true;
    } catch (error) {
      console.error('[MessageEditor] Error editing artifact:', error);
      return false;
    }
  }, [activeConversationId]);

  return {
    editMessage,
    editArtifact,
  };
}
