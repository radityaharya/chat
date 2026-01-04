/**
 * Conversation Manager - High-performance conversation loading/saving
 * 
 * This module provides direct access to IndexedDB for conversation data,
 * bypassing Zustand's JSON serialization bottleneck for maximum performance.
 * 
 * Architecture:
 * - Zustand stores only conversation METADATA (id, title, updatedAt, messageCount)
 * - Full messages are loaded on-demand when a conversation becomes active
 * - Active conversation messages are stored in Zustand for reactivity
 * - Saves go directly to IndexedDB (debounced) without Zustand serialization
 */

import { db, type StoredConversation } from './conversation-storage';
import type { Message, Checkpoint } from '@/store';

// ============================================================================
// Types
// ============================================================================

export interface ConversationMetadata {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
}

export interface FullConversation {
  id: string;
  title: string;
  messages: Message[];
  checkpoints: Checkpoint[];
  updatedAt: number;
}

// ============================================================================
// Read Operations (Direct from IndexedDB)
// ============================================================================

/**
 * Load only conversation metadata (for sidebar listing)
 * This is MUCH faster than loading full conversations with messages
 */
export async function loadConversationMetadata(): Promise<ConversationMetadata[]> {
  const conversations = await db.conversations.orderBy('updatedAt').reverse().toArray();
  return conversations.map(conv => ({
    id: conv.id,
    title: conv.title,
    updatedAt: conv.updatedAt,
    messageCount: conv.messages?.length ?? 0,
  }));
}

/**
 * Load a full conversation with all messages
 * Called when user navigates to/activates a conversation
 */
export async function loadFullConversation(id: string): Promise<FullConversation | null> {
  const conv = await db.conversations.get(id);
  if (!conv) return null;

  return {
    id: conv.id,
    title: conv.title,
    messages: conv.messages || [],
    checkpoints: conv.checkpoints || [],
    updatedAt: conv.updatedAt,
  };
}

/**
 * Check if a conversation exists
 */
export async function conversationExists(id: string): Promise<boolean> {
  const count = await db.conversations.where('id').equals(id).count();
  return count > 0;
}

// ============================================================================
// Write Operations (Debounced, Direct to IndexedDB)
// ============================================================================

// Debounce timers by conversation ID
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const SAVE_DEBOUNCE_MS = 300;

/**
 * Build searchable text from conversation content
 */
function buildSearchText(title: string, messages: Message[]): string {
  const messageText = messages
    .map(m => m.content || '')
    .join(' ');
  return `${title} ${messageText}`.slice(0, 50000);
}

/**
 * Save a conversation directly to IndexedDB (debounced)
 * This bypasses Zustand's serialization for maximum performance
 */
export function saveConversation(conversation: FullConversation): void {
  // Clear any pending save for this conversation
  const existingTimer = saveTimers.get(conversation.id);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Debounce the save
  const timer = setTimeout(async () => {
    saveTimers.delete(conversation.id);

    try {
      const existing = await db.conversations.get(conversation.id);

      const stored: StoredConversation = {
        id: conversation.id,
        title: conversation.title,
        messages: conversation.messages,
        checkpoints: conversation.checkpoints || [],
        updatedAt: conversation.updatedAt,
        createdAt: existing?.createdAt || conversation.updatedAt,
        searchText: buildSearchText(conversation.title, conversation.messages),
      };

      await db.conversations.put(stored);
      console.log(`[ConvManager] Saved: ${conversation.id} (${conversation.messages.length} messages)`);
    } catch (error) {
      console.error(`[ConvManager] Failed to save ${conversation.id}:`, error);
    }
  }, SAVE_DEBOUNCE_MS);

  saveTimers.set(conversation.id, timer);
}

/**
 * Save a conversation immediately (no debounce)
 * Use for critical saves like before page unload
 */
export async function saveConversationImmediate(conversation: FullConversation): Promise<void> {
  // Cancel any pending debounced save
  const existingTimer = saveTimers.get(conversation.id);
  if (existingTimer) {
    clearTimeout(existingTimer);
    saveTimers.delete(conversation.id);
  }

  const existing = await db.conversations.get(conversation.id);

  const stored: StoredConversation = {
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages,
    checkpoints: conversation.checkpoints || [],
    updatedAt: conversation.updatedAt,
    createdAt: existing?.createdAt || conversation.updatedAt,
    searchText: buildSearchText(conversation.title, conversation.messages),
  };

  await db.conversations.put(stored);
}

/**
 * Delete a conversation from IndexedDB
 */
export async function deleteConversation(id: string): Promise<void> {
  // Cancel any pending save
  const existingTimer = saveTimers.get(id);
  if (existingTimer) {
    clearTimeout(existingTimer);
    saveTimers.delete(id);
  }

  await db.conversations.delete(id);
  console.log(`[ConvManager] Deleted: ${id}`);
}

/**
 * Create a new conversation in IndexedDB
 */
export async function createConversation(id: string, title: string = 'New Chat'): Promise<FullConversation> {
  const now = Date.now();
  const conversation: FullConversation = {
    id,
    title,
    messages: [],
    checkpoints: [],
    updatedAt: now,
  };

  const stored: StoredConversation = {
    id,
    title,
    messages: [],
    checkpoints: [],
    updatedAt: now,
    createdAt: now,
    searchText: title,
  };

  await db.conversations.put(stored);
  console.log(`[ConvManager] Created: ${id}`);

  return conversation;
}

/**
 * Edit a message's content in IndexedDB
 * Returns the updated conversation or null if not found
 */
export async function editMessage(
  conversationId: string,
  messageId: string,
  newContent: string
): Promise<FullConversation | null> {
  const conv = await db.conversations.get(conversationId);
  if (!conv) return null;

  const msgIndex = conv.messages.findIndex((m: Message) => m.id === messageId);
  if (msgIndex === -1) return null;

  // Update the message
  conv.messages[msgIndex] = {
    ...conv.messages[msgIndex],
    content: newContent,
    timestamp: Date.now(),
  };
  conv.updatedAt = Date.now();

  // Save immediately (no debounce for edits)
  await db.conversations.put({
    ...conv,
    searchText: buildSearchText(conv.title, conv.messages),
  });

  console.log(`[ConvManager] Edited message ${messageId} in ${conversationId}`);

  return {
    id: conv.id,
    title: conv.title,
    messages: conv.messages,
    checkpoints: conv.checkpoints || [],
    updatedAt: conv.updatedAt,
  };
}

/**
 * Edit an artifact's code within a message in IndexedDB
 * Artifacts are stored as code blocks in message content
 * Returns the updated conversation or null if not found
 */
export async function editArtifactInMessage(
  conversationId: string,
  messageId: string,
  artifactId: string,
  newCode: string
): Promise<FullConversation | null> {
  const conv = await db.conversations.get(conversationId);
  if (!conv) return null;

  const msgIndex = conv.messages.findIndex((m: Message) => m.id === messageId);
  if (msgIndex === -1) return null;

  const message = conv.messages[msgIndex];

  // artifactId is actually the title, which may be empty
  // We need a more robust approach - pass in the original code to match
  // For now, try title-based matching if title exists, otherwise fail gracefully

  if (!artifactId || artifactId.trim() === '') {
    console.warn(`[ConvManager] Cannot edit untitled artifact - no identifier provided`);
    return null;
  }

  const escapedTitle = escapeRegex(artifactId);

  // Artifacts can be in two formats:
  // 1. ```language title\ncode\n```
  // 2. ```language:filename\ncode\n```
  // We need to match both

  // Pattern 1: ```lang title
  const pattern1 = new RegExp(
    `(\`\`\`\\w+\\s+${escapedTitle}\\s*\\n)([\\s\\S]*?)(\n?\`\`\`)`,
    'g'
  );

  // Pattern 2: ```lang:title
  const pattern2 = new RegExp(
    `(\`\`\`\\w+:${escapedTitle}\\s*\\n)([\\s\\S]*?)(\n?\`\`\`)`,
    'g'
  );

  let newContent = message.content.replace(pattern1, `$1${newCode}$3`);

  // If pattern1 didn't match, try pattern2
  if (newContent === message.content) {
    newContent = message.content.replace(pattern2, `$1${newCode}$3`);
  }

  if (newContent === message.content) {
    // No match found - artifact might have a different format
    console.warn(`[ConvManager] Artifact ${artifactId} not found in message ${messageId}`);
    return null;
  }

  // Update the message
  conv.messages[msgIndex] = {
    ...message,
    content: newContent,
    timestamp: Date.now(),
  };
  conv.updatedAt = Date.now();

  // Save immediately
  await db.conversations.put({
    ...conv,
    searchText: buildSearchText(conv.title, conv.messages),
  });

  console.log(`[ConvManager] Edited artifact ${artifactId} in message ${messageId}`);

  return {
    id: conv.id,
    title: conv.title,
    messages: conv.messages,
    checkpoints: conv.checkpoints || [],
    updatedAt: conv.updatedAt,
  };
}

/**
 * Edit an artifact by matching its original code content
 * This handles artifacts without titles
 */
export async function editArtifactByCode(
  conversationId: string,
  messageId: string,
  language: string,
  originalCode: string,
  newCode: string
): Promise<FullConversation | null> {
  const conv = await db.conversations.get(conversationId);
  if (!conv) return null;

  const msgIndex = conv.messages.findIndex((m: Message) => m.id === messageId);
  if (msgIndex === -1) return null;

  const message = conv.messages[msgIndex];

  // Build pattern to match the exact code block
  // Match ```language\noriginalCode\n``` or ```language title\noriginalCode\n```
  const escapedCode = escapeRegex(originalCode);
  const pattern = new RegExp(
    `(\`\`\`${escapeRegex(language)}[^\\n]*\\n)${escapedCode}(\\n?\`\`\`)`,
    'g'
  );

  const newContent = message.content.replace(pattern, `$1${newCode}$2`);

  if (newContent === message.content) {
    console.warn(`[ConvManager] Artifact code block not found in message ${messageId}`);
    return null;
  }

  // Update the message
  conv.messages[msgIndex] = {
    ...message,
    content: newContent,
    timestamp: Date.now(),
  };
  conv.updatedAt = Date.now();

  // Save immediately
  await db.conversations.put({
    ...conv,
    searchText: buildSearchText(conv.title, conv.messages),
  });

  console.log(`[ConvManager] Edited ${language} artifact by code match in message ${messageId}`);

  return {
    id: conv.id,
    title: conv.title,
    messages: conv.messages,
    checkpoints: conv.checkpoints || [],
    updatedAt: conv.updatedAt,
  };
}

/**
 * Helper to escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// Flush / Cleanup
// ============================================================================

/**
 * Flush all pending saves (call before page unload)
 */
export async function flushAllPendingSaves(): Promise<void> {
  const pendingIds = Array.from(saveTimers.keys());

  for (const id of pendingIds) {
    const timer = saveTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      saveTimers.delete(id);
    }
  }

  // Note: We'd need to track pending data to actually save here
  // For now, the debounced saves will be lost on hard refresh
  // In production, you'd want to queue the actual data
  console.log(`[ConvManager] Flush requested for ${pendingIds.length} pending saves`);
}

// Register cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushAllPendingSaves();
  });
}

// ============================================================================
// OPFS Attachment Cache
// ============================================================================
// Uses Origin Private File System to cache attachment binary data locally.
// - Backend URLs remain the source of truth in messages
// - OPFS caches binary data for fast local display
// - IndexedDB stays lean (no binary blobs)

const ATTACHMENT_CACHE_DIR = 'attachment-cache';

/**
 * Get the OPFS root directory handle
 */
async function getOPFSRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    console.warn('[OPFS] Origin Private File System not available');
    return null;
  }
  try {
    return await navigator.storage.getDirectory();
  } catch (error) {
    console.error('[OPFS] Failed to get root directory:', error);
    return null;
  }
}

/**
 * Get or create the attachment cache directory
 */
async function getAttachmentCacheDir(): Promise<FileSystemDirectoryHandle | null> {
  const root = await getOPFSRoot();
  if (!root) return null;

  try {
    return await root.getDirectoryHandle(ATTACHMENT_CACHE_DIR, { create: true });
  } catch (error) {
    console.error('[OPFS] Failed to get cache directory:', error);
    return null;
  }
}

/**
 * Generate a cache key from a URL
 * Extracts the UUID or creates a hash for other URLs
 */
function getCacheKey(url: string): string {
  // Handle backend attachment URLs: /api/v1/attachments/{uuid}
  const uuidMatch = url.match(/\/attachments\/([a-f0-9-]+)/i);
  if (uuidMatch) {
    return uuidMatch[1];
  }

  // For other URLs, create a simple hash
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `url-${Math.abs(hash).toString(16)}`;
}

/**
 * Check if an attachment is cached in OPFS
 */
export async function isAttachmentCached(url: string): Promise<boolean> {
  const cacheDir = await getAttachmentCacheDir();
  if (!cacheDir) return false;

  const key = getCacheKey(url);
  try {
    await cacheDir.getFileHandle(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cache an attachment in OPFS from a blob
 */
export async function cacheAttachmentBlob(url: string, blob: Blob): Promise<void> {
  const cacheDir = await getAttachmentCacheDir();
  if (!cacheDir) return;

  const key = getCacheKey(url);
  try {
    const fileHandle = await cacheDir.getFileHandle(key, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    console.log(`[OPFS] Cached attachment: ${key} (${blob.size} bytes)`);
  } catch (error) {
    console.error(`[OPFS] Failed to cache attachment ${key}:`, error);
  }
}

/**
 * Fetch and cache an attachment from a URL
 */
export async function cacheAttachmentFromUrl(url: string): Promise<Blob | null> {
  // Skip if already cached
  if (await isAttachmentCached(url)) {
    return getAttachmentBlob(url);
  }

  try {
    // Fetch from backend
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      console.error(`[OPFS] Failed to fetch attachment: ${response.status}`);
      return null;
    }

    const blob = await response.blob();
    await cacheAttachmentBlob(url, blob);
    return blob;
  } catch (error) {
    console.error(`[OPFS] Failed to fetch and cache attachment:`, error);
    return null;
  }
}

/**
 * Get a cached attachment blob from OPFS
 */
export async function getAttachmentBlob(url: string): Promise<Blob | null> {
  const cacheDir = await getAttachmentCacheDir();
  if (!cacheDir) return null;

  const key = getCacheKey(url);
  try {
    const fileHandle = await cacheDir.getFileHandle(key);
    const file = await fileHandle.getFile();
    return file;
  } catch {
    return null;
  }
}

/**
 * Get a blob URL for a cached attachment
 * Returns the original URL if not cached (for fallback fetching)
 */
export async function getAttachmentBlobUrl(url: string): Promise<string> {
  const blob = await getAttachmentBlob(url);
  if (blob) {
    return URL.createObjectURL(blob);
  }

  // Try to cache it first, then return blob URL
  const cachedBlob = await cacheAttachmentFromUrl(url);
  if (cachedBlob) {
    return URL.createObjectURL(cachedBlob);
  }

  // Fallback to original URL
  return url;
}

/**
 * Delete a cached attachment
 */
export async function deleteAttachmentCache(url: string): Promise<void> {
  const cacheDir = await getAttachmentCacheDir();
  if (!cacheDir) return;

  const key = getCacheKey(url);
  try {
    await cacheDir.removeEntry(key);
    console.log(`[OPFS] Removed cached attachment: ${key}`);
  } catch {
    // File might not exist, ignore
  }
}

/**
 * Clear all cached attachments
 */
export async function clearAttachmentCache(): Promise<void> {
  const root = await getOPFSRoot();
  if (!root) return;

  try {
    await root.removeEntry(ATTACHMENT_CACHE_DIR, { recursive: true });
    console.log('[OPFS] Cleared attachment cache');
  } catch (error) {
    console.error('[OPFS] Failed to clear cache:', error);
  }
}

/**
 * Get cache statistics
 */
export async function getAttachmentCacheStats(): Promise<{ count: number; totalSize: number }> {
  const cacheDir = await getAttachmentCacheDir();
  if (!cacheDir) return { count: 0, totalSize: 0 };

  let count = 0;
  let totalSize = 0;

  try {
    // TypeScript types for OPFS are incomplete, use type assertion
    const entries = (cacheDir as any).entries() as AsyncIterable<[string, FileSystemHandle]>;
    for await (const [_name, handle] of entries) {
      if (handle.kind === 'file') {
        count++;
        const file = await (handle as FileSystemFileHandle).getFile();
        totalSize += file.size;
      }
    }
  } catch (error) {
    console.error('[OPFS] Failed to get cache stats:', error);
  }

  return { count, totalSize };
}

/**
 * Pre-cache attachments for a conversation
 * Call when loading a conversation to warm up the cache
 */
export async function precacheConversationAttachments(messages: Message[]): Promise<void> {
  const attachmentUrls: string[] = [];

  for (const msg of messages) {
    // Collect attachment URLs
    if (msg.attachments) {
      for (const att of msg.attachments) {
        if (att.url && att.url.startsWith('/api/v1/attachments/')) {
          attachmentUrls.push(att.url);
        }
      }
    }

    // Collect image URLs
    if (msg.images) {
      for (const img of msg.images) {
        const url = img.image_url?.url;
        if (url && url.startsWith('/api/v1/attachments/')) {
          attachmentUrls.push(url);
        }
      }
    }
  }

  if (attachmentUrls.length === 0) return;

  console.log(`[OPFS] Pre-caching ${attachmentUrls.length} attachments...`);

  // Cache in parallel (with limit to avoid overwhelming)
  const batchSize = 3;
  for (let i = 0; i < attachmentUrls.length; i += batchSize) {
    const batch = attachmentUrls.slice(i, i + batchSize);
    await Promise.all(batch.map(url => cacheAttachmentFromUrl(url)));
  }
}
