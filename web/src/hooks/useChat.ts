import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUIStore, type Message } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { getToolDefinitions, tools } from '@/tools';
import { UI_RESPONSE_GUIDE } from '@/lib/ui-response-guide';
import { parseFiles } from '@/lib/file-parser';
import { workspaceApi } from '@/api/workspace';
import { generateConversationTitle } from '@/lib/title-generator';
import { generateConversationSuggestions } from '@/lib/suggestion-generator';
import type { ToolUIPart } from 'ai';

const API_BASE_URL = '/api';

const GLOBAL_SYSTEM_PROMPT = `When user asks for a diagram, make it in a mermaid diagram format the UI can render it automatically. Always ensure to style the diagram in a modern and professional way. with a color scheme that is easy to read and visually appealing.

DO NOT generate any mermaid diagram that is not requested by the user.

To provide a title for a code block, use the syntax \`\`\`language:filename.

for example:
\`\`\`mermaid:flowchart.mmd
graph TD;
    A-->B;
    A-->C;
    B-->D;
    C-->D;
\`\`\`

\`\`\`python:index.py
print("hello world")
\`\`\`


\`\`\`html:index.html
<html>
<body>
<h1>hello world</h1>
</body>
</html>
\`\`\`

`;

import type { Model } from '@/types/model';


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
          'Authorization': `Bearer ${apiKey}`,
        },
        credentials: 'include', // Include cookies for session auth
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
  const apiKey = useUIStore((s) => s.apiKey);

  return useQuery({
    queryKey: ['models'],
    queryFn: async (): Promise<Model[]> => {
      const response = await fetch(`${API_BASE_URL}/v1/models`, {
        method: 'GET',
        headers: apiKey ? {
          'Authorization': `Bearer ${apiKey}`,
        } : {},
        credentials: 'include', // Include cookies for session auth
      });

      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }

      const data: ModelsResponse = await response.json();
      return data.data || [];
    },
    enabled: true, // Always enabled, will use session if no API key
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
  // Combined selector - reduces from 6 subscriptions to 1
  const { apiKey, enabledTools, activeConversationId, uiResponseEnabled } = useUIStore(useShallow((s) => ({
    apiKey: s.apiKey,
    enabledTools: s.enabledTools,
    activeConversationId: s.activeConversationId,
    uiResponseEnabled: s.uiResponseEnabled,
  })));

  // Use direct store access for actions to avoid subscription overhead
  const addMessage = useCallback((msg: Message) => {
    useUIStore.getState().addMessage(msg);
  }, []);

  const updateMessage = useCallback((
    id: string,
    content: string,
    streaming?: boolean,
    parts?: any[],
    images?: any[],
    usage?: Message['usage']
  ) => {
    useUIStore.getState().updateMessage(id, content, streaming, parts, images, usage);
  }, []);

  const setMessages = useCallback((msgs: Message[]) => {
    useUIStore.getState().setMessages(msgs);
  }, []);

  const queryClient = useQueryClient();
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
    // Allow streaming with session auth even without API key
    // The backend will validate the session

    try {
      let assistantContent = '';
      let assistantReasoning = '';
      let isDone = false;
      let iterationCount = 0;
      let allImages: any[] = [];
      const MAX_ITERATIONS = 10;

      // Track all parts (text + tools) in order for interleaved rendering
      let allParts: any[] = [];
      let iterationContentStart = 0; // Track where content started for this iteration

      // Track accumulated usage across tool iterations
      let accumulatedUsage: NonNullable<Message['usage']> = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
        cachedTokens: 0,
        reasoningTokens: 0
      };

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
            ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
          },
          credentials: 'include', // Include cookies for session auth
          body: JSON.stringify({
            model,
            messages: apiMessages,
            stream: true,
            tools: getToolDefinitions().filter(t =>
              enabledTools.includes(t.function.name)
            ),
          }),
          signal: abortControllerRef.current?.signal,
        });

        if (!response.ok) {
          let errorMessage = `HTTP error! status: ${response.status}`;
          try {
            const text = await response.text();
            if (text) {
              try {
                const json = JSON.parse(text);
                if (json?.error?.message) {
                  errorMessage = json.error.message;
                } else if (json?.message) {
                  errorMessage = json.message;
                } else if (typeof json?.error === 'string') {
                  errorMessage = json.error;
                } else {
                  errorMessage = JSON.stringify(json);
                }
              } catch {
                errorMessage = text;
              }
            }
          } catch {
            // If anything fails, use the default HTTP status message
          }
          throw new Error(errorMessage);
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


        let currentIterationUsage: Message['usage'] = undefined;

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

              // Capture usage if available (usually in the last chunk or separate chunk)
              if (parsed.usage) {
                currentIterationUsage = {
                  promptTokens: parsed.usage.prompt_tokens,
                  completionTokens: parsed.usage.completion_tokens,
                  totalTokens: parsed.usage.total_tokens,
                  cost: parsed.usage.cost,
                  cachedTokens: parsed.usage.prompt_tokens_details?.cached_tokens,
                  reasoningTokens: parsed.usage.completion_tokens_details?.reasoning_tokens,
                };
                console.log('[Stream] Received usage data for this iteration:', currentIterationUsage);
              }

              const choice = parsed.choices?.[0];
              const delta = choice?.delta;

              let shouldUpdate = false;

              if (delta?.reasoning_content || delta?.reasoning) {
                const reasoningChunk = delta.reasoning_content || delta.reasoning;
                assistantReasoning += reasoningChunk;
                console.log('[Stream] Reasoning chunk:', reasoningChunk, '| Total reasoning:', assistantReasoning.substring(0, 50) + '...');
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

                    // Check if this is an attachment URL
                    if (trimmedChunk.startsWith('/api/v1/attachments/') ||
                      trimmedChunk.startsWith('/v1/attachments/') ||
                      trimmedChunk.startsWith('http')) {
                      // It's a complete URL, just set it directly
                      imageCalls[index].image_url.url = trimmedChunk;
                    } else if (
                      (trimmedChunk.startsWith('data:') || chunk.indexOf('data:image/') !== -1) &&
                      imageCalls[index].image_url.url.length > 0
                    ) {
                      // Base64 data URI - handle chunked streaming
                      const dataIndex = chunk.indexOf('data:image/');
                      if (dataIndex !== -1) {
                        imageCalls[index].image_url.url = chunk.substring(dataIndex);
                      } else {
                        imageCalls[index].image_url.url = trimmedChunk;
                      }
                    } else {
                      // Accumulate base64 chunks
                      imageCalls[index].image_url.url += chunk;
                    }
                  }
                }
                shouldUpdate = true;
              }

              if (shouldUpdate) {
                const fullContent = getFullContent();

                // Calculate total usage so far (accumulated + current iteration)
                const currentTotalUsage = { ...accumulatedUsage };
                if (currentIterationUsage) {
                  currentTotalUsage.promptTokens += currentIterationUsage.promptTokens;
                  currentTotalUsage.completionTokens += currentIterationUsage.completionTokens;
                  currentTotalUsage.totalTokens += currentIterationUsage.totalTokens;
                  currentTotalUsage.cost = (currentTotalUsage.cost || 0) + (currentIterationUsage.cost || 0);
                  currentTotalUsage.cachedTokens = (currentTotalUsage.cachedTokens || 0) + (currentIterationUsage.cachedTokens || 0);
                  currentTotalUsage.reasoningTokens = (currentTotalUsage.reasoningTokens || 0) + (currentIterationUsage.reasoningTokens || 0);
                }

                updateMessage(assistantMessageId, fullContent, true, undefined, [...allImages, ...Object.values(imageCalls)], currentTotalUsage);
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

        // Merge current iteration usage into accumulated usage
        if (currentIterationUsage) {
          accumulatedUsage.promptTokens += currentIterationUsage.promptTokens;
          accumulatedUsage.completionTokens += currentIterationUsage.completionTokens;
          accumulatedUsage.totalTokens += currentIterationUsage.totalTokens;
          accumulatedUsage.cost = (accumulatedUsage.cost || 0) + (currentIterationUsage.cost || 0);
          accumulatedUsage.cachedTokens = (accumulatedUsage.cachedTokens || 0) + (currentIterationUsage.cachedTokens || 0);
          accumulatedUsage.reasoningTokens = (accumulatedUsage.reasoningTokens || 0) + (currentIterationUsage.reasoningTokens || 0);
        }

        const finalToolCalls = Object.values(toolCalls);
        const finalImages = Object.values(imageCalls);
        allImages = [...allImages, ...finalImages];

        if (finalToolCalls.length === 0) {
          isDone = true;
          // Add final text content as a text part if there's content after the last tool calls
          const finalContent = assistantContent.substring(iterationContentStart);
          if (finalContent.trim() && allParts.length > 0) {
            allParts.push({
              type: 'text' as const,
              content: finalContent,
            });
          }
          updateMessage(assistantMessageId, getFullContent(), false, allParts.length > 0 ? allParts : undefined, allImages, accumulatedUsage);
          break;
        }
        // Capture text content that came after previous tool calls (if any)
        // This is the LLM's response to the previous tool results
        if (allParts.length > 0) {
          const iterationContent = assistantContent.substring(iterationContentStart);
          if (iterationContent.trim()) {
            allParts.push({
              type: 'text' as const,
              content: iterationContent,
            });
          }
        }

        // Handle tool calls first
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

        // Add tool parts to allParts first
        allParts.push(...toolPartsForUI);

        // Mark where next iteration's content starts (content will be captured after tool results come back)
        iterationContentStart = assistantContent.length;

        updateMessage(assistantMessageId, getFullContent(), true, allParts, allImages, accumulatedUsage);

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

        const toolOutputs = await Promise.all(finalToolCalls.map(async (tc) => {
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

          // Update the tool part in allParts (find by toolCallId)
          const partIndex = allParts.findIndex((p: any) => p.toolCallId === tc.id);
          if (partIndex !== -1) {
            allParts[partIndex] = {
              ...allParts[partIndex],
              state: isError ? 'output-error' : 'output-available',
              output: result,
              errorText: isError ? JSON.stringify(result.error) : undefined,
            };
          }

          updateMessage(assistantMessageId, getFullContent(), true, [...allParts], allImages, accumulatedUsage);

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
        updateMessage(assistantMessageId, getFullContent() + "\n\n[System: Max tool iterations reached]", false, undefined, undefined, accumulatedUsage);
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Stream aborted by user');
        updateMessage(assistantMessageId, 'Error: Stream aborted', false);
      } else {
        console.error('Error sending message:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to get response';
        updateMessage(assistantMessageId, `Error: ${errorMessage}`, false);
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
    // Allow sending messages with session auth even without API key
    // The backend will validate the session

    abortControllerRef.current = new AbortController();
    setIsStreaming(true);

    // Also upload attachments to workspace if conversation is active
    if (activeConversationId && attachments && attachments.length > 0) {
      // Start all uploads and wait for them so the LLM can see them in the system prompt
      try {
        // Ensure container is ready before uploading
        await workspaceApi.waitForReady();

        await Promise.all(attachments.map(file =>
          workspaceApi.uploadFile(activeConversationId, file)
        ));
        // Update file list in cache
        queryClient.invalidateQueries({ queryKey: ['workspace-files', activeConversationId] });
      } catch (err) {
        console.error("Failed to upload attachments to workspace", err);
      }
    }

    // Clear suggestions
    if (activeConversationId) {
      useUIStore.getState().setConversationSuggestions(activeConversationId, []);
    }

    // Prepare history
    let currentMessages = conversationHistory
      .filter(m => !m.streaming)
      .map(m => ({
        role: m.role,
        content: m.content as string | Array<any>,
      }));

    if (systemPrompt && systemPrompt.trim()) {
      // Always append UI response guide to user's system prompt if enabled
      let fullSystemPrompt = systemPrompt + GLOBAL_SYSTEM_PROMPT + (uiResponseEnabled ? UI_RESPONSE_GUIDE : '');

      // Inject workspace files if available
      if (activeConversationId) {
        try {
          const files = await workspaceApi.listFiles(activeConversationId);
          if (files.length > 0) {
            const fileList = files.map(f => `- ${f.name} (${f.size} bytes)`).join('\n');
            fullSystemPrompt += `\n\nCurrent Workspace Files:\n${fileList}`;
          }
        } catch (e) {
          console.error("Failed to inject file list", e);
        }
      }

      currentMessages = [{ role: 'system', content: fullSystemPrompt }, ...currentMessages];
    } else {
      // If no custom system prompt, just use the UI guide if enabled
      let prompt = uiResponseEnabled ? UI_RESPONSE_GUIDE.trim() : '';

      // Inject workspace files if available
      if (activeConversationId) {
        try {
          const files = await workspaceApi.listFiles(activeConversationId);
          if (files.length > 0) {
            const fileList = files.map(f => `- ${f.name} (${f.size} bytes)`).join('\n');
            prompt += `\n\nCurrent Workspace Files:\n${fileList}`;
          }
        } catch (e) {
          console.error("Failed to inject file list", e);
        }
      }
      currentMessages = [{ role: 'system', content: prompt }, ...currentMessages];
    }

    // Process attachments
    const { parsedFiles, combinedContent } = attachments && attachments.length > 0
      ? await parseFiles(attachments)
      : { parsedFiles: [], combinedContent: '' };

    // Build the user's message content
    // If there are non-image files, append their parsed content to the user's text
    const userContentText = content + combinedContent;

    let apiContent: string | Array<any> = userContentText;

    // Convert image files to base64 for API
    const imageBase64s = await Promise.all(
      attachments?.filter(f => f.type.startsWith('image/')).map(fileToBase64) || []
    );

    const apiImagesWithBase64 = imageBase64s.map(url => ({
      type: 'image_url',
      image_url: { url },
    }));

    if (apiImagesWithBase64.length > 0) {
      apiContent = [
        { type: 'text', text: userContentText },
        ...apiImagesWithBase64,
      ];
    }

    currentMessages.push({ role: 'user', content: apiContent });

    // Upload images to backend and get attachment URLs for display
    const imageAttachments = await Promise.all(
      parsedFiles
        .filter(pf => pf.type.startsWith('image/'))
        .map(async (pf, index) => {
          const imageFile = attachments!.filter(f => f.type.startsWith('image/'))[index];
          const base64 = await fileToBase64(imageFile);

          // Upload to backend
          try {
            const response = await fetch(`${API_BASE_URL}/v1/attachments/upload`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
              },
              credentials: 'include',
              body: JSON.stringify({
                data: base64,
                contentType: pf.type,
              }),
            });

            if (response.ok) {
              const result = await response.json();
              return {
                url: `/api/v1/attachments/${result.uuid}`,
                contentType: pf.type,
                name: pf.filename,
              };
            }
          } catch (error) {
            console.error('Failed to upload image:', error);
          }

          // Fallback to blob URL if upload fails
          return {
            url: URL.createObjectURL(imageFile),
            contentType: pf.type,
            name: pf.filename,
          };
        })
    );

    // Non-image attachments still use parsed content
    const nonImageAttachments = parsedFiles
      .filter(pf => !pf.type.startsWith('image/'))
      .map((pf, index) => {
        const nonImageFile = attachments!.filter(f => !f.type.startsWith('image/'))[index];
        return {
          url: URL.createObjectURL(nonImageFile),
          contentType: pf.type,
          name: pf.filename,
          parsedContent: pf.isParsed ? pf.content : undefined,
        };
      });

    // UI Updates
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      attachments: [...imageAttachments, ...nonImageAttachments],
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

    // Generate title in background after first message exchange
    // Use setTimeout to not block the main flow
    setTimeout(async () => {
      try {
        const currentConvId = useUIStore.getState().activeConversationId;
        if (currentConvId) {
          const conversation = useUIStore.getState().conversations[currentConvId];
          const assistantMsg = conversation?.messages.find(m => m.id === assistantMessageId);
          if (assistantMsg && assistantMsg.content) {
            await generateConversationTitle(
              currentConvId,
              model,
              content,
              assistantMsg.content,
              apiKey
            );
          }
        }
      } catch (error) {
        console.error('[Chat] Title generation failed:', error);
      }

      // Generate suggestions
      try {
        const currentConvId = useUIStore.getState().activeConversationId;
        if (currentConvId) {
          const conversation = useUIStore.getState().conversations[currentConvId];
          const messages = conversation?.messages || [];
          // Need at least a few messages for context
          if (messages.length >= 2) {
            const assistantMsg = conversation?.messages.find(m => m.id === assistantMessageId);
            if (assistantMsg && !assistantMsg.streaming) {
              // Prepare messages in format expected by generator
              const history = messages.map(m => ({
                role: m.role,
                content: typeof m.content === 'string' ? m.content : 'Image/Attachment' // Simplify for suggestion generator
              }));

              await generateConversationSuggestions(
                currentConvId,
                model,
                history,
                apiKey
              );
            }
          }
        }
      } catch (error) {
        console.error('[Chat] Suggestion generation failed:', error);
      }
    }, 100);
  };

  const regenerate = async (
    messageId: string,
    model: string,
    conversationHistory: Message[],
    systemPrompt?: string
  ) => {
    // Allow regenerating with session auth even without API key

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
      // Always append UI response guide to user's system prompt if enabled
      let fullSystemPrompt = systemPrompt + (uiResponseEnabled ? UI_RESPONSE_GUIDE : '');

      // Inject workspace files if available
      if (activeConversationId) {
        try {
          const files = await workspaceApi.listFiles(activeConversationId);
          if (files.length > 0) {
            const fileList = files.map(f => `- ${f.name} (${f.size} bytes)`).join('\n');
            fullSystemPrompt += `\n\nCurrent Workspace Files:\n${fileList}`;
          }
        } catch (e) {
          console.error("Failed to inject file list", e);
        }
      }

      apiMessages = [{ role: 'system', content: fullSystemPrompt }, ...apiMessages];
    } else {
      // If no custom system prompt, just use the UI guide if enabled
      let prompt = uiResponseEnabled ? UI_RESPONSE_GUIDE.trim() : '';

      // Inject workspace files if available
      if (activeConversationId) {
        try {
          const files = await workspaceApi.listFiles(activeConversationId);
          if (files.length > 0) {
            const fileList = files.map(f => `- ${f.name} (${f.size} bytes)`).join('\n');
            prompt += `\n\nCurrent Workspace Files:\n${fileList}`;
          }
        } catch (e) {
          console.error("Failed to inject file list", e);
        }
      }

      apiMessages = [{ role: 'system', content: prompt }, ...apiMessages];
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

    // Generate suggestions after regeneration
    setTimeout(async () => {
      try {
        const currentConvId = useUIStore.getState().activeConversationId;
        if (currentConvId) {
          const conversation = useUIStore.getState().conversations[currentConvId];
          const messages = conversation?.messages || [];

          if (messages.length >= 2) {
            const history = messages.map(m => ({
              role: m.role,
              content: typeof m.content === 'string' ? m.content : 'Image/Attachment'
            }));

            await generateConversationSuggestions(
              currentConvId,
              model,
              history,
              // apiKey might be null if using session, store has it
              useUIStore.getState().apiKey
            );
          }
        }
      } catch (error) {
        console.error('[Chat] Suggestion generation failed:', error);
      }
    }, 100);
  };

  return { sendMessage, regenerate, isStreaming, stopStreaming };
}
