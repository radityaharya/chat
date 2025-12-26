import { useEffect, useState, Fragment } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  useApiKey,
  useSetApiKey,
  useMessages,
  useClearMessages,
  useDeleteMessage,
  useSelectedModel,
  useSetSelectedModel,
  useSystemPrompt,
  useConversations,
  useActiveConversationId,
  useCreateConversation,
  useSetActiveConversation,
  useSetSystemPrompt,
  useCreateCheckpoint,
  useRestoreCheckpoint,
  useCheckpoints,
  useForkConversation,
} from '@/store';
import { useModels, useSendMessage } from '@/hooks/useChat';
import { useViewportHeight } from '@/hooks/useViewportHeight';
import { useMobileDetect } from '@/hooks/useMobileDetect';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ChatInput, type QueueMessage } from '@/components/chat/ChatInput';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { Loader } from '@/components/ai-elements/loader';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Checkpoint,
  CheckpointIcon,
  CheckpointTrigger,
} from '@/components/ai-elements/checkpoint';
import { MessageSquare, Settings, Trash2, LogOut, PanelLeft, RulerIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { nanoid } from 'nanoid';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

export const Route = createFileRoute('/')({
  component: ChatPage,
});

function ChatPage() {
  const navigate = useNavigate();
  const apiKey = useApiKey();
  const setApiKey = useSetApiKey();
  const messages = useMessages();
  const clearMessages = useClearMessages();
  const deleteMessage = useDeleteMessage();
  const selectedModel = useSelectedModel();
  const setSelectedModel = useSetSelectedModel();

  const conversations = useConversations();
  const activeId = useActiveConversationId();
  const createConversation = useCreateConversation();
  const setActiveConversation = useSetActiveConversation();
  const setSystemPrompt = useSetSystemPrompt();
  const checkpoints = useCheckpoints();
  const createCheckpoint = useCreateCheckpoint();
  const restoreCheckpoint = useRestoreCheckpoint();
  const forkConversation = useForkConversation();

  const { data: models, isLoading: _isLoadingModels } = useModels();
  const { sendMessage, regenerate, isStreaming, stopStreaming } = useSendMessage();

  // Mobile hooks
  useViewportHeight();
  const { isMobile } = useMobileDetect();

  const [queue, setQueue] = useState<QueueMessage[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [modelAlertOpen, setModelAlertOpen] = useState(false);
  const [systemPromptOpen, setSystemPromptOpen] = useState(false);

  // Update sidebar state when switching between mobile/desktop
  useEffect(() => {
    if (!isMobile) {
      setSidebarOpen(true);
    }
  }, [isMobile]);

  // Handle body scroll lock for mobile menu
  useEffect(() => {
    if (isMobile && sidebarOpen) {
      document.body.classList.add('mobile-menu-open');
    } else {
      document.body.classList.remove('mobile-menu-open');
    }
    return () => {
      document.body.classList.remove('mobile-menu-open');
    };
  }, [isMobile, sidebarOpen]);

  // Redirect to login if no API key
  useEffect(() => {
    if (!apiKey) {
      navigate({ to: '/login' });
    }
  }, [apiKey, navigate]);

  useEffect(() => {
    if (models && models.length > 0 && !selectedModel) {
      setSelectedModel(models[0].id);
    }
  }, [models, selectedModel, setSelectedModel]);

  // Ensure active conversation
  useEffect(() => {
    if (!activeId) {
      const ids = Object.keys(conversations);
      // Sort by update time to get most recent
      const sortedIds = ids.sort((a, b) => conversations[b].updatedAt - conversations[a].updatedAt);

      if (sortedIds.length > 0) {
        setActiveConversation(sortedIds[0]);
      } else {
        createConversation();
      }
    }
  }, [activeId, conversations, createConversation, setActiveConversation]);

  const systemPrompt = useSystemPrompt();

  // Process queue when not streaming
  useEffect(() => {
    if (!isStreaming && queue.length > 0 && selectedModel) {
      const nextItem = queue[0];
      setQueue((prev) => prev.slice(1));

      const processQueue = async () => {
        try {
          await sendMessage(nextItem.text, selectedModel, messages, systemPrompt, nextItem.files);
        } catch (e) {
          console.error("Queue error", e);
        }
      };
      processQueue();
    }
  }, [isStreaming, queue, selectedModel, messages, sendMessage, systemPrompt]);

  const handleSendMessage = async (content: string, attachments?: File[]) => {
    if (!selectedModel) {
      setModelAlertOpen(true);
      return;
    }

    if (isStreaming) {
      setQueue((prev) => [...prev, { id: nanoid(), text: content, files: attachments }]);
      return;
    }

    try {
      await sendMessage(content, selectedModel, messages, systemPrompt, attachments);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleRemoveQueueItem = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const handleRegenerate = async (id: string) => {
    if (!selectedModel) {
      setModelAlertOpen(true);
      return;
    }
    if (isStreaming) return;

    try {
      await regenerate(id, selectedModel, messages, systemPrompt);
    } catch (error) {
      console.error('Failed to regenerate:', error);
    }
  };

  const handleDeleteMessage = (id: string) => {
    deleteMessage(id);
  };

  const handleCreateCheckpoint = (id: string) => {
    createCheckpoint(id);
  };

  const handleRestoreCheckpoint = (id: string) => {
    restoreCheckpoint(id);
  };

  const handleForkConversation = (id: string) => {
    const newId = forkConversation(id);
    if (newId) {
      setActiveConversation(newId);
    }
  };

  const handleLogout = () => {
    setLogoutOpen(true);
  };

  const handleToggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleCloseSidebar = () => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  if (!apiKey) {
    return (
      <div className="min-h-screen bg-terminal-bg flex items-center justify-center">
        <Loader size={32} />
      </div>
    );
  }

  return (
    <div
      className="bg-terminal-bg text-terminal-text font-mono flex overflow-hidden"
      style={{ height: 'calc(var(--vh, 1vh) * 100)' }}
    >
      {/* Mobile Backdrop */}
      {isMobile && (
        <div
          className={`mobile-backdrop backdrop-transition ${sidebarOpen ? 'active' : ''}`}
          onClick={handleCloseSidebar}
        />
      )}

      {/* Sidebar */}
      <ChatSidebar
        isOpen={sidebarOpen}
        onClose={handleCloseSidebar}
        isMobile={isMobile}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-terminal-surface border-b border-terminal-border px-3 sm:px-4 py-2 sm:py-3 shrink-0 z-10">
          <div className="flex items-center justify-between max-w-4xl mx-auto w-full">
            <div className="flex items-center gap-2 overflow-hidden min-w-0">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleToggleSidebar}
                className="shrink-0 text-terminal-muted hover:text-terminal-text"
                aria-label="Toggle sidebar"
              >
                <PanelLeft className="size-4" />
              </Button>
              <h1 className="text-sm sm:text-lg font-bold truncate">
                {activeId && conversations[activeId] ? conversations[activeId].title : 'Chat'}
              </h1>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setSystemPromptOpen(true)}
                title="System Prompt"
                className={systemPrompt ? "text-terminal-green" : "text-terminal-muted hover:text-terminal-text"}
              >
                <RulerIcon className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => navigate({ to: '/settings' })}
                title="Settings"
                className="text-terminal-muted hover:text-terminal-text"
              >
                <Settings className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={clearMessages}
                disabled={messages.length === 0 || isStreaming}
                title="Clear Conversation"
                className="text-terminal-muted hover:text-terminal-text"
              >
                <Trash2 className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleLogout}
                title="Logout"
                className="text-terminal-muted hover:text-terminal-red"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </header>


        {/* Chat Messages */}
        <Conversation className="flex-1 bg-terminal-bg">
          <ConversationContent className="max-w-4xl mx-auto w-full py-3 px-3 sm:py-4 sm:px-4 relative z-0">
            {messages.length === 0 ? (
              <ConversationEmptyState
                icon={<MessageSquare className="size-12 opacity-50" />}
                title="No messages yet"
                description="Start a conversation by typing a message below"
                className="text-terminal-muted mt-12 sm:mt-20"
              />
            ) : (
              messages.map((message) => {
                const checkpoint = checkpoints.find(cp => cp.messageId === message.id);
                return (
                  <Fragment key={message.id}>
                    <ChatMessage
                      message={message}
                      onRegenerate={handleRegenerate}
                      onDelete={handleDeleteMessage}
                      onCheckpoint={handleCreateCheckpoint}
                      onFork={handleForkConversation}
                    />
                    {checkpoint && (
                      <Checkpoint>
                        <CheckpointIcon />
                        <CheckpointTrigger
                          onClick={() => handleRestoreCheckpoint(checkpoint.id)}
                        >
                          Restore checkpoint
                        </CheckpointTrigger>
                      </Checkpoint>
                    )}
                  </Fragment>
                );
              })
            )}
          </ConversationContent>
          <ConversationScrollButton className="bg-terminal-surface border-terminal-border hover:bg-terminal-border text-terminal-text" />
        </Conversation>

        {/* Input Area */}
        <footer className="bg-terminal-bg px-2 py-2 sm:px-4 sm:py-3 shrink-0 safe-bottom z-10">
          <div className="max-w-4xl mx-auto">
            <ChatInput
              onSend={handleSendMessage}
              disabled={!selectedModel}
              status={isStreaming ? 'streaming' : 'ready'}
              queue={queue}
              onRemoveQueueItem={handleRemoveQueueItem}
              onStop={stopStreaming}
              placeholder={
                !selectedModel
                  ? 'Select a model first...'
                  : 'Type a message...'
              }
              models={models || []}
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
            />
          </div>
        </footer>
      </div>

      <Dialog open={systemPromptOpen} onOpenChange={setSystemPromptOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>System Prompt</DialogTitle>
            <DialogDescription>
              Instructions for how the model should behave.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <Textarea
              placeholder="You are a helpful assistant..."
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="min-h-[200px] resize-none font-mono text-sm bg-terminal-surface border-terminal-border"
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setSystemPromptOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Logout</DialogTitle>
            <DialogDescription>
              Are you sure you want to logout? This will clear your API key from this device.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLogoutOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setApiKey(null);
                clearMessages();
                setLogoutOpen(false);
                navigate({ to: '/login' });
              }}
            >
              Logout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modelAlertOpen} onOpenChange={setModelAlertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No Model Selected</DialogTitle>
            <DialogDescription>
              Please select a model before sending a message.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setModelAlertOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
