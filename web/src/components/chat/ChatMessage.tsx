
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
}

function parseThinkingTags(content: string): ParsedContent {
  const thinkStart = content.indexOf('<think>');
  if (thinkStart === -1) {
    return { thinking: null, response: content, isThinking: false };
  }

  const thinkEnd = content.indexOf('</think>');

  if (thinkEnd === -1) {
    // Open thinking tag, no close yet
    return {
      thinking: content.substring(thinkStart + 7),
      response: '',
      isThinking: true,
    };
  }

  return {
    thinking: content.substring(thinkStart + 7, thinkEnd),
    response: content.substring(thinkEnd + 8).trim(),
    isThinking: false,
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
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
          <div className="flex flex-col gap-2 mb-2">
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
          <MessageResponse>
            {parsed.response || ((!message.streaming && !hasTools && !hasImages) ? 'No response' : '')}
          </MessageResponse>
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
