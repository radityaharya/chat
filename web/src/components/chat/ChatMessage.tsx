
import { useState } from 'react';
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
import {
  Loader2Icon,
  Copy,
  RefreshCw,
  Trash2,
  Check,
  BookmarkIcon,
  GitFork,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseUIResponses } from '@/lib/ui-response-parser';

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


export function ChatMessage({ message, onRegenerate, onDelete, onCheckpoint, onFork }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const parsed = parseThinkingTags(message.content);
  const hasThinking = parsed.thinking !== null;
  const hasTools = message.parts && message.parts.length > 0;
  const hasImages = message.images && message.images.length > 0;

  // We are streaming the thought if the message is streaming AND we are inside an unclosed think block
  const isStreamingThought = message.streaming && parsed.isThinking;

  // Show generic loading if streaming but no content yet (and not thinking and not using tools)
  const showLoading = message.streaming && !parsed.response && !hasThinking && !hasTools;

  const handleCopy = () => {
    // Copy content without ui-response and think tags
    const { cleanedContent } = parseUIResponses(message.content);
    const contentWithoutThink = cleanedContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const contentToCopy = parsed.thinking
      ? `${parsed.thinking}\n\n${contentWithoutThink}`.trim()
      : contentWithoutThink;
    navigator.clipboard.writeText(contentToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to split content into segments with ui-response tags inline
  const splitContentWithUIResponses = (content: string) => {
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
  };

  // Split content into segments for inline rendering
  const contentSegments = splitContentWithUIResponses(parsed.response);

  return (
    <Message from={message.role} className="group/message">
      <MessageContent>
        {hasThinking && (
          <Reasoning isStreaming={isStreamingThought}>
            <ReasoningTrigger />
            <ReasoningContent>{parsed.thinking || ''}</ReasoningContent>
          </Reasoning>
        )}
        {hasTools && (
          <div className="flex flex-col mb-3">
            {message.parts?.map((part, index) => {
              if (!part.type.startsWith('tool-')) return null;

              return (
                <Tool key={`${part.toolCallId || index}`}>
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
              );
            })}
          </div>
        )}
        {(parsed.response || (!showLoading && !hasTools && !hasImages)) && (
          <>
            {contentSegments.length > 0 ? (
              contentSegments.map((segment, index) => {
                if (segment.type === 'text') {
                  return (
                    <MessageResponse key={index}>
                      {segment.content}
                    </MessageResponse>
                  );
                } else {
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
              <Image
                key={i}
                url={img.image_url.url}
                // Pass dummy values to satisfy potentially required props if strict
                base64=""
                mediaType="image/png"
                uint8Array={new Uint8Array()}
              />
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
      </MessageContent>

      {!message.streaming && (
        <MessageActions
          className={cn(
            "opacity-0 group-hover/message:opacity-100 transition-opacity",
            message.role === "user" && "justify-end"
          )}
        >
          <MessageAction onClick={handleCopy} tooltip="Copy">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </MessageAction>

          {message.role === 'assistant' && onRegenerate && (
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
    </Message>
  );
}
