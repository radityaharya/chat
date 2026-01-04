/**
 * useActiveConversation - Lazy-loads conversation messages when conversation becomes active
 * 
 * This hook provides efficient conversation management by:
 * 1. Loading messages from IndexedDB only when a conversation becomes active
 * 2. Syncing messages back to IndexedDB on changes (debounced)
 * 3. Avoiding the Zustand persist JSON serialization bottleneck
 * 
 * OPTIMIZED for fast conversation switching:
 * - Fast path: messages already in memory = instant switch
 * - Slow path: fetch from IndexedDB, with sync updates on mobile
 * - Background attachment pre-caching
 */

import { useEffect, useRef, startTransition } from 'react';
import { flushSync } from 'react-dom';
import { useUIStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import {
  loadFullConversation,
  saveConversation,
  precacheConversationAttachments,
  type FullConversation,
} from '@/lib/conversation-manager';

// Detect mobile for sync-first behavior
const isMobileDevice = typeof navigator !== 'undefined' &&
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

/**
 * Hook to manage active conversation loading
 * 
 * When activeConversationId changes:
 * 1. Loads full conversation from IndexedDB
 * 2. Updates Zustand state with messages
 * 3. Pre-caches attachments in OPFS for fast display
 * 
 * Uses version tracking to properly handle rapid conversation switches,
 * especially important on mobile where async operations may be interrupted.
 */
export function useActiveConversationLoader() {
  const activeId = useUIStore((s) => s.activeConversationId);
  const isHydrated = useUIStore((s) => s.isHydrated);

  // Load conversation when active ID changes
  useEffect(() => {
    if (!isHydrated || !activeId) return;

    // FAST PATH: Check if messages are already in Zustand state
    // This makes switching back to previously loaded chats instant
    const existing = useUIStore.getState().conversations[activeId];
    if (existing?.messages?.length > 0) {
      console.log(`[ActiveConvLoader] Fast path - ${existing.messages.length} messages already in memory`);
      return;
    }

    // SLOW PATH: Need to fetch from IndexedDB
    const loadConversation = async () => {
      const startTime = performance.now();

      try {
        const fullConv = await loadFullConversation(activeId);

        // Check if this is still the active conversation (user may have switched during load)
        const currentActiveId = useUIStore.getState().activeConversationId;
        if (currentActiveId !== activeId) {
          console.log(`[ActiveConvLoader] Aborted - user switched conversations`);
          return;
        }

        if (fullConv && fullConv.messages.length > 0) {
          // Update state with loaded messages synchronously on mobile
          const updateState = () => {
            useUIStore.setState((state) => {
              const conv = state.conversations[activeId];
              if (!conv) return {};

              return {
                conversations: {
                  ...state.conversations,
                  [activeId]: {
                    ...conv,
                    messages: fullConv.messages,
                    checkpoints: fullConv.checkpoints,
                  },
                },
              };
            });
          };

          if (isMobileDevice) {
            flushSync(updateState);
          } else {
            startTransition(updateState);
          }

          const elapsed = performance.now() - startTime;
          console.log(`[ActiveConvLoader] Loaded ${fullConv.messages.length} messages in ${elapsed.toFixed(1)}ms`);

          // Pre-cache attachments in background
          requestIdleCallback(() => {
            precacheConversationAttachments(fullConv.messages).catch(() => { });
          }, { timeout: 5000 });
        }
      } catch (error) {
        console.error(`[ActiveConvLoader] Failed to load:`, error);
      }
    };

    loadConversation();
  }, [activeId, isHydrated]);
}

/**
 * Hook to save active conversation changes to IndexedDB
 * 
 * Watches for message changes and saves directly to IndexedDB,
 * bypassing Zustand's persist serialization.
 * 
 * OPTIMIZED: Only subscribes to active conversation, not all conversations
 */
export function useConversationSaver() {
  const activeId = useUIStore((s) => s.activeConversationId);
  const isHydrated = useUIStore((s) => s.isHydrated);

  // Only get the active conversation - not all conversations!
  const activeConv = useUIStore(useShallow((s) => {
    if (!s.activeConversationId) return null;
    return s.conversations[s.activeConversationId] ?? null;
  }));

  const lastSaveHashRef = useRef<string>('');

  // Save on changes
  useEffect(() => {
    if (!isHydrated || !activeId || !activeConv) return;

    // Generate a simple hash to detect changes
    const lastMsg = activeConv.messages[activeConv.messages.length - 1];
    const currentHash = `${activeConv.title}:${activeConv.messages.length}:${lastMsg?.id || ''}:${lastMsg?.streaming || false}`;

    // Skip if nothing changed
    if (currentHash === lastSaveHashRef.current) return;

    // Skip if still streaming (save after streaming completes)
    const isStreaming = activeConv.messages.some(m => m.streaming);
    if (isStreaming) return;

    lastSaveHashRef.current = currentHash;

    // Save to IndexedDB (debounced internally)
    const fullConv: FullConversation = {
      id: activeConv.id,
      title: activeConv.title,
      messages: activeConv.messages,
      checkpoints: activeConv.checkpoints || [],
      updatedAt: activeConv.updatedAt,
    };

    saveConversation(fullConv);
  }, [activeId, activeConv, isHydrated]);
}

/**
 * Combined hook for conversation management
 */
export function useConversationManager() {
  useActiveConversationLoader();
  useConversationSaver();
}

// Polyfill for requestIdleCallback
const requestIdleCallback =
  typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? window.requestIdleCallback
    : (cb: () => void, _options?: any) => setTimeout(cb, 1);
