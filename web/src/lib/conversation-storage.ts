/**
 * High-performance IndexedDB storage for conversations using Dexie
 * 
 * This stores each conversation separately in IndexedDB instead of as one giant JSON blob.
 * Provides:
 * - O(1) writes when updating a single conversation
 * - Full-text search across conversation content
 * - Proper indexing for fast queries
 * - Zustand-compatible storage adapter
 */

import Dexie, { type Table } from 'dexie';
import type { StateStorage } from 'zustand/middleware';

// ============================================================================
// Database Schema
// ============================================================================

export interface StoredConversation {
  id: string;
  title: string;
  messages: any[];
  checkpoints: any[];
  updatedAt: number;
  createdAt: number;
  searchText: string; // For full-text search
}

interface StoredSettings {
  key: string;
  value: any;
}

class ChatDatabase extends Dexie {
  conversations!: Table<StoredConversation, string>;
  settings!: Table<StoredSettings, string>;

  constructor() {
    super('ChatDB');

    this.version(1).stores({
      // Primary key: id, Indexes: updatedAt (for sorting), title (for search)
      conversations: 'id, updatedAt, title',
      settings: 'key',
    });
  }
}

// Singleton database instance
export const db = new ChatDatabase();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build searchable text from conversation content
 */
function buildSearchText(title: string, messages: any[]): string {
  // Increased limit to capture more context for index-based searches
  const messageText = messages
    .map(m => m.content || '')
    .join(' ');
  return `${title} ${messageText}`.slice(0, 50000); // 50KB limit per conversation for search index
}

// ============================================================================
// Debounced Writer for Streaming Performance
// ============================================================================

class DebouncedWriter {
  private pending = new Map<string, { data: StoredConversation; timer: ReturnType<typeof setTimeout> }>();
  private delay: number;

  constructor(delay = 500) {
    this.delay = delay;
  }

  write(conv: StoredConversation): void {
    const existing = this.pending.get(conv.id);
    if (existing) {
      clearTimeout(existing.timer);
    }

    const timer = setTimeout(async () => {
      this.pending.delete(conv.id);
      try {
        await db.conversations.put(conv);
        console.log(`[ChatDB] Saved conversation: ${conv.id}`);
      } catch (e) {
        console.error('[ChatDB] Failed to write conversation:', e);
      }
    }, this.delay);

    this.pending.set(conv.id, { data: conv, timer });
  }

  async flush(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [, { data, timer }] of this.pending) {
      clearTimeout(timer);
      promises.push(db.conversations.put(data).then(() => { }));
    }
    this.pending.clear();
    await Promise.all(promises);
  }

  hasPending(): boolean {
    return this.pending.size > 0;
  }
}

const writer = new DebouncedWriter(500);

// Flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    writer.flush();
  });

  // Also flush on visibility change (tab switch)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && writer.hasPending()) {
      writer.flush();
    }
  });
}

// ============================================================================
// Zustand Storage Adapter
// ============================================================================

interface PersistedState {
  state: {
    conversations: Record<string, any>;
    darkMode: boolean;
    apiKey: string | null;
    selectedModel: string | null;
    systemPrompt: string;
    activeConversationId: string | null;
    lastSyncedAt: number | null;
    enabledTools: string[];
    artifactsPanelOpen: boolean;
    uiResponseEnabled: boolean;
  };
  version: number;
}

/**
 * Create a Zustand-compatible storage adapter that uses Dexie
 */
export function createConversationStorage(): StateStorage {
  return {
    getItem: async (_name: string): Promise<string | null> => {
      try {
        console.log('[ChatDB] Loading state from IndexedDB...');

        // Load settings
        const settingsRecord = await db.settings.get('main');
        const settings = settingsRecord?.value || {};

        // Load all conversations
        const conversations = await db.conversations.orderBy('updatedAt').reverse().toArray();
        const conversationsMap: Record<string, any> = {};

        for (const conv of conversations) {
          conversationsMap[conv.id] = {
            id: conv.id,
            title: conv.title,
            messages: conv.messages,
            checkpoints: conv.checkpoints,
            updatedAt: conv.updatedAt,
          };
        }

        console.log(`[ChatDB] Loaded ${conversations.length} conversations`);

        // Reconstruct the full state expected by Zustand
        const state: PersistedState = {
          state: {
            conversations: conversationsMap,
            darkMode: settings.darkMode ?? true,
            apiKey: settings.apiKey ?? null,
            selectedModel: settings.selectedModel ?? null,
            systemPrompt: settings.systemPrompt ?? 'You are a helpful assistant.',
            activeConversationId: settings.activeConversationId ?? null,
            lastSyncedAt: settings.lastSyncedAt ?? null,
            enabledTools: settings.enabledTools ?? [],
            artifactsPanelOpen: settings.artifactsPanelOpen ?? false,
            uiResponseEnabled: settings.uiResponseEnabled ?? true,
          },
          version: 1,
        };

        return JSON.stringify(state);
      } catch (e) {
        console.error('[ChatDB] Failed to load state:', e);
        return null;
      }
    },

    setItem: async (_name: string, value: string): Promise<void> => {
      try {
        const parsed: PersistedState = JSON.parse(value);
        const { conversations, ...settings } = parsed.state;

        // Save settings (non-conversation data) immediately
        await db.settings.put({
          key: 'main',
          value: settings,
        });

        // Get existing conversation IDs to detect deletions
        const existingIds = new Set((await db.conversations.toArray()).map(c => c.id));
        const newIds = new Set(Object.keys(conversations));

        // Delete removed conversations
        const toDelete = [...existingIds].filter(id => !newIds.has(id));
        if (toDelete.length > 0) {
          await db.conversations.bulkDelete(toDelete);
          console.log(`[ChatDB] Deleted ${toDelete.length} conversations`);
        }

        // Update/insert conversations using debounced writer
        for (const [id, conv] of Object.entries(conversations)) {
          const existing = await db.conversations.get(id);

          // Only write if changed (compare updatedAt or if new)
          if (!existing || existing.updatedAt !== conv.updatedAt) {
            const stored: StoredConversation = {
              id: conv.id,
              title: conv.title,
              messages: conv.messages,
              checkpoints: conv.checkpoints || [],
              updatedAt: conv.updatedAt,
              createdAt: existing?.createdAt || conv.updatedAt,
              searchText: buildSearchText(conv.title, conv.messages),
            };

            // Use debounced writer for performance during streaming
            writer.write(stored);
          }
        }
      } catch (e) {
        console.error('[ChatDB] Failed to save state:', e);
      }
    },

    removeItem: async (_name: string): Promise<void> => {
      try {
        await db.conversations.clear();
        await db.settings.clear();
        console.log('[ChatDB] Cleared all data');
      } catch (e) {
        console.error('[ChatDB] Failed to clear storage:', e);
      }
    },
  };
}

// ============================================================================
// Search API
// ============================================================================

export interface SearchResult extends StoredConversation {
  matches?: Array<{ messageId: string; preview: string }>;
}

/**
 * Search conversations by title or content
 * Returns conversations matching the query, sorted by updatedAt
 */
export async function searchConversations(query: string): Promise<SearchResult[]> {
  if (!query.trim()) {
    return db.conversations.orderBy('updatedAt').reverse().toArray();
  }

  const lowerQuery = query.toLowerCase();
  const all = await db.conversations.toArray();

  const results: SearchResult[] = [];

  for (const conv of all) {
    // Check title
    const titleMatch = conv.title.toLowerCase().includes(lowerQuery);

    // Check messages
    const matches: Array<{ messageId: string; preview: string }> = [];
    conv.messages.forEach(m => {
      if (m.content && typeof m.content === 'string' && m.content.toLowerCase().includes(lowerQuery)) {
        // Create a preview snippet
        const idx = m.content.toLowerCase().indexOf(lowerQuery);
        const start = Math.max(0, idx - 40);
        const end = Math.min(m.content.length, idx + query.length + 40);
        const snippet = (start > 0 ? '...' : '') +
          m.content.slice(start, end).replace(/\n/g, ' ') +
          (end < m.content.length ? '...' : '');
        matches.push({ messageId: m.id, preview: snippet });
      }
    });

    if (titleMatch || matches.length > 0) {
      results.push({ ...conv, matches: matches.length > 0 ? matches : undefined });
    }
  }

  return results.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Deep search - search within message content of all conversations
 * Returns conversation IDs with matching messages
 */
export async function deepSearchConversations(query: string): Promise<Array<{
  conversationId: string;
  matches: Array<{ messageId: string; preview: string }>;
}>> {
  if (!query.trim()) return [];

  const lowerQuery = query.toLowerCase();
  const all = await db.conversations.toArray();
  const results: Array<{
    conversationId: string;
    matches: Array<{ messageId: string; preview: string }>;
  }> = [];

  for (const conv of all) {
    const matches: Array<{ messageId: string; preview: string }> = [];

    for (const msg of conv.messages) {
      if (msg.content && msg.content.toLowerCase().includes(lowerQuery)) {
        // Find the match position and create a preview
        const idx = msg.content.toLowerCase().indexOf(lowerQuery);
        const start = Math.max(0, idx - 30);
        const end = Math.min(msg.content.length, idx + query.length + 30);
        const preview = (start > 0 ? '...' : '') +
          msg.content.slice(start, end) +
          (end < msg.content.length ? '...' : '');

        matches.push({ messageId: msg.id, preview });
      }
    }

    if (matches.length > 0) {
      results.push({ conversationId: conv.id, matches });
    }
  }

  return results;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get database stats
 */
export async function getStorageStats(): Promise<{
  conversationCount: number;
  totalMessages: number;
  oldestConversation: Date | null;
  newestConversation: Date | null;
}> {
  const conversations = await db.conversations.toArray();
  const totalMessages = conversations.reduce((sum, c) => sum + c.messages.length, 0);

  let oldest: Date | null = null;
  let newest: Date | null = null;

  if (conversations.length > 0) {
    const sorted = conversations.sort((a, b) => a.createdAt - b.createdAt);
    oldest = new Date(sorted[0].createdAt);
    newest = new Date(sorted[sorted.length - 1].updatedAt);
  }

  return {
    conversationCount: conversations.length,
    totalMessages,
    oldestConversation: oldest,
    newestConversation: newest,
  };
}

/**
 * Export all data for backup
 */
export async function exportAllData(): Promise<{
  conversations: StoredConversation[];
  settings: any;
}> {
  const conversations = await db.conversations.toArray();
  const settingsRecord = await db.settings.get('main');
  return {
    conversations,
    settings: settingsRecord?.value || {},
  };
}

/**
 * Import data from backup
 */
export async function importData(data: {
  conversations: StoredConversation[];
  settings: any;
}): Promise<void> {
  await db.transaction('rw', [db.conversations, db.settings], async () => {
    await db.conversations.clear();
    await db.conversations.bulkPut(data.conversations);
    await db.settings.put({ key: 'main', value: data.settings });
  });
  console.log(`[ChatDB] Imported ${data.conversations.length} conversations`);
}

/**
 * Clear all data
 */
export async function clearAllData(): Promise<void> {
  await db.conversations.clear();
  await db.settings.clear();
  console.log('[ChatDB] All data cleared');
}

/**
 * Force flush any pending writes
 */
export async function flushPendingWrites(): Promise<void> {
  await writer.flush();
}
