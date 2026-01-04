import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useUIStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { useHistory } from '@/hooks/useHistory';
import { searchConversations } from '@/lib/conversation-storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Search, Trash2, MessageSquare, X, Loader2, MoreHorizontal, Settings, RulerIcon, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { SettingsModal } from '@/components/chat/SettingsModal';
import {
  Dialog,

  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface ChatSidebarProps {
  className?: string;
  isOpen?: boolean;
  onClose?: () => void;
  isMobile?: boolean;
  onOpenSystemPrompt?: () => void;
  systemPromptActive?: boolean;
  onLogout?: () => void;
}

export function ChatSidebar({ className, isOpen = true, onClose, isMobile = false, onOpenSystemPrompt, systemPromptActive = false, onLogout }: ChatSidebarProps) {
  const navigate = useNavigate();

  // Combined selector - reduces from 4 subscriptions to 1
  const { conversations, activeId, createConversation, setActiveConversation } = useUIStore(useShallow((s) => ({
    conversations: s.conversations,
    activeId: s.activeConversationId,
    createConversation: s.createConversation,
    setActiveConversation: s.setActiveConversation,
  })));

  const { deleteConversationWithSync } = useHistory();

  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<typeof conversations[keyof typeof conversations][]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Perform search against IndexedDB
  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const debounceTimer = setTimeout(async () => {
      try {
        const results = await searchConversations(search);
        // Map back to format with extra match data
        setSearchResults(results.map(r => ({
          id: r.id,
          title: r.title,
          messages: [],
          checkpoints: [],
          updatedAt: r.updatedAt,
          matches: r.matches, // Pass through matches
        })));
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 150); // Debounce

    return () => clearTimeout(debounceTimer);
  }, [search]);

  // Use search results when searching, otherwise use Zustand conversations
  const displayedChats = useMemo(() => {
    if (search.trim() && searchResults.length > 0) {
      return searchResults;
    }
    if (search.trim()) {
      // Fallback local filter
      return Object.values(conversations)
        .filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return Object.values(conversations).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [conversations, search, searchResults]);

  const handleCreateChat = useCallback(() => {
    const newId = createConversation();
    if (newId) {
      navigate({ to: `/c/${newId}` });
    }
    setSearch('');
    if (isMobile && onClose) {
      onClose();
    }
  }, [createConversation, navigate, isMobile, onClose]);

  const handleSelectChat = useCallback((chatId: string, messageId?: string) => {
    // Set active conversation in store first
    setActiveConversation(chatId);

    // Navigate with message hash if provided
    const to = `/c/${chatId}` + (messageId ? `?msg=${messageId}` : '');
    navigate({ to });

    // On mobile, delay closing to ensure navigation/state updates complete first
    // This prevents the sidebar close animation from interfering with conversation loading
    if (isMobile && onClose) {
      requestAnimationFrame(() => {
        onClose();
      });
    }
  }, [setActiveConversation, navigate, isMobile, onClose]);

  const handleDeleteChat = useCallback(async () => {
    if (!deleteId) return;

    try {
      // Delete from backend first
      await deleteConversationWithSync(deleteId);
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    } finally {
      setDeleteId(null);
    }
  }, [deleteId, deleteConversationWithSync]);

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-terminal-surface border-r border-terminal-border shrink-0 drawer-transition",
        isMobile ? [
          "fixed top-0 left-0 bottom-0 z-50 w-[280px] sm:w-80",
          isOpen ? "translate-x-0" : "-translate-x-full"
        ] : [
          "w-64 relative",
          !isOpen && "hidden"
        ],
        className
      )}
    >
      <div className="p-3 border-b border-terminal-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm text-terminal-text">Conversations</h2>
          {isMobile && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              className="text-terminal-muted hover:text-terminal-text"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
        <Button
          onClick={handleCreateChat}
          className="w-full justify-start font-normal text-terminal-bg bg-terminal-green hover:bg-terminal-green/90"
          size="sm"
        >
          <Plus className="mr-2 size-4" /> New Chat
        </Button>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            className="pl-8 h-8 text-xs bg-terminal-bg border-terminal-border focus-visible:ring-terminal-primary"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {isSearching && (
            <Loader2 className="absolute right-2.5 top-2.5 size-3.5 text-muted-foreground animate-spin" />
          )}
        </div>
        {search.trim() && !isSearching && (
          <div className="text-xs text-muted-foreground">
            {displayedChats.length} result{displayedChats.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 h-px" onScrollCapture={() => setOpenMenuId(null)}>
        <div className="p-2 space-y-1">
          {displayedChats.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8">
              {search ? 'No matching conversations' : 'No chats yet'}
            </div>
          ) : (
            displayedChats.map((chat: any) => (
              <div key={chat.id} className="relative group mb-0.5">
                <Button
                  variant={activeId === chat.id ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "w-full justify-start text-left text-xs font-normal h-9 overflow-hidden pr-2",
                    activeId === chat.id && "bg-terminal-border text-terminal-text shadow-sm"
                  )}
                  onClick={() => handleSelectChat(chat.id)}
                >
                  {/* <MessageSquare className="mr-2 size-3.5 shrink-0 opacity-70" /> */}
                  <span className={cn(
                    "w-0 flex-1 truncate transition-all duration-200",
                    "group-hover:mr-6"
                  )}>
                    {chat.title || "New Chat"}
                  </span>
                </Button>

                {/* 3-dot Menu - Absolute positioned */}
                <div className={cn(
                  "absolute right-1 top-1/2 -translate-y-1/2",
                  isMobile || openMenuId === chat.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 transition-opacity"
                )}>
                  <Popover open={openMenuId === chat.id} onOpenChange={(open) => setOpenMenuId(open ? chat.id : null)}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="w-6 h-6 text-muted-foreground hover:text-foreground hover:bg-terminal-surface"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="size-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-36 p-1 bg-terminal-surface border-terminal-border"
                      align="end"
                      side="right"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-xs font-normal text-terminal-red hover:bg-terminal-red/10 hover:text-terminal-red"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteId(chat.id);
                        }}
                      >
                        <Trash2 className="mr-2 size-3.5" />
                        Delete
                      </Button>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Search Matches */}
                {chat.matches && chat.matches.length > 0 && (
                  <div className="pl-6 pr-2 pb-2 space-y-1">
                    {chat.matches.slice(0, 3).map((match: any, idx: number) => (
                      <div
                        key={`${chat.id}-${match.messageId}-${idx}`}
                        className="text-[10px] text-muted-foreground bg-terminal-surface/50 hover:bg-terminal-surface p-1.5 rounded cursor-pointer border border-transparent hover:border-terminal-border transition-colors truncate"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectChat(chat.id, match.messageId);
                        }}
                        title={match.preview}
                      >
                        <span className="opacity-50 mr-1">↳</span> "{match.preview}"
                      </div>
                    ))}
                    {chat.matches.length > 3 && (
                      <div className="text-[10px] text-muted-foreground pl-2 opacity-50">
                        +{chat.matches.length - 3} more matches
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Sidebar Footer - Settings */}
      <div className="p-2 border-t border-terminal-border flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenSystemPrompt}
          title="System Prompt"
          className={cn(
            "flex-1 justify-start text-xs font-normal",
            systemPromptActive ? "text-terminal-green" : "text-terminal-muted hover:text-terminal-text"
          )}
        >
          <RulerIcon className="mr-2 size-3.5" />
          Rules
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSettingsOpen(true)}
          title="User Settings"
          className="flex-1 justify-start text-xs font-normal text-terminal-muted hover:text-terminal-text"
        >
          <Settings className="mr-2 size-3.5" />
          Settings
        </Button>
        {onLogout && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            title="Logout"
            className="flex-none px-2 justify-center text-xs font-normal text-terminal-muted hover:text-terminal-red"
          >
            <LogOut className="size-3.5" />
          </Button>
        )}
      </div>

      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Chat</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this conversation? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDeleteChat}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
