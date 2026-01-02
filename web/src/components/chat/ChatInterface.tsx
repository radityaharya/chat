import { useEffect, useState, Fragment } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  useChatInterfaceState,
  useChatInterfaceActions,
} from '@/store';
import { useModels, useSendMessage } from '@/hooks/useChat';
import { useUpdateConfig } from '@/hooks/useConfig';
import { useCheckAuth } from '@/hooks/useAuth';
import { useHistory } from '@/hooks/useHistory';
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
import { ArtifactsPanel } from '@/components/chat/ArtifactsPanel';
import { MessageSquare, Settings, LogOut, PanelLeft, RulerIcon, Cloud, CloudOff, CodeIcon } from 'lucide-react';
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
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';

import { useAutoSaveArtifacts } from '@/hooks/useAutoSaveArtifacts';
import { useAutoCd } from '@/hooks/useAutoCd';

export function ChatInterface() {
  useAutoSaveArtifacts(); // Auto-save artifacts
  useAutoCd(); // Auto-cd to workspace
  const navigate = useNavigate();

  // Combined state hook - reduces from 15+ subscriptions to 1
  const {
    apiKey,
    systemPrompt,
    conversations,
    activeConversationId: activeId,
    messages,
    checkpoints,
    selectedModel,
    lastSyncedAt,
    artifactsPanelOpen,
  } = useChatInterfaceState();

  // Combined actions hook - stable references
  const {
    setApiKey,
    setSystemPrompt,
    setActiveConversation,
    clearMessages,
    deleteMessage,
    setSelectedModel,
    createCheckpoint,
    restoreCheckpoint,
    forkConversation,
    toggleArtifactsPanel,
  } = useChatInterfaceActions();

  const { data: models, isLoading: _isLoadingModels } = useModels();
  // const { data: config } = useConfig();
  const { mutate: updateConfig } = useUpdateConfig();
  const { sendMessage, regenerate, isStreaming, stopStreaming } = useSendMessage();
  const { data: authStatus, isLoading: isCheckingAuth } = useCheckAuth();
  const { syncHistory, loadHistory, syncStatus } = useHistory();

  // Determine if we are starting with a specific message to highlight
  const startMessageId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('msg')
    : null;

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

  // Redirect to login if not authenticated (wait for auth check to complete)
  useEffect(() => {
    if (!isCheckingAuth && !apiKey && !authStatus?.authenticated) {
      navigate({ to: '/login' });
    }
  }, [apiKey, authStatus, isCheckingAuth, navigate]);

  // Load history on initial authentication
  useEffect(() => {
    if (authStatus?.authenticated) {
      // Always load history on mount to get latest data from server
      loadHistory().catch((error) => {
        console.error('Failed to load history:', error);
      });
    }
    // Only run once on mount when authentication status changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus?.authenticated]);

  // Auto-sync every 2 minutes when authenticated
  useEffect(() => {
    if (!authStatus?.authenticated) return;

    const interval = setInterval(() => {
      syncHistory().catch((error) => {
        console.error('Auto-sync failed:', error);
      });
    }, 120000); // 2 minutes

    return () => clearInterval(interval);
  }, [authStatus, syncHistory]);

  // Debounced sync after streaming completes (3 seconds after streaming stops)
  useEffect(() => {
    if (!authStatus?.authenticated || messages.length === 0 || isStreaming) return;

    const timeoutId = setTimeout(() => {
      syncHistory().catch((error) => {
        console.error('Message sync failed:', error);
      });
    }, 3000); // 3 seconds debounce after streaming stops

    return () => clearTimeout(timeoutId);
  }, [isStreaming, messages.length, authStatus, syncHistory]);

  // Scroll to message from URL param (Search navigation)
  useEffect(() => {
    if (messages.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const msgId = params.get('msg');

    if (msgId) {
      // Use polling to robustly find the element even if rendering is delayed
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds max
      const intervalId = setInterval(() => {
        const element = document.getElementById(`message-${msgId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Flash highlight
          element.classList.add('message-highlight');
          setTimeout(() => {
            element.classList.remove('message-highlight');
          }, 2000);
          clearInterval(intervalId); // Found it, stop polling
        }

        attempts++;
        if (attempts >= maxAttempts) {
          clearInterval(intervalId); // Give up
        }
      }, 100);

      return () => clearInterval(intervalId);
    }
  }, [messages, activeId]); // Run when messages load or conversation changes


  useEffect(() => {
    if (models && models.length > 0 && !selectedModel) {
      setSelectedModel(models[0].id);
    }
  }, [models, selectedModel, setSelectedModel]);

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
    // CRITICAL: Don't include 'messages' or 'sendMessage' in deps - causes re-run on every chunk!
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, queue.length, selectedModel, systemPrompt]);

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
      // Route update is separate, but setActiveConversation updates store.
      // The parent route component should probably detect change and navigate?
      // Or we assume the store update is enough if we just re-render?
      // Wait, if we are at /c/123 and fork to newId (456), store has 456.
      // But URL is still /c/123.
      // We should navigate.
      navigate({ to: `/c/${newId}` });
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

  if (isCheckingAuth || (!apiKey && !authStatus)) {
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
              {/* Sync Status Indicator */}
              {authStatus?.authenticated && activeId && conversations[activeId] && (
                <div
                  className="flex items-center gap-1 text-xs text-terminal-muted"
                  title={
                    syncStatus.syncing
                      ? 'Syncing...'
                      : syncStatus.error
                        ? `Sync error: ${syncStatus.error}`
                        : lastSyncedAt
                          ? `Last synced: ${new Date(lastSyncedAt).toLocaleTimeString()}`
                          : 'Not synced yet'
                  }
                >
                  {syncStatus.syncing ? (
                    <Cloud className="size-3 animate-pulse text-terminal-blue" />
                  ) : syncStatus.error ? (
                    <CloudOff className="size-3 text-terminal-red" />
                  ) : lastSyncedAt && conversations[activeId].updatedAt <= lastSyncedAt ? (
                    <Cloud className="size-3 text-terminal-green" />
                  ) : (
                    <CloudOff className="size-3 text-terminal-yellow" />
                  )}
                </div>
              )}
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
                onClick={() => navigate({ to: '/user/settings' })}
                title="User Settings"
                className="text-terminal-muted hover:text-terminal-text"
              >
                <Settings className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleArtifactsPanel}
                title="Toggle Artifacts"
                className={artifactsPanelOpen ? "text-terminal-green" : "text-terminal-muted hover:text-terminal-text"}
              >
                <CodeIcon className="size-4" />
              </Button>
              <div className="w-px h-4 bg-terminal-border mx-1" />
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
        <Conversation
          key={activeId} // CRITICAL: Reset scroll state when conversation changes
          className="flex-1 bg-terminal-bg"
          initial={startMessageId ? false : "smooth"}
        >
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
              onSelectModel={(model) => {
                setSelectedModel(model);
                updateConfig({ default_model: model });
              }}
            />
          </div>
        </footer>
      </div>

      {/* Artifacts Panel - Desktop */}
      {artifactsPanelOpen && !isMobile && (
        <div className="hidden lg:block h-full border-l border-terminal-border bg-terminal-bg relative z-10 w-80 xl:w-96 shrink-0 transition-all duration-300">
          <ArtifactsPanel />
        </div>
      )}

      {/* Artifacts Panel - Mobile Sheet */}
      <Sheet open={artifactsPanelOpen && isMobile} onOpenChange={toggleArtifactsPanel}>
        <SheetContent side="right" className="w-[85vw] sm:w-[400px] p-0 border-l border-terminal-border bg-terminal-bg text-terminal-text">
          <ArtifactsPanel />
        </SheetContent>
      </Sheet>

      <Dialog open={systemPromptOpen} onOpenChange={setSystemPromptOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
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
