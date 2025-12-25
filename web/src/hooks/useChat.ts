import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useApiKey, useAddMessage, useUpdateMessage, type Message } from '@/store';
import { getToolDefinitions, tools } from '@/tools';
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

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();
    setIsStreaming(true);

    // Filter out streaming flag from history and prepare initial messages
    // We clone the history to avoid mutating the state directly and because we might append tool messages
    let currentMessages = conversationHistory
      .filter(m => !m.streaming)
      .map(m => ({
        role: m.role,
        content: m.content as string | Array<any>,
        // Add existing parts if any (though standard API might not expect them in this format,
        // we usually reconstruct the 'conversation' for the API differently.
        // For simplicity, we'll assume we just need role/content for the API history
        // unless we need to persist tool calls history which is more complex.
        // todo: properly format tool calls history for API if needed.
        // For now, we'll stick to a simple chat history but we need to handle the new user message.
      }));

    // Add system prompt
    if (systemPrompt && systemPrompt.trim()) {
      currentMessages = [{ role: 'system', content: systemPrompt }, ...currentMessages];
    }

    // Process attachments for the NEW user message
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

    // Add the new user message to the API messages list
    currentMessages.push({ role: 'user', content: apiContent });

    // 1. Add user message to UI
    const userMessage: Message = {
      id: `user - ${Date.now()} `,
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

    // 2. Add assistant placeholder
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

    // 3. Main loop for handling tool calls and follow-ups
    let assistantContent = '';
    try {
      let isDone = false;
      let iterationCount = 0;
      const MAX_ITERATIONS = 10; // Prevent infinite loops

      while (!isDone && iterationCount < MAX_ITERATIONS) {
        iterationCount++;

        // Reset assistant content for this turn if we are doing a new request? 
        // No, typically we accumulate content from the *assistant* message across turns if it's the same message ID?
        // Actually, if we are looping, we are sending tool outputs BACK to the LLM, and getting a NEW response.
        // The previous response was just tool calls.
        // So `assistantContent` should probably be reset for the *new* response or we should be appending?
        // Usually, the flow is:
        // 1. User: "Time?"
        // 2. Assistant: [ToolCall: Time] (Content is null or empty)
        // 3. User (Tool Output): "12:00"
        // 4. Assistant: "It is 12:00"

        // So for the *final* message update, we want the content from the LAST iteration.
        // If we declare it outside, we can keep the value from the last iteration.
        // Inside the loop we should probably reset it because each fetch gets a fresh response for that turn.



        const response = await fetch(`${API_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: currentMessages,
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

        // We'll track what we've rendered to the UI for this turn
        // Note: We might be appending to the *same* assistant message if it's a tool output + follow up
        // OR we might want to update the *current* assistant message with the partial content.

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

              if (delta?.content) {
                assistantContent += delta.content;
                // Update UI with content (streaming)
                // We merge with existing parts if any
                updateMessage(assistantMessageId, assistantContent, true);
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

        // Processing complete for this turn
        const finalToolCalls = Object.values(toolCalls);

        // If no tool calls, we are done
        if (finalToolCalls.length === 0) {
          isDone = true;
          // Final update to set streaming false
          updateMessage(assistantMessageId, assistantContent, false);
          break;
        }

        // Handle tool calls
        // 1. Update UI to show tools are running

        // We need to conform to the ToolUIPart structure expected by the UI component
        // The UI component expects: type, state, input, output, errorText.
        // In the USER_REQUEST example: type="tool-fetch_weather_data"

        const toolPartsForUI = finalToolCalls.map(tc => {
          let args = {};
          try { args = JSON.parse(tc.arguments); } catch (e) { }
          return {
            type: `tool-${tc.name}` as const,
            state: 'input-available' as const,
            input: args,
            output: undefined,
            errorText: undefined,
            toolCallId: tc.id || '', // Ensure it's always a string
          } as ToolUIPart;
        });

        // Add these parts to the message
        updateMessage(assistantMessageId, assistantContent, true, toolPartsForUI);

        // 2. Update API messages history with the assistant's decision to call tools
        currentMessages.push({
          role: 'assistant',
          content: assistantContent || null, // content can be null if only tool calls
          tool_calls: finalToolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: tc.arguments
            }
          }))
        } as any);

        // 3. Execute tools
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

          // Update UI for this specific tool
          // We need to find the part in the message and update it
          // Since we can't easily partially update valid state in our store structure without reading it back,
          // we will carry the state in our local loop and push updates.
          toolPartsForUI[index].state = isError ? 'output-error' : 'output-available';
          toolPartsForUI[index].output = result;
          if (isError) toolPartsForUI[index].errorText = JSON.stringify(result.error);

          // Push intermediate update to UI (showing completion)
          updateMessage(assistantMessageId, assistantContent, true, [...toolPartsForUI]);

          return {
            tool_call_id: tc.id,
            role: 'tool',
            name: tc.name,
            content: JSON.stringify(result)
          };
        }));

        // 4. Add tool outputs to API messages
        toolOutputs.forEach(output => {
          currentMessages.push(output as any);
        });

        // Loop continues to next iteration (sending tool outputs to LLM)
      }

      if (iterationCount >= MAX_ITERATIONS) {
        updateMessage(assistantMessageId, assistantContent + "\n\n[System: Max tool iterations reached]", false);
      }

    } catch (error) {
      // Check if error is due to abort
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Stream aborted by user');
        // Don't show error message for user-initiated aborts
        updateMessage(assistantMessageId, assistantContent, false);
      } else {
        console.error('Error sending message:', error);
        updateMessage(assistantMessageId, 'Error: Failed to get response', false);
      }
      throw error;
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  };

  return { sendMessage, isStreaming, stopStreaming };
}
