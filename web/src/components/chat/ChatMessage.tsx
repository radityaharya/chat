
import { useState, useMemo, useCallback, memo, useDeferredValue, useEffect, useRef } from 'react';
import {
  Message,
  MessageAttachment,
  MessageAttachments,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from '@/components/ai-elements/message';
import { Image } from '@/components/ai-elements/image';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning';
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool';
import {
  UIResponse,
  UIResponseHeader,
  UIResponseContent,
} from '@/components/ai-elements/ui-response';
import type { Message as StoreMessage } from '@/store';
import { useUIStore } from '@/store';
import {
  Loader2Icon,
  Copy,
  RefreshCw,
  Trash2,
  Check,
  BookmarkIcon,
  GitFork,
  Pencil,
} from 'lucide-react';
import { useMessageEditor } from '@/hooks/useMessageEditor';
import { cn } from '@/lib/utils';
import { parseUIResponses } from '@/lib/ui-response-parser';
import { splitContentWithArtifacts, type CodeArtifact } from '@/lib/artifacts';
import { MessageArtifact } from './MessageArtifact';

import { useSetQuotedText } from '@/store';
import { Quote } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@/components/ui/dialog";


interface ChatMessageProps {
  message: StoreMessage;
  onRegenerate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onCheckpoint?: (id: string) => void;
  onFork?: (id: string) => void;
}

interface ParsedContent {
  thinking: string | null;
  response: string;
  isThinking: boolean;
  uiResponses: Array<{
    id: string;
    type?: string;
    content: string;
    parsed?: any;
  }>;
}

function parseThinkingTags(content: string): ParsedContent {
  const thinkStart = content.indexOf('<think>');
  let contentAfterThinking = content;
  let thinking: string | null = null;
  let isThinking = false;

  if (thinkStart !== -1) {
    const thinkEnd = content.indexOf('</think>');

    if (thinkEnd === -1) {
      // Open thinking tag, no close yet
      thinking = content.substring(thinkStart + 7);
      contentAfterThinking = '';
      isThinking = true;
    } else {
      thinking = content.substring(thinkStart + 7, thinkEnd);
      contentAfterThinking = content.substring(thinkEnd + 8).trim();
    }
  }

  // Parse UI responses but DON'T remove them from content
  // We'll render them inline using Streamdown components
  const { uiResponses } = parseUIResponses(contentAfterThinking);

  return {
    thinking,
    response: contentAfterThinking, // Keep ui-response tags in content for inline rendering
    isThinking,
    uiResponses,
  };
}

// Helper to split content into segments with ui-response tags inline
// Moved OUTSIDE component to avoid re-creation on every render
function splitContentWithUIResponses(content: string) {
  const segments: Array<{ type: 'text' | 'ui-response'; content: string; uiType?: string; parsed?: any }> = [];
  const uiResponseRegex = /<ui-response(?:\s+type=["']([^"']+)["'])?\s*>([\s\S]*?)<\/ui-response>/g;

  let lastIndex = 0;
  let match;

  while ((match = uiResponseRegex.exec(content)) !== null) {
    // Add text before this ui-response
    if (match.index > lastIndex) {
      const textContent = content.substring(lastIndex, match.index);
      if (textContent.trim()) {
        segments.push({ type: 'text', content: textContent });
      }
    }

    // Add the ui-response
    const uiType = match[1] || 'data';
    const uiContent = match[2];
    let parsed: any = uiContent.trim();
    try {
      parsed = JSON.parse(uiContent.trim());
    } catch {
      parsed = uiContent.trim();
    }

    segments.push({
      type: 'ui-response',
      content: uiContent,
      uiType,
      parsed,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last ui-response
  if (lastIndex < content.length) {
    const textContent = content.substring(lastIndex);
    if (textContent.trim()) {
      segments.push({ type: 'text', content: textContent });
    }
  }

  return segments;
}


export const ChatMessage = memo(function ChatMessage({ message, onRegenerate, onDelete, onCheckpoint, onFork }: ChatMessageProps) {
  // Direct store access - slightly more efficient than hook wrapper
  const uiResponseEnabled = useUIStore((s) => s.uiResponseEnabled);
  const setQuotedText = useSetQuotedText();

  const [copied, setCopied] = useState(false);
  const [selection, setSelection] = useState<{ text: string; top: number; left: number } | null>(null);
  const selectionRef = useRef<HTMLDivElement>(null);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { editMessage } = useMessageEditor();

  // Handle starting edit mode
  const handleStartEdit = useCallback(() => {
    setEditContent(message.content);
    setIsEditing(true);
    // Focus the textarea after render
    setTimeout(() => editTextareaRef.current?.focus(), 0);
  }, [message.content]);

  // Handle saving edit
  const handleSaveEdit = useCallback(async () => {
    if (isSaving || editContent.trim() === '') return;
    setIsSaving(true);
    try {
      const success = await editMessage(message.id, editContent);
      if (success) {
        setIsEditing(false);
      }
    } finally {
      setIsSaving(false);
    }
  }, [editMessage, message.id, editContent, isSaving]);

  // Handle cancel edit
  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditContent('');
  }, []);

  // Handle keyboard shortcuts in edit mode
  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      handleCancelEdit();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSaveEdit();
    }
  }, [handleCancelEdit, handleSaveEdit]);


  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Ensure we don't show it if the selection is within another interactive element if possible
      // But for now, simple is better.
      setSelection({
        text: sel.toString().trim(),
        top: rect.top + window.scrollY,
        left: rect.left + rect.width / 2 + window.scrollX
      });
    } else {
      setSelection(null);
    }
  }, []);

  const handleAskAssistant = useCallback(() => {
    if (selection) {
      setQuotedText(selection.text);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    }
  }, [selection, setQuotedText]);

  // Close selection on scroll or window click
  useEffect(() => {
    const handleClose = (e: Event) => {
      // If the click is inside the selection menu, don't close it
      if (selectionRef.current && e.target instanceof Node && selectionRef.current.contains(e.target)) {
        return;
      }
      setSelection(null);
    };

    window.addEventListener('scroll', handleClose, { capture: true });
    window.addEventListener('resize', handleClose);
    window.addEventListener('mousedown', handleClose);
    return () => {
      window.removeEventListener('scroll', handleClose, { capture: true });
      window.removeEventListener('resize', handleClose);
      window.removeEventListener('mousedown', handleClose);
    };
  }, []);


  // OPTIMIZATION: Memoize expensive parsing operations
  const parsed = useMemo(() => {
    return parseThinkingTags(message.content);
  }, [message.content]);

  const hasThinking = parsed.thinking !== null;
  const hasTools = message.parts && message.parts.length > 0;
  const hasImages = message.images && message.images.length > 0;
  const hasInterleavedContent = message.parts?.some((p: any) => p.type === 'text') ?? false;

  // We are streaming the thought if the message is streaming AND we are inside an unclosed think block
  const isStreamingThought = message.streaming && parsed.isThinking;

  // Show generic loading if streaming but no content yet (and not thinking and not using tools)
  const showLoading = message.streaming && !parsed.response && !hasThinking && !hasTools;

  // Memoize copy handler to avoid recreation on each render
  const handleCopy = useCallback(() => {
    // Copy content without ui-response and think tags
    const { cleanedContent } = parseUIResponses(message.content);
    const contentWithoutThink = cleanedContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const contentToCopy = parsed.thinking
      ? `${parsed.thinking}\n\n${contentWithoutThink}`.trim()
      : contentWithoutThink;
    navigator.clipboard.writeText(contentToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content, parsed.thinking]);

  // OPTIMIZATION: Memoize content segments to avoid re-parsing on every render
  // Only re-compute when the actual content changes
  const rawContentSegments = useMemo(
    () => splitContentWithUIResponses(parsed.response),
    [parsed.response]
  );

  // React 19: useDeferredValue prevents blocking render during heavy artifact parsing
  // This fixes the "flash of unrendered content" on page load
  const contentSegments = useDeferredValue(rawContentSegments);

  return (
    <Message
      id={`message-${message.id}`}
      from={message.role}
      className="group/message w-full"
      data-streaming={message.streaming ? "true" : undefined}
      onMouseUp={handleMouseUp}
    >
      <MessageContent>

        {/* Editing mode for any message */}
        {isEditing ? (
          <div className="prose prose-invert w-full prose-sm max-w-none">
            <textarea
              ref={editTextareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleEditKeyDown}
              className="w-full bg-transparent text-terminal-text resize-none focus:outline-none leading-relaxed"
              placeholder="Edit your message..."
              rows={Math.max(1, editContent.split('\n').length)}
              style={{ minHeight: '1.5em' }}
            />
          </div>
        ) : (
          <>
            {hasThinking && (
              <Reasoning isStreaming={isStreamingThought}>
                <ReasoningTrigger />
                <ReasoningContent>{parsed.thinking || ''}</ReasoningContent>
              </Reasoning>
            )}
            {/* Render parts in order - interleaved text and tool parts */}
            {hasTools && message.parts?.map((part: any, index) => {
              // Text part - render as message content
              if (part.type === 'text') {
                const textContent = part.content as string;
                if (!textContent.trim()) return null;

                // Parse for UI responses
                const textSegments = splitContentWithUIResponses(textContent);
                return (
                  <div key={`text-${index}`} className="flex flex-col gap-2 mb-3">
                    {textSegments.map((segment, segIndex) => {
                      if (segment.type === 'text') {
                        const artifactSegments = splitContentWithArtifacts(segment.content);
                        return (
                          <div key={segIndex} className="flex flex-col gap-2">
                            {artifactSegments.map((artPart, pIndex) => {
                              if (artPart.type === 'text') {
                                return (
                                  <MessageResponse key={pIndex}>
                                    {artPart.content as string}
                                  </MessageResponse>
                                );
                              } else {
                                const artifact = artPart.content as CodeArtifact;
                                return (
                                  <MessageArtifact
                                    key={artifact.id || pIndex}
                                    artifact={artifact}
                                    messageId={message.id}
                                    index={pIndex}
                                  />
                                );
                              }
                            })}
                          </div>
                        );
                      } else {
                        // UI response segment
                        if (!uiResponseEnabled) {
                          return (
                            <MessageResponse key={segIndex}>
                              {`<ui-response type="${segment.uiType}">${segment.content}</ui-response>`}
                            </MessageResponse>
                          );
                        }
                        return (
                          <div key={segIndex} className="my-2">
                            <UIResponse>
                              <UIResponseHeader type={segment.uiType} />
                              <UIResponseContent data={segment.parsed} type={segment.uiType} />
                            </UIResponse>
                          </div>
                        );
                      }
                    })}
                  </div>
                );
              }

              // Tool part - render as tool
              if (part.type.startsWith('tool-')) {
                return (
                  <div key={`${part.toolCallId || index}`} className="mb-3">
                    <Tool className='rounded-none bg-terminal-surface'>
                      <ToolHeader
                        type={part.type}
                        state={part.state}
                        title={part.type.replace('tool-', '')}
                      />
                      <ToolContent>
                        <ToolInput input={part.input} />
                        <ToolOutput
                          output={part.output}
                          errorText={part.errorText}
                        />
                      </ToolContent>
                    </Tool>
                  </div>
                );
              }

              return null;
            })}
            {/* Render final content after all tool calls (or all content if no tools) */}
            {/* Skip this if content is already interleaved in parts */}
            {!hasInterleavedContent && (parsed.response || (!showLoading && !hasTools && !hasImages)) && (
              <>
                {contentSegments.length > 0 ? (
                  contentSegments.map((segment, index) => {
                    if (segment.type === 'text') {
                      // After streaming completes, split into artifacts
                      const artifactSegments = splitContentWithArtifacts(segment.content);
                      return (
                        <div key={index} className="flex flex-col gap-2">
                          {artifactSegments.map((part, pIndex) => {
                            if (part.type === 'text') {
                              return (
                                <MessageResponse key={pIndex}>
                                  {part.content as string}
                                </MessageResponse>
                              );
                            } else {
                              const artifact = part.content as CodeArtifact;
                              return (
                                <MessageArtifact
                                  key={artifact.id || pIndex}
                                  artifact={artifact}
                                  messageId={message.id}
                                  index={pIndex}
                                />
                              );
                            }
                          })}
                        </div>
                      );
                    } else {
                      // If UI responses are disabled, don't render the fancy component
                      if (!uiResponseEnabled) {
                        return (
                          <MessageResponse key={index}>
                            {`<ui-response type="${segment.uiType}">${segment.content}</ui-response>`}
                          </MessageResponse>
                        );
                      }

                      return (
                        <div key={index} className="my-2">
                          <UIResponse>
                            <UIResponseHeader type={segment.uiType} />
                            <UIResponseContent data={segment.parsed} type={segment.uiType} />
                          </UIResponse>
                        </div>
                      );
                    }
                  })
                ) : (
                  <MessageResponse>
                    {(!message.streaming && !hasTools && !hasImages) ? 'No response' : ''}
                  </MessageResponse>
                )}
              </>
            )}
            {message.images && message.images.length > 0 && (
              <div className="flex flex-col gap-2 my-2">
                {message.images.map((img, i) => (
                  <Dialog key={i}>
                    <DialogTrigger asChild>
                      <div className="cursor-pointer hover:opacity-90 transition-opacity">
                        <Image
                          url={img.image_url.url}
                          // Pass dummy values to satisfy potentially required props if strict
                          base64=""
                          mediaType="image/png"
                          uint8Array={new Uint8Array()}
                          alt="Message attachment"
                        />
                      </div>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl w-auto p-0 border-none bg-transparent shadow-none">
                      <DialogTitle className="sr-only">Image Preview</DialogTitle>
                      <div className="relative w-full flex items-center justify-center">
                        <Image
                          url={img.image_url.url}
                          base64=""
                          mediaType="image/png"
                          uint8Array={new Uint8Array()}
                          className="max-h-[85vh] w-auto max-w-full object-contain rounded-md"
                          alt="Message attachment preview"
                        />
                      </div>
                    </DialogContent>
                  </Dialog>
                ))}
              </div>
            )}
            {showLoading && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2Icon className="animate-spin size-3" />
                <span className="italic">Thinking...</span>
              </div>
            )}
            {message.attachments && message.attachments.length > 0 && (
              <MessageAttachments>
                {message.attachments.map((attachment, index) => (
                  <MessageAttachment
                    key={`${attachment.url}-${index}`}
                    data={{
                      type: 'file',
                      url: attachment.url,
                      filename: attachment.name,
                      mediaType: attachment.contentType,
                      parsedContent: attachment.parsedContent,
                    }}
                  />
                ))}
              </MessageAttachments>
            )}
          </>
        )}
      </MessageContent>

      {!message.streaming && (
        <MessageActions
          className={cn(
            "opacity-0 group-hover/message:opacity-100 transition-opacity",
            message.role === "user" && "justify-end",
            isEditing && "opacity-100" // Always show when editing
          )}
        >
          <MessageAction onClick={handleCopy} tooltip="Copy">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </MessageAction>

          {!isEditing && (
            <MessageAction onClick={handleStartEdit} tooltip="Edit">
              <Pencil size={14} />
            </MessageAction>
          )}

          {isEditing && (
            <>
              <MessageAction onClick={handleCancelEdit} tooltip="Cancel (Esc)">
                <Trash2 size={14} />
              </MessageAction>
              <MessageAction
                onClick={handleSaveEdit}
                tooltip="Save (⌘+Enter)"
                disabled={isSaving || !editContent.trim()}
              >
                {isSaving ? <Loader2Icon size={14} className="animate-spin" /> : <Check size={14} />}
              </MessageAction>
            </>
          )}

          {message.role === 'assistant' && onRegenerate && !isEditing && (
            <MessageAction onClick={() => onRegenerate(message.id)} tooltip="Regenerate">
              <RefreshCw size={14} />
            </MessageAction>
          )}

          {onCheckpoint && (
            <MessageAction onClick={() => onCheckpoint(message.id)} tooltip="Checkpoint">
              <BookmarkIcon size={14} />
            </MessageAction>
          )}

          {onFork && (
            <MessageAction onClick={() => onFork(message.id)} tooltip="Fork Conversation">
              <GitFork size={14} />
            </MessageAction>
          )}

          {onDelete && (
            <MessageAction onClick={() => onDelete(message.id)} tooltip="Delete">
              <Trash2 size={14} />
            </MessageAction>
          )}
        </MessageActions>
      )}

      {selection && createPortal(
        <div
          ref={selectionRef}
          className="fixed z-100 -translate-x-1/2 -translate-y-[calc(100%+8px)] animate-in fade-in zoom-in duration-200"
          style={{ top: selection.top - window.scrollY, left: selection.left - window.scrollX }}
        >

          <Button
            size="sm"
            onClick={handleAskAssistant}
            className="bg-terminal-surface border border-terminal-border text-terminal-text hover:bg-terminal-green hover:text-terminal-bg rounded-none shadow-xl flex items-center gap-2 h-8 px-3 font-mono text-xs whitespace-nowrap"
          >
            <Quote className="size-3" />
            Ask Assistant
          </Button>
        </div>,
        document.body
      )}
    </Message>
  );
}, (prevProps, nextProps) => {

  // Custom comparison for optimal memoization
  // Only re-render when these specific things change:

  // 1. Message content/state changed
  if (prevProps.message.content !== nextProps.message.content) return false;
  if (prevProps.message.streaming !== nextProps.message.streaming) return false;
  if (prevProps.message.id !== nextProps.message.id) return false;
  if (prevProps.message.role !== nextProps.message.role) return false;

  // 2. Parts (tool calls) changed - use shallow comparison for speed
  const prevParts = prevProps.message.parts;
  const nextParts = nextProps.message.parts;
  if (prevParts?.length !== nextParts?.length) return false;
  if (prevParts && nextParts) {
    for (let i = 0; i < prevParts.length; i++) {
      if (prevParts[i].toolCallId !== nextParts[i].toolCallId) return false;
      if (prevParts[i].state !== nextParts[i].state) return false;
    }
  }

  // 3. Images changed
  if (prevProps.message.images?.length !== nextProps.message.images?.length) return false;

  // 4. Attachments changed
  if (prevProps.message.attachments?.length !== nextProps.message.attachments?.length) return false;

  // Callbacks are stable (useCallback in parent), so skip comparing them
  return true;
});

ChatMessage.displayName = 'ChatMessage';
