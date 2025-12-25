
import {
  Message,
  MessageAttachment,
  MessageAttachments,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
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
import { Loader2Icon } from 'lucide-react';

interface ChatMessageProps {
  message: StoreMessage;
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


export function ChatMessage({ message }: ChatMessageProps) {
  const parsed = parseThinkingTags(message.content);
  const hasThinking = parsed.thinking !== null;
  const hasTools = message.parts && message.parts.length > 0;

  // We are streaming the thought if the message is streaming AND we are inside an unclosed think block
  const isStreamingThought = message.streaming && parsed.isThinking;

  // Show generic loading if streaming but no content yet (and not thinking and not using tools)
  const showLoading = message.streaming && !parsed.response && !hasThinking && !hasTools;

  return (
    <Message from={message.role}>
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
        {(parsed.response || (!showLoading && !hasTools)) && (
          <MessageResponse>
            {parsed.response || ((!message.streaming && !hasTools) ? 'No response' : '')}
          </MessageResponse>
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
    </Message>
  );
}
