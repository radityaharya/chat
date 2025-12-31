import { useCallback, useEffect, useState } from 'react';
import { useUIStore, useDeleteConversation } from '../store';
import type { Conversation } from '../store';

interface ConversationHistory {
  id?: number;
  user_id?: number;
  conversation_id: string;
  version: number;
  title: string;
  data: Conversation;
  updated_at: string;
  created_at: string;
}

interface SyncResponse {
  conversations: ConversationHistory[];
  conflicts?: string[];
}

interface SyncStatus {
  syncing: boolean;
  lastSyncedAt: number | null;
  error: string | null;
}

export function useHistory() {
  const conversations = useUIStore((s) => s.conversations);
  const deleteConversation = useDeleteConversation();
  const setSyncStatus = useUIStore((s) => s.setSyncStatus);
  const setLastSyncedAt = useUIStore((s) => s.setLastSyncedAt);
  const setSyncError = useUIStore((s) => s.setSyncError);
  const syncStatus = useUIStore((s) => s.syncStatus);
  const lastSyncedAt = useUIStore((s) => s.lastSyncedAt);
  const syncError = useUIStore((s) => s.syncError);

  const setConversations = useCallback((newConversations: Record<string, Conversation>) => {
    useUIStore.setState({ conversations: newConversations });
  }, []);

  // Fetch all history from server
  const fetchHistory = useCallback(async (): Promise<ConversationHistory[]> => {
    const response = await fetch('/api/v1/user/me/history', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch history: ${response.statusText}`);
    }

    return response.json();
  }, []);

  // Sync local conversations with server
  const syncHistory = useCallback(async () => {
    setSyncStatus('syncing');
    setSyncError(null);

    try {
      // Convert local conversations to history format
      const localHistories: ConversationHistory[] = Object.values(conversations).map((conv) => ({
        conversation_id: conv.id,
        version: 1, // Will be managed by server
        title: conv.title,
        data: conv,
        updated_at: new Date(conv.updatedAt).toISOString(),
        created_at: new Date(conv.updatedAt).toISOString(), // Use updatedAt as fallback
      }));

      const response = await fetch('/api/v1/user/me/history', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversations: localHistories }),
      });

      if (!response.ok) {
        throw new Error(`Failed to sync history: ${response.statusText}`);
      }

      const syncResponse: SyncResponse = await response.json();

      // Merge server conversations with local state (keep newer versions)
      const mergedConversations: Record<string, Conversation> = { ...conversations };

      syncResponse.conversations.forEach((history) => {
        const serverConv = {
          ...history.data,
          id: history.conversation_id,
          title: history.title,
          updatedAt: new Date(history.updated_at).getTime(),
        };

        const localConv = mergedConversations[history.conversation_id];

        // If local conversation is newer, keep it; otherwise use server version
        if (!localConv || serverConv.updatedAt >= localConv.updatedAt) {
          mergedConversations[history.conversation_id] = serverConv;
        }
        // If local is newer, we keep the local version (don't overwrite)
      });

      setConversations(mergedConversations);

      setSyncStatus('idle');
      setLastSyncedAt(Date.now());
      setSyncError(null);

      // Log conflicts if any
      if (syncResponse.conflicts && syncResponse.conflicts.length > 0) {
        console.warn('Sync conflicts detected for conversations:', syncResponse.conflicts);
      }

      return syncResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setSyncStatus('error');
      setSyncError(errorMessage);
      throw error;
    }
  }, [conversations, setConversations, setSyncStatus, setLastSyncedAt, setSyncError]);

  // Load history from server (initial load)
  const loadHistory = useCallback(async () => {
    setSyncStatus('syncing');
    setSyncError(null);

    try {
      const histories = await fetchHistory();

      const loadedConversations: Record<string, Conversation> = {};

      histories.forEach((history) => {
        loadedConversations[history.conversation_id] = {
          ...history.data,
          id: history.conversation_id,
          title: history.title,
          updatedAt: new Date(history.updated_at).getTime(),
        };
      });

      setConversations(loadedConversations);

      setSyncStatus('idle');
      setLastSyncedAt(Date.now());
      setSyncError(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setSyncStatus('error');
      setSyncError(errorMessage);
      throw error;
    }
  }, [fetchHistory, setConversations, setSyncStatus, setLastSyncedAt, setSyncError]);

  // Delete a conversation from server
  const deleteHistoryItem = useCallback(async (conversationId: string) => {
    const response = await fetch('/api/v1/user/me/history', {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversation_id: conversationId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete history: ${response.statusText}`);
    }

    return response.json();
  }, []);

  // Delete conversation both locally and from server
  const deleteConversationWithSync = useCallback(async (conversationId: string) => {
    try {
      // Delete from server first
      await deleteHistoryItem(conversationId);

      // Then delete from local store
      deleteConversation(conversationId);
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      throw error;
    }
  }, [deleteHistoryItem, deleteConversation]);

  return {
    syncStatus: { syncing: syncStatus === 'syncing', lastSyncedAt, error: syncError },
    syncHistory,
    loadHistory,
    deleteHistoryItem,
    deleteConversationWithSync,
    fetchHistory,
  };
}

// Auto-sync hook - syncs on interval and visibility change
export function useAutoSync(intervalMs: number = 60000) {
  const { syncHistory, syncStatus } = useHistory();
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!enabled || syncStatus.syncing) return;

    // Sync on interval
    const interval = setInterval(() => {
      syncHistory().catch((error) => {
        console.error('Auto-sync failed:', error);
      });
    }, intervalMs);

    // Sync on visibility change (when tab becomes visible)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncHistory().catch((error) => {
          console.error('Visibility sync failed:', error);
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, syncHistory, syncStatus.syncing, intervalMs]);

  return {
    enabled,
    setEnabled,
    syncStatus,
  };
}
