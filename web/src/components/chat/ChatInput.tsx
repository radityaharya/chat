import {
  Queue,
  QueueItem,
  QueueItemAction,
  QueueItemActions,
  QueueItemContent,
  QueueItemDescription,
  QueueItemIndicator,
  QueueSection,
  QueueSectionContent,
} from '@/components/ai-elements/queue';
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  PromptInputQuote,
  PromptInputCommand,

  PromptInputCommandInput,
  PromptInputCommandList,
  PromptInputCommandEmpty,
  PromptInputCommandGroup,
  PromptInputCommandItem,
} from '@/components/ai-elements/prompt-input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ModelSelector } from '@/components/chat/ModelSelector';
import {
  CheckIcon,
  Trash2,
  Wrench,
  ImageIcon,
  FileIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRef } from 'react';
import { useUIStore, useQuotedText, useSetQuotedText } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { tools } from '@/tools';
import { cn } from '@/lib/utils';


import type { Model } from '@/types/model';

export interface QueueMessage {
  id: string;
  text: string;
  files?: File[];
}


interface ChatInputProps {
  onSend: (message: string, attachments?: File[]) => void;
  disabled?: boolean;
  placeholder?: string;
  models: Model[];
  selectedModel: string | null;
  onSelectModel: (modelId: string) => void;
  queue?: QueueMessage[];
  onRemoveQueueItem?: (id: string) => void;
  status?: "submitted" | "streaming" | "ready" | "error";
  onStop?: () => void;
}

export function ChatInput({
  onSend,
  disabled,
  placeholder = 'Type a message...',
  models,
  selectedModel,
  onSelectModel,
  queue = [],
  onRemoveQueueItem,
  status = "ready",
  onStop
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Combined selector for tools - reduces from 3 subscriptions to 1
  const { enabledTools, setEnabledTools, toggleTool } = useUIStore(useShallow((s) => ({
    enabledTools: s.enabledTools,
    setEnabledTools: s.setEnabledTools,
    toggleTool: s.toggleTool,
  })));


  const quotedText = useQuotedText();
  const setQuotedText = useSetQuotedText();


  const suggestions = useUIStore(useShallow(state => {
    const activeId = state.activeConversationId;
    return activeId ? state.conversations[activeId]?.suggestions || [] : [];
  }));

  const handleSuggestionClick = (suggestion: string) => {
    const textarea = textareaRef.current;
    if (textarea && !disabled) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      nativeInputValueSetter?.call(textarea, suggestion);
      const event = new Event('input', { bubbles: true });
      textarea.dispatchEvent(event);
      textarea.focus();
      textarea.form?.requestSubmit();
    }
  };

  const handleSubmit = async (message: PromptInputMessage) => {
    if ((message.text || message.files?.length) && !disabled) {
      const convertedFiles: File[] = [];

      if (message.files && message.files.length > 0) {
        for (const filePart of message.files) {
          // Verify it's a file part with a URL
          if (filePart.type === 'file' && filePart.url) {
            try {
              const response = await fetch(filePart.url);
              const blob = await response.blob();
              // Cast filePart to any to access custom properties like filename/mediaType that might be added by PromptInput
              const filename = (filePart as any).filename || 'attachment';
              const type = (filePart as any).mediaType || blob.type;

              convertedFiles.push(new File([blob], filename, { type }));
            } catch (error) {
              console.error('Failed to process attachment:', error);
            }
          }
        }
      }

      let finalText = message.text;
      if (quotedText) {
        finalText = `> ${quotedText}\n\n${finalText}`;
        setQuotedText(null); // Clear after sending
      }

      onSend(finalText, convertedFiles);
    }
  };

  return (
    <div className="w-full flex flex-col justify-end">
      {suggestions.length > 0 && (
        <Suggestions className="mb-2 w-full">
          {suggestions.map((suggestion, index) => (
            <Suggestion
              key={index}
              onClick={handleSuggestionClick}
              suggestion={suggestion}
              className='rounded-none bg-terminal-surface'
            />
          ))}
        </Suggestions>
      )}
      {queue.length > 0 && (
        <Queue className="mb-1 sm:mb-2 mx-auto max-h-[120px] sm:max-h-[150px] w-full overflow-y-auto rounded-lg border bg-background">
          <QueueSection>
            <QueueSectionContent>
              {queue.map((item) => (
                <QueueItem key={item.id}>
                  <div className="flex items-center gap-2">
                    <QueueItemIndicator completed={false} />
                    <QueueItemContent className="text-xs sm:text-sm truncate">{item.text}</QueueItemContent>
                    <QueueItemActions>
                      <QueueItemAction onClick={() => onRemoveQueueItem?.(item.id)}>
                        <Trash2 size={12} />
                      </QueueItemAction>
                    </QueueItemActions>
                  </div>
                  {item.files && item.files.length > 0 && (
                    <QueueItemDescription className="text-xs">
                      {item.files.length} attachment(s)
                    </QueueItemDescription>
                  )}
                </QueueItem>
              ))}
            </QueueSectionContent>
          </QueueSection>
        </Queue>
      )}
      <PromptInput
        onSubmit={handleSubmit}
        className="rounded-none border-b-0"
        globalDrop
        multiple
      >
        {quotedText && (
          <PromptInputQuote onRemove={() => setQuotedText(null)}>
            {quotedText}
          </PromptInputQuote>
        )}

        <PromptInputBody className="px-2 sm:px-3 pt-2 bg-terminal-surface">
          <PromptInputAttachments>
            {(attachment) => <PromptInputAttachment data={attachment} />}
          </PromptInputAttachments>
          <PromptInputTextarea
            ref={textareaRef}
            placeholder={placeholder}
            disabled={disabled}
            className="bg-terminal-surface border-terminal-border text-terminal-text min-h-[50px] sm:min-h-[60px] text-sm"
          />
        </PromptInputBody>

        <PromptInputFooter className="px-2 sm:px-3">
          <PromptInputTools>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger className="h-7 sm:h-8 rounded-none border border-transparent hover:border-terminal-border hover:bg-terminal-surface/50" />
              <PromptInputActionMenuContent className="rounded-none border-terminal-border">
                <PromptInputActionAddAttachments
                  label="Photos"
                  accept="image/*"
                  icon={<ImageIcon className="mr-2 size-4" />}
                  className="rounded-none hover:bg-terminal-bg/50 focus:bg-terminal-bg/50"
                />
                <PromptInputActionAddAttachments
                  label="Files"
                  accept=""
                  icon={<FileIcon className="mr-2 size-4" />}
                  className="rounded-none hover:bg-terminal-bg/50 focus:bg-terminal-bg/50"
                />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>

            <Popover>
              <PopoverTrigger asChild>
                <PromptInputButton
                  className={cn(
                    "h-7 sm:h-8 transition-colors rounded-none border border-transparent hover:border-terminal-border hover:bg-terminal-surface/50",
                    enabledTools.length > 0 ? "text-terminal-green hover:bg-terminal-green/5 hover:border-terminal-green/30 px-2" : "text-terminal-muted"
                  )}
                  size={enabledTools.length > 0 ? undefined : "icon-sm"}
                  variant="ghost"
                  disabled={disabled}
                >
                  <Wrench className="size-4" />
                  {enabledTools.length > 0 && (
                    <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-none bg-terminal-green px-1 text-[9px] font-bold text-terminal-bg font-mono">
                      {enabledTools.length}
                    </span>
                  )}
                </PromptInputButton>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0 rounded-none border-terminal-border bg-terminal-surface" align="start">
                <PromptInputCommand className="rounded-none">
                  <PromptInputCommandInput placeholder="Search tools..." className="rounded-none border-b border-terminal-border font-mono" />
                  <PromptInputCommandList className="rounded-none">
                    <PromptInputCommandEmpty className="p-2 text-sm text-center text-terminal-muted font-mono">
                      No tools found.
                    </PromptInputCommandEmpty>

                    <PromptInputCommandGroup heading="Available Tools" className="font-mono text-xs">
                      {Object.values(tools).map((tool) => {
                        const ToolIcon = tool.icon || Wrench;
                        return (
                          <PromptInputCommandItem
                            key={tool.name}
                            onSelect={() => toggleTool(tool.name)}
                            value={tool.name}
                            className="flex items-center justify-between rounded-none aria-selected:bg-terminal-bg/50"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <ToolIcon className="size-4 shrink-0 opacity-50" />
                              <div className="flex flex-col min-w-0">
                                <span className="font-medium truncate">{tool.name}</span>
                                <span className="text-xs text-terminal-muted line-clamp-1">{tool.description}</span>
                              </div>
                            </div>
                            {enabledTools.includes(tool.name) && (
                              <CheckIcon className="ml-2 size-4 text-terminal-green shrink-0" />
                            )}
                          </PromptInputCommandItem>
                        );
                      })}
                    </PromptInputCommandGroup>
                  </PromptInputCommandList>
                  <div className="p-1 border-t border-terminal-border">
                    <div className="flex w-full gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 h-8 text-[10px] rounded-none hover:bg-terminal-bg/50 font-mono"
                        onClick={() => setEnabledTools(Object.keys(tools))}
                      >
                        Enable All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 h-8 text-[10px] rounded-none hover:bg-terminal-bg/50 font-mono"
                        onClick={() => setEnabledTools([])}
                      >
                        Disable All
                      </Button>
                    </div>
                  </div>
                </PromptInputCommand>
              </PopoverContent>
            </Popover>

            <ModelSelector
              models={models}
              selectedModel={selectedModel}
              onSelectModel={onSelectModel}
              disabled={disabled}
            />
          </PromptInputTools>

          <div className="flex items-center gap-2">
            <PromptInputSubmit
              className="h-7! sm:h-8! rounded-none border border-terminal-border hover:bg-terminal-green hover:text-terminal-bg hover:border-terminal-green transition-colors disabled:opacity-50"
              disabled={disabled}
              status={status}
              onStop={onStop}
            />
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div >
  );
}
