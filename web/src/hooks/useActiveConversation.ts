/**
 * useActiveConversation - Lazy-loads conversation messages when conversation becomes active
 * 
 * This hook provides efficient conversation management by:
 * 1. Loading messages from IndexedDB only when a conversation becomes active
 * 2. Syncing messages back to IndexedDB on changes (debounced)
 * 3. Avoiding the Zustand persist JSON serialization bottleneck
 * 
 * OPTIMIZED for fast conversation switching:
 * - Uses startTransition for non-blocking state updates
 * - Minimal re-renders via targeted selectors
 * - Background attachment pre-caching
 */

import { useEffect, useRef, startTransition } from 'react';
import { useUIStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import {
  loadFullConversation,
  saveConversation,
  precacheConversationAttachments,
  type FullConversation,
} from '@/lib/conversation-manager';

/**
 * Hook to manage active conversation loading
 * 
 * When activeConversationId changes:
 * 1. Loads full conversation from IndexedDB
 * 2. Updates Zustand state with messages (non-blocking)
 * 3. Pre-caches attachments in OPFS for fast display
 */
export function useActiveConversationLoader() {
  const activeId = useUIStore((s) => s.activeConversationId);
  const isHydrated = useUIStore((s) => s.isHydrated);

  const lastLoadedIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);

  // Load conversation when active ID changes
  useEffect(() => {
    if (!isHydrated || !activeId) return;
    if (activeId === lastLoadedIdRef.current) return;
    if (isLoadingRef.current) return;

    isLoadingRef.current = true;

    // Mark this as the target to load (for abort check)
    const targetId = activeId;

    const loadConversation = async () => {
      const startTime = performance.now();

      try {
        const fullConv = await loadFullConversation(targetId);

        if (fullConv) {
          // Check if this is still the active conversation (user may have switched)
          const currentActiveId = useUIStore.getState().activeConversationId;
          if (currentActiveId !== targetId) {
            console.log(`[ActiveConvLoader] Aborted - user switched to different conversation`);
            isLoadingRef.current = false;
            return;
          }

          // Use startTransition for non-blocking UI update
          startTransition(() => {
            useUIStore.setState((state) => {
              const existing = state.conversations[targetId];
              if (!existing) return {};

              // Only update if messages are different (avoid unnecessary renders)
              if (existing.messages.length === fullConv.messages.length &&
                existing.messages[0]?.id === fullConv.messages[0]?.id) {
                return {};
              }

              return {
                conversations: {
                  ...state.conversations,
                  [targetId]: {
                    ...existing,
                    messages: fullConv.messages,
                    checkpoints: fullConv.checkpoints,
                  },
                },
              };
            });
          });

          lastLoadedIdRef.current = targetId;
          const elapsed = performance.now() - startTime;
          console.log(`[ActiveConvLoader] Loaded ${fullConv.messages.length} messages in ${elapsed.toFixed(1)}ms`);

          // Pre-cache attachments in background (non-blocking, low priority)
          if (fullConv.messages.length > 0) {
            requestIdleCallback(() => {
              precacheConversationAttachments(fullConv.messages).catch(() => { });
            }, { timeout: 5000 });
          }
        }
      } catch (error) {
        console.error(`[ActiveConvLoader] Failed to load:`, error);
      } finally {
        isLoadingRef.current = false;
      }
    };

    // Start loading immediately
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
