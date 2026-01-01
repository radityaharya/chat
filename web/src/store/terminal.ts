import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface HistoryItem {
  command: string;
  output: string;
  cwd: string;
  timestamp: number;
  source: 'user' | 'agent';
}

interface TerminalState {
  // Global maps keyed by conversationId
  cwds: Record<string, string>;
  histories: Record<string, HistoryItem[]>;
  isPending: boolean;

  // Actions
  setCwd: (conversationId: string, cwd: string) => void;
  addHistoryItem: (conversationId: string, item: Omit<HistoryItem, 'timestamp'>) => void;
  clearHistory: (conversationId: string) => void;
  setPending: (pending: boolean) => void;

  // Helpers getters
  getCwd: (conversationId: string | null) => string;
  getHistory: (conversationId: string | null) => HistoryItem[];
}

export const useTerminalStore = create<TerminalState>()(
  persist(
    (set, get) => ({
      cwds: {},
      histories: {},
      isPending: false,

      setCwd: (id, cwd) => set((state) => ({
        cwds: { ...state.cwds, [id]: cwd }
      })),

      addHistoryItem: (id, item) => set((state) => {
        const currentHistory = state.histories[id] || [];
        return {
          histories: {
            ...state.histories,
            [id]: [...currentHistory, { ...item, timestamp: Date.now() }]
          }
        };
      }),

      clearHistory: (id) => set((state) => {
        const { [id]: _, ...rest } = state.histories;
        return { histories: rest }; // OR just set to empty array? Let's remove key or empty array.
        // Better to empty array to keep key existence if relevant, but removing is cleaner for storage.
        // Actually, UI expects an array.
        return {
          histories: { ...state.histories, [id]: [] }
        };
      }),

      setPending: (isPending) => set({ isPending }),

      getCwd: (id) => {
        if (!id) return '/root';
        return get().cwds[id] || '/root';
      },

      getHistory: (id) => {
        if (!id) return [];
        return get().histories[id] || [];
      }
    }),
    {
      name: 'terminal-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        cwds: state.cwds,
        histories: state.histories,
      }),
    }
  )
);
