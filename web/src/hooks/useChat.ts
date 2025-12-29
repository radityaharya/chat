import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useApiKey, useAddMessage, useUpdateMessage, type Message, useSetMessages } from '@/store';
import { getToolDefinitions, tools } from '@/tools';
import { UI_RESPONSE_GUIDE } from '@/lib/ui-response-guide';
import type { ToolUIPart } from 'ai';

const API_BASE_URL = '/api';

interface Model {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

interface ModelsResponse {
  object: string;
  data: Model[];
}

// Validate API key
export function useValidateAPIKey() {
  return useMutation({
    mutationFn: async (apiKey: string) => {
      const response = await fetch(`${API_BASE_URL}/v1/validate`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey} `,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to validate API key');
      }

      const data = await response.json();
      if (!data.valid) {
        throw new Error('Invalid API key');
      }

      return data;
    },
  });
}

// Fetch available models
export function useModels() {
  const apiKey = useApiKey();

  return useQuery({
    queryKey: ['models'],
    queryFn: async (): Promise<Model[]> => {
      const response = await fetch(`${API_BASE_URL}/v1/models`, {
        method: 'GET',
        headers: apiKey ? {
          'Authorization': `Bearer ${apiKey} `,
        } : {},
      });

      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }

      const data: ModelsResponse = await response.json();
      return data.data || [];
    },
    enabled: !!apiKey,
  });
}

// Helper to convert file to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

// Send message with SSE streaming
export function useSendMessage() {
  const apiKey = useApiKey();
  const addMessage = useAddMessage();
  const updateMessage = useUpdateMessage();
  const setMessages = useSetMessages();
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Helper to execute tools
  const executeTool = async (name: string, args: any): Promise<any> => {
    const tool = tools[name];
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }
    try {
      return await tool.execute(args);
    } catch (error: any) {
      return { error: error.message };
    }
  };

  // Function to stop streaming
  const stopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  };

  const streamResponse = async (
    apiMessages: any[],
    model: string,
    assistantMessageId: string
  ) => {
    if (!apiKey) {
      throw new Error('No API key configured');
    }

    try {
      let assistantContent = '';
      let assistantReasoning = '';
      let isDone = false;
      let iterationCount = 0;
      let allImages: any[] = [];
      const MAX_ITERATIONS = 10;

      // Helper to construct display content with reasoning
      const getFullContent = () => {
        if (assistantReasoning) {
          if (assistantContent) {
            return `<think>${assistantReasoning}</think>${assistantContent}`;
          }
          return `<think>${assistantReasoning}`;
        }
        return assistantContent;
      };

      while (!isDone && iterationCount < MAX_ITERATIONS) {
        iterationCount++;

        const response = await fetch(`${API_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: apiMessages,
            stream: true,
            tools: getToolDefinitions(),
          }),
          signal: abortControllerRef.current?.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        let toolCalls: Record<number, {
          id?: string,
          name?: string,
          arguments: string
        }> = {};

        let imageCalls: Record<number, {
          type: 'image_url',
          image_url: {
            url: string
          }
        }> = {};

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const choice = parsed.choices?.[0];
              const delta = choice?.delta;

              let shouldUpdate = false;

              if (delta?.reasoning_content) {
                assistantReasoning += delta.reasoning_content;
                shouldUpdate = true;
              }

              if (delta?.content) {
                assistantContent += delta.content;
                shouldUpdate = true;
              }

              if (delta?.images) {
                for (const img of delta.images) {
                  const index = img.index || 0;
                  if (!imageCalls[index]) {
                    imageCalls[index] = {
                      type: 'image_url',
                      image_url: { url: '' }
                    };
                  }
                  if (img.image_url?.url) {
                    const chunk = img.image_url.url;
                    const trimmedChunk = chunk.trimStart();
                    // If the chunk starts with 'data:', it's likely a full URL or a restart.
                    // Also check if the chunk contains a data URI definition that might be preceded by other chars
                    if (
                      (trimmedChunk.startsWith('data:') || chunk.indexOf('data:image/') !== -1) &&
                      imageCalls[index].image_url.url.length > 0
                    ) {
                      // If we find a new data header, we assume it's a replacement/refresh
                      // We take the part starting from data: if it was in the middle
                      const dataIndex = chunk.indexOf('data:image/');
                      if (dataIndex !== -1) {
                        imageCalls[index].image_url.url = chunk.substring(dataIndex);
                      } else {
                        imageCalls[index].image_url.url = trimmedChunk;
                      }
                    } else {
                      imageCalls[index].image_url.url += chunk;
                    }
                  }
                }
                shouldUpdate = true;
              }

              if (shouldUpdate) {
                updateMessage(assistantMessageId, getFullContent(), true, undefined, [...allImages, ...Object.values(imageCalls)]);
              }

              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const index = tc.index;
                  if (!toolCalls[index]) {
                    toolCalls[index] = { arguments: '' };
                  }
                  if (tc.id) toolCalls[index].id = tc.id;
                  if (tc.function?.name) toolCalls[index].name = tc.function.name;
                  if (tc.function?.arguments) toolCalls[index].arguments += tc.function.arguments;
                }
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }

        const finalToolCalls = Object.values(toolCalls);
        const finalImages = Object.values(imageCalls);
        allImages = [...allImages, ...finalImages];

        if (finalToolCalls.length === 0) {
          isDone = true;
          updateMessage(assistantMessageId, getFullContent(), false, undefined, allImages);
          break;
        }

        // Handle tool calls
        const toolPartsForUI = finalToolCalls.map(tc => {
          let args = {};
          try { args = JSON.parse(tc.arguments); } catch (e) { }
          return {
            type: `tool-${tc.name}` as const,
            state: 'input-available' as const,
            input: args,
            output: undefined,
            errorText: undefined,
            toolCallId: tc.id || '',
          } as ToolUIPart;
        });

        updateMessage(assistantMessageId, getFullContent(), true, toolPartsForUI, allImages);

        apiMessages.push({
          role: 'assistant',
          content: assistantContent || null,
          tool_calls: finalToolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: tc.arguments
            }
          }))
        } as any);

        const toolOutputs = await Promise.all(finalToolCalls.map(async (tc, index) => {
          let args = {};
          try { args = JSON.parse(tc.arguments); } catch (e) {
            console.error("Failed to parse tool arguments", e);
          }

          let result;
          let isError = false;
          try {
            if (tc.name) {
              result = await executeTool(tc.name, args);
            } else {
              result = { error: "Tool name missing" };
              isError = true;
            }
          } catch (e: any) {
            result = { error: e.message };
            isError = true;
          }

          toolPartsForUI[index].state = isError ? 'output-error' : 'output-available';
          toolPartsForUI[index].output = result;
          if (isError) toolPartsForUI[index].errorText = JSON.stringify(result.error);

          updateMessage(assistantMessageId, getFullContent(), true, [...toolPartsForUI], allImages);

          return {
            tool_call_id: tc.id,
            role: 'tool',
            name: tc.name, // Usually not required for 'tool' role but helpful
            content: JSON.stringify(result)
          };
        }));

        toolOutputs.forEach(output => {
          apiMessages.push(output as any);
        });
      } // while loop

      if (iterationCount >= MAX_ITERATIONS) {
        updateMessage(assistantMessageId, getFullContent() + "\n\n[System: Max tool iterations reached]", false);
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Stream aborted by user');
        updateMessage(assistantMessageId, 'Error: Stream aborted', false);
      } else {
        console.error('Error sending message:', error);
        updateMessage(assistantMessageId, 'Error: Failed to get response', false);
      }
      throw error;
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  }; // streamResponse

  const sendMessage = async (
    content: string,
    model: string,
    conversationHistory: Message[],
    systemPrompt?: string,
    attachments?: File[]
  ) => {
    if (!apiKey) {
      throw new Error('No API key configured');
    }

    abortControllerRef.current = new AbortController();
    setIsStreaming(true);

    // Prepare history
    let currentMessages = conversationHistory
      .filter(m => !m.streaming)
      .map(m => ({
        role: m.role,
        content: m.content as string | Array<any>,
      }));

    if (systemPrompt && systemPrompt.trim()) {
      // Always append UI response guide to user's system prompt
      const fullSystemPrompt = systemPrompt + UI_RESPONSE_GUIDE;
      currentMessages = [{ role: 'system', content: fullSystemPrompt }, ...currentMessages];
    } else {
      // If no custom system prompt, just use the UI guide
      currentMessages = [{ role: 'system', content: UI_RESPONSE_GUIDE.trim() }, ...currentMessages];
    }

    // Process attachments
    const processedAttachments = attachments ? await Promise.all(
      attachments.map(async (file) => ({
        file,
        url: await fileToBase64(file),
        isImage: file.type.startsWith('image/')
      }))
    ) : [];

    let apiContent: string | Array<any> = content;
    const apiImages = processedAttachments
      .filter(p => p.isImage)
      .map(p => ({
        type: 'image_url',
        image_url: {
          url: p.url,
        },
      }));

    if (apiImages.length > 0) {
      apiContent = [
        { type: 'text', text: content },
        ...apiImages,
      ];
    }

    currentMessages.push({ role: 'user', content: apiContent });

    // UI Updates
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      attachments: processedAttachments.map(p => ({
        url: p.url,
        contentType: p.file.type,
        name: p.file.name
      })),
    };
    addMessage(userMessage);

    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
      parts: [],
    };
    addMessage(assistantMessage);

    await streamResponse(currentMessages, model, assistantMessageId);
  };

  const regenerate = async (
    messageId: string,
    model: string,
    conversationHistory: Message[],
    systemPrompt?: string
  ) => {
    if (!apiKey) {
      throw new Error('No API key configured');
    }

    // Find message index
    const index = conversationHistory.findIndex(m => m.id === messageId);
    if (index === -1) return;

    // We assume we are regenerating from this point.
    // If it's an assistant message, we revert to state BEFORE it.
    // If it's a user message, we revert to state INCLUDING it?
    // Let's implement standard Assistant Regenerate:
    // The messageId passed is the Assistant message we want to replace.

    // Safety check: is it assistant?
    const targetMsg = conversationHistory[index];
    if (targetMsg.role !== 'assistant') {
      console.warn("Regenerate called on non-assistant message");
      return;
    }

    // Truncate history in Store
    // Keep 0 to index-1
    const newHistory = conversationHistory.slice(0, index);
    setMessages(newHistory);

    abortControllerRef.current = new AbortController();
    setIsStreaming(true);

    // Prepare API messages
    let apiMessages = newHistory
      .filter(m => !m.streaming)
      .map(m => ({
        role: m.role,
        content: m.content as string | Array<any>,
      }));

    if (systemPrompt && systemPrompt.trim()) {
      // Always append UI response guide to user's system prompt
      const fullSystemPrompt = systemPrompt + UI_RESPONSE_GUIDE;
      apiMessages = [{ role: 'system', content: fullSystemPrompt }, ...apiMessages];
    } else {
      // If no custom system prompt, just use the UI guide
      apiMessages = [{ role: 'system', content: UI_RESPONSE_GUIDE.trim() }, ...apiMessages];
    }

    // Add new assistant placeholder
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
      parts: [],
    };
    addMessage(assistantMessage);

    await streamResponse(apiMessages, model, assistantMessageId);
  };

  return { sendMessage, regenerate, isStreaming, stopStreaming };
}
