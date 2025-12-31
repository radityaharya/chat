import { useState } from 'react';
import {
  useConversations,
  useActiveConversationId,
  useCreateConversation,
  useSetActiveConversation
} from '@/store';
import { useHistory } from '@/hooks/useHistory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Search, Trash2, MessageSquare, X } from 'lucide-react';
import { cn } from '@/lib/utils';
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
}

export function ChatSidebar({ className, isOpen = true, onClose, isMobile = false }: ChatSidebarProps) {
  const conversations = useConversations();
  const activeId = useActiveConversationId();
  const setActiveConversation = useSetActiveConversation();
  const createConversation = useCreateConversation();
  const { deleteConversationWithSync } = useHistory();

  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filteredChats = Object.values(conversations)
    .filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const handleCreateChat = () => {
    createConversation();
    setSearch('');
    if (isMobile && onClose) {
      onClose();
    }
  };

  const handleSelectChat = (chatId: string) => {
    setActiveConversation(chatId);
    if (isMobile && onClose) {
      onClose();
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-terminal-surface border-r border-terminal-border flex-shrink-0 drawer-transition",
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
            placeholder="Search chats..."
            className="pl-8 h-8 text-xs bg-terminal-bg border-terminal-border focus-visible:ring-terminal-primary"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filteredChats.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8">
              No chats found
            </div>
          ) : (
            filteredChats.map((chat) => (
              <div key={chat.id} className="group flex items-center gap-1 relative">
                <Button
                  variant={activeId === chat.id ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "flex-1 justify-start text-left text-xs font-normal h-9 truncate pr-8",
                    activeId === chat.id && "bg-terminal-border text-terminal-text shadow-sm"
                  )}
                  onClick={() => handleSelectChat(chat.id)}
                >
                  <MessageSquare className="mr-2 size-3.5 flex-shrink-0 opacity-70" />
                  <span className="truncate">{chat.title || "New Chat"}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    "absolute right-1 w-6 h-6 transition-opacity hover:bg-terminal-red/10 hover:text-terminal-red",
                    isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteId(chat.id);
                  }}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

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
              onClick={async () => {
                if (deleteId) {
                  try {
                    await deleteConversationWithSync(deleteId);
                  } catch (error) {
                    console.error('Failed to delete conversation:', error);
                  }
                }
                setDeleteId(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
