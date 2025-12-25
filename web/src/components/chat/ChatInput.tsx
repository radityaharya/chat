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
} from '@/components/ai-elements/prompt-input';
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
  ModelSelectorTrigger,
} from '@/components/ai-elements/model-selector';
import { Button } from '@/components/ui/button';
import {
  CheckIcon,
  Trash2,
} from 'lucide-react';
import { useRef, useState, useMemo } from 'react';

// Define Model interface
export interface Model {
  id: string;
  object?: string;
  owned_by?: string;
}

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
}

// Helpers to parse model info for the UI
const getModelProvider = (modelId: string) => {
  const parts = modelId.split('/');
  if (parts.length > 1) return parts[0];
  if (modelId.startsWith('gpt')) return 'openai';
  if (modelId.startsWith('claude')) return 'anthropic';
  if (modelId.startsWith('gemini')) return 'google';
  return 'unknown';
};

const getProviderSlug = (provider: string) => {
  switch (provider.toLowerCase()) {
    case 'openai': return 'openai';
    case 'anthropic': return 'anthropic';
    case 'google': return 'google';
    case 'mistral': return 'mistral';
    default: return 'openai'; // fallback for logo
  }
};

const getProviderName = (provider: string) => {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
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
  status = "ready"
}: ChatInputProps) {
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedModelData = useMemo(() => {
    const model = models.find((m) => m.id === selectedModel);
    if (!model) return null;
    const provider = getModelProvider(model.id);
    return {
      ...model,
      chef: getProviderName(provider),
      chefSlug: getProviderSlug(provider),
      name: model.id
    }
  }, [models, selectedModel]);

  const groupedModels = useMemo(() => {
    const groups: Record<string, typeof models> = {};
    models.forEach(model => {
      const provider = getModelProvider(model.id);
      const name = getProviderName(provider);
      if (!groups[name]) groups[name] = [];
      groups[name].push(model);
    });
    return groups;
  }, [models]);

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

      onSend(message.text, convertedFiles);
    }
  };

  return (
    <div className="w-full flex flex-col justify-end">
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
        className="rounded-b-none border-b-0"
        globalDrop
        multiple
      >

        <PromptInputBody className="px-2 sm:px-3 pt-2">
          <PromptInputAttachments>
            {(attachment) => <PromptInputAttachment data={attachment} />}
          </PromptInputAttachments>
          <PromptInputTextarea
            ref={textareaRef}
            placeholder={placeholder}
            disabled={disabled}
            className="bg-terminal-bg border-terminal-border text-terminal-text min-h-[50px] sm:min-h-[60px] text-sm"
          />
        </PromptInputBody>

        <PromptInputFooter className="px-2 sm:px-3">
          <PromptInputTools>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger className="h-7 sm:h-8" />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>

            <ModelSelector
              onOpenChange={setModelSelectorOpen}
              open={modelSelectorOpen}
            >
              <ModelSelectorTrigger asChild>
                <PromptInputButton disabled={disabled} className="text-xs sm:text-sm h-7 sm:h-8 max-w-[140px] sm:max-w-none">
                  {selectedModelData?.chefSlug && (
                    <ModelSelectorLogo provider={selectedModelData.chefSlug} className="flex-shrink-0" />
                  )}
                  <ModelSelectorName className="truncate">
                    {selectedModelData?.name || "Select Model"}
                  </ModelSelectorName>
                </PromptInputButton>
              </ModelSelectorTrigger>

              <ModelSelectorContent className="w-[90vw] sm:w-auto">
                <ModelSelectorInput placeholder="Search models..." />
                <ModelSelectorList>
                  <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                  {Object.entries(groupedModels).map(([chef, chefModels]) => (
                    <ModelSelectorGroup key={chef} heading={chef}>
                      {chefModels.map((m) => {
                        const provider = getModelProvider(m.id);
                        const slug = getProviderSlug(provider);
                        return (
                          <ModelSelectorItem
                            key={m.id}
                            value={m.id}
                            onSelect={() => {
                              onSelectModel(m.id);
                              setModelSelectorOpen(false);
                            }}
                          >
                            <ModelSelectorLogo provider={slug} />
                            <ModelSelectorName className="text-xs sm:text-sm truncate">{m.id}</ModelSelectorName>
                            {selectedModel === m.id ? (
                              <CheckIcon className="ml-auto size-4 flex-shrink-0" />
                            ) : (
                              <div className="ml-auto size-4 flex-shrink-0" />
                            )}
                          </ModelSelectorItem>
                        )
                      })}
                    </ModelSelectorGroup>
                  ))}
                </ModelSelectorList>
              </ModelSelectorContent>
            </ModelSelector>
          </PromptInputTools>

          <div className="flex items-center gap-2">
            <PromptInputSubmit className="!h-7 sm:!h-8" disabled={disabled} status={status} />
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
