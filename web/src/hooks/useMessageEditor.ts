import { useCallback } from 'react';
import { useUIStore, useActiveConversationId } from '@/store';
import {
  editMessage as editMessageInDB,
  editArtifactInMessage,
  editArtifactByCode as editArtifactByCodeInDB
} from '@/lib/conversation-manager';

export function useMessageEditor() {
  const activeConversationId = useActiveConversationId();

  const editMessage = useCallback(async (messageId: string, newContent: string): Promise<boolean> => {
    if (!activeConversationId) {
      console.error('[MessageEditor] No active conversation');
      return false;
    }

    try {
      // 1. Update IndexedDB (source of truth)
      const updatedConv = await editMessageInDB(activeConversationId, messageId, newContent);
      if (!updatedConv) {
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

      return true;
    } catch (error) {
      return false;
    }
  }, [activeConversationId]);

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

      return true;
    } catch (error) {
      return false;
    }
  }, [activeConversationId]);

  return {
    editMessage,
    editArtifact,
  };
}
