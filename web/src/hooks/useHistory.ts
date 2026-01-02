import { useCallback, useRef } from 'react';
import { useUIStore, useDeleteConversation } from '../store';
import { useShallow } from 'zustand/react/shallow';
import type { Conversation } from '../store';

/**
 * Generate a simple hash for a conversation to detect changes.
 * Uses a fast hash based on title, message count, and last message content.
 */
function generateConversationHash(conv: Conversation): string {
  const messageSummary = conv.messages
    .slice(-3) // Only look at last 3 messages for performance
    .map(m => `${m.id}:${m.content.slice(0, 100)}`)
    .join('|');

  const data = `${conv.title}|${conv.messages.length}|${messageSummary}|${conv.updatedAt}`;

  // Simple hash function (djb2)
  let hash = 5381;
  for (let i = 0; i < data.length; i++) {
    hash = (hash * 33) ^ data.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

interface ConversationManifestItem {
  conversation_id: string;
  hash: string;
  updated_at: number;
  version: number;
}

interface ConversationHistory {
  id?: number;
  user_id?: number;
  conversation_id: string;
  version: number;
  hash?: string;
  title: string;
  data: Conversation;
  updated_at: string;
  created_at: string;
}

interface ManifestResponse {
  items: ConversationManifestItem[];
}

interface DeltaSyncRequest {
  push: ConversationHistory[];      // Conversations to push to server
  pull_ids: string[];               // Conversation IDs to pull from server
  delete_ids?: string[];            // Conversations deleted locally
}

interface DeltaSyncResponse {
  pushed: string[];                  // IDs that were successfully pushed
  pulled: ConversationHistory[];     // Conversations pulled from server
  conflicts?: string[];              // Conflict IDs (if any)
  server_deleted?: string[];         // IDs deleted on server
}

export function useHistory() {
  // Combined selector - reduces from 6 subscriptions to 1
  const { syncStatus, lastSyncedAt, syncError } = useUIStore(useShallow((s) => ({
    syncStatus: s.syncStatus,
    lastSyncedAt: s.lastSyncedAt,
    syncError: s.syncError,
  })));

  const deleteConversation = useDeleteConversation();

  // Track local hashes to detect changes
  const localHashesRef = useRef<Map<string, string>>(new Map());

  // Get actions directly from store to avoid subscription overhead
  const setSyncStatus = useCallback((status: 'idle' | 'syncing' | 'error') => {
    useUIStore.getState().setSyncStatus(status);
  }, []);

  const setLastSyncedAt = useCallback((timestamp: number | null) => {
    useUIStore.getState().setLastSyncedAt(timestamp);
  }, []);

  const setSyncError = useCallback((error: string | null) => {
    useUIStore.getState().setSyncError(error);
  }, []);

  const setConversations = useCallback((newConversations: Record<string, Conversation>) => {
    useUIStore.setState({ conversations: newConversations });
  }, []);

  // Fetch manifest (lightweight list of conversation hashes)
  const fetchManifest = useCallback(async (): Promise<ManifestResponse> => {
    const response = await fetch('/api/v1/user/me/history/manifest', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // Fall back to empty manifest if endpoint doesn't exist yet
      if (response.status === 404) {
        return { items: [] };
      }
      throw new Error(`Failed to fetch manifest: ${response.statusText}`);
    }

    return response.json();
  }, []);

  // Delta sync - only push/pull changed conversations  
  const deltaSyncHistory = useCallback(async () => {
    setSyncStatus('syncing');
    setSyncError(null);

    try {
      // Step 1: Get server manifest
      const serverManifest = await fetchManifest();

      // Build server lookup
      const serverItems = new Map<string, ConversationManifestItem>();
      for (const item of serverManifest.items) {
        serverItems.set(item.conversation_id, item);
      }

      // Step 2: Compare with local state
      const currentConversations = useUIStore.getState().conversations;
      const toPush: ConversationHistory[] = [];
      const toPull: string[] = [];

      // Check each local conversation
      for (const conv of Object.values(currentConversations)) {
        // Skip conversations that are currently streaming
        if (conv.messages.some(m => m.streaming)) {
          continue;
        }

        const localHash = generateConversationHash(conv);
        const serverItem = serverItems.get(conv.id);

        if (!serverItem) {
          // New local conversation - push to server
          toPush.push({
            conversation_id: conv.id,
            version: 1,
            hash: localHash,
            title: conv.title,
            data: conv,
            updated_at: new Date(conv.updatedAt).toISOString(),
            created_at: new Date(conv.updatedAt).toISOString(),
          });
        } else if (localHash !== serverItem.hash) {
          // Hash mismatch - need to sync
          if (conv.updatedAt > serverItem.updated_at) {
            // Local is newer - push
            toPush.push({
              conversation_id: conv.id,
              version: serverItem.version + 1,
              hash: localHash,
              title: conv.title,
              data: conv,
              updated_at: new Date(conv.updatedAt).toISOString(),
              created_at: new Date(conv.updatedAt).toISOString(),
            });
          } else {
            // Server is newer - pull
            toPull.push(conv.id);
          }
        }
        // If hashes match, no sync needed

        // Update local hash cache
        localHashesRef.current.set(conv.id, localHash);
      }

      // Check for server conversations we don't have locally
      for (const [convId] of serverItems) {
        if (!currentConversations[convId]) {
          toPull.push(convId);
        }
      }

      // Step 3: Execute delta sync if there are changes
      if (toPush.length === 0 && toPull.length === 0) {
        // No changes needed
        setSyncStatus('idle');
        setLastSyncedAt(Date.now());
        return { pushed: 0, pulled: 0 };
      }

      const response = await fetch('/api/v1/user/me/history/delta', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          push: toPush,
          pull_ids: toPull,
        } as DeltaSyncRequest),
      });

      if (!response.ok) {
        // Fall back to full sync if delta endpoint doesn't exist
        if (response.status === 404) {
          return await syncHistoryFull();
        }
        throw new Error(`Failed to delta sync: ${response.statusText}`);
      }

      const deltaResponse: DeltaSyncResponse = await response.json();

      // Step 4: Apply pulled conversations
      if (deltaResponse.pulled && deltaResponse.pulled.length > 0) {
        const mergedConversations = { ...currentConversations };

        for (const history of deltaResponse.pulled) {
          mergedConversations[history.conversation_id] = {
            ...history.data,
            id: history.conversation_id,
            title: history.title,
            updatedAt: new Date(history.updated_at).getTime(),
          };
        }

        setConversations(mergedConversations);
      }

      // Step 5: Handle server deletions
      if (deltaResponse.server_deleted && deltaResponse.server_deleted.length > 0) {
        const currentState = useUIStore.getState().conversations;
        const filtered = { ...currentState };
        for (const id of deltaResponse.server_deleted) {
          delete filtered[id];
        }
        setConversations(filtered);
      }

      setSyncStatus('idle');
      setLastSyncedAt(Date.now());

      console.log(`[History] Delta sync: pushed ${toPush.length}, pulled ${deltaResponse.pulled?.length || 0}`);

      return {
        pushed: toPush.length,
        pulled: deltaResponse.pulled?.length || 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[History] Delta sync failed, falling back to full sync:', error);

      // Fall back to full sync on error
      try {
        return await syncHistoryFull();
      } catch (fullSyncError) {
        setSyncStatus('error');
        setSyncError(errorMessage);
        throw fullSyncError;
      }
    }
  }, [fetchManifest, setConversations, setSyncStatus, setLastSyncedAt, setSyncError]);

  // Full sync (fallback) - sends all conversations
  const syncHistoryFull = useCallback(async () => {
    const currentConversations = useUIStore.getState().conversations;

    // Convert local conversations to history format
    const localHistories: ConversationHistory[] = Object.values(currentConversations)
      .filter(conv => !conv.messages.some(m => m.streaming)) // Skip streaming
      .map((conv) => ({
        conversation_id: conv.id,
        version: 1,
        title: conv.title,
        data: conv,
        updated_at: new Date(conv.updatedAt).toISOString(),
        created_at: new Date(conv.updatedAt).toISOString(),
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

    const syncResponse = await response.json();

    // Merge server conversations with local state
    const mergedConversations: Record<string, Conversation> = { ...currentConversations };

    syncResponse.conversations.forEach((history: ConversationHistory) => {
      const serverConv = {
        ...history.data,
        id: history.conversation_id,
        title: history.title,
        updatedAt: new Date(history.updated_at).getTime(),
      };

      const localConv = mergedConversations[history.conversation_id];
      if (!localConv || serverConv.updatedAt >= localConv.updatedAt) {
        mergedConversations[history.conversation_id] = serverConv;
      }
    });

    setConversations(mergedConversations);
    setSyncStatus('idle');
    setLastSyncedAt(Date.now());

    return { pushed: localHistories.length, pulled: syncResponse.conversations.length };
  }, [setConversations, setSyncStatus, setLastSyncedAt]);

  // Main sync function - uses delta sync with full sync fallback
  const syncHistory = deltaSyncHistory;

  // Fetch all history from server (initial load)
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

        // Cache the hash
        const conv = loadedConversations[history.conversation_id];
        localHashesRef.current.set(conv.id, generateConversationHash(conv));
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

    // Remove from local hash cache
    localHashesRef.current.delete(conversationId);

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
    syncHistoryFull,  // Expose full sync for manual use
    loadHistory,
    deleteHistoryItem,
    deleteConversationWithSync,
    fetchHistory,
  };
}

// Auto-sync hook - syncs on interval and visibility change
// Now uses smart debouncing to avoid syncing during active conversations
export function useAutoSync(intervalMs: number = 60000) {
  const { syncHistory, syncStatus } = useHistory();
  const lastActivityRef = useRef<number>(Date.now());
  const syncInProgressRef = useRef<boolean>(false);

  // Track user activity  
  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Smart sync that avoids syncing during active use
  const smartSync = useCallback(async () => {
    // Don't sync if already syncing
    if (syncInProgressRef.current || syncStatus.syncing) {
      return;
    }

    // Don't sync if user was active very recently (within 5 seconds)
    const timeSinceActivity = Date.now() - lastActivityRef.current;
    if (timeSinceActivity < 5000) {
      console.log('[AutoSync] Skipping - recent activity');
      return;
    }

    // Check for any streaming messages
    const conversations = useUIStore.getState().conversations;
    const hasStreaming = Object.values(conversations).some(
      conv => conv.messages.some(m => m.streaming)
    );

    if (hasStreaming) {
      console.log('[AutoSync] Skipping - streaming in progress');
      return;
    }

    syncInProgressRef.current = true;
    try {
      await syncHistory();
    } catch (error) {
      console.error('[AutoSync] Failed:', error);
    } finally {
      syncInProgressRef.current = false;
    }
  }, [syncHistory, syncStatus.syncing]);

  return {
    syncStatus,
    smartSync,
    updateActivity,
    intervalMs,
  };
}
