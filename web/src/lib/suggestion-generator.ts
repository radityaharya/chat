
import { useUIStore } from '@/store';

const API_BASE_URL = '/api';

// Prompt for generating conversation suggestions
const SUGGESTION_GENERATION_PROMPT = `Generate suggestions in JSON format.
You are a suggestion generator. 
Based on the conversation history, generate 3-4 concise, relevant follow-up questions or actions in json format.
These should be natural continuations of the conversation.
Keep them short (under 10 words).
Ensure they are diverse.
The output must be a JSON object matching the provided schema.`;

const SUGGESTION_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "chat_suggestions",
    strict: true,
    schema: {
      type: "object",
      properties: {
        suggestions: {
          type: "array",
          items: {
            type: "string",
            description: "A short follow-up question or action suggestion"
          },
          minItems: 3,
          maxItems: 4
        }
      },
      required: ["suggestions"],
      additionalProperties: false
    }
  }
};

/**
 * Generate suggestions for a conversation.
 */
export async function generateConversationSuggestions(
  conversationId: string,
  model: string,
  messages: { role: string; content: string }[],
  apiKey: string | null
): Promise<string[]> {
  try {
    // Only use the last few messages to save tokens and keep it relevant
    const relevantMessages = messages.slice(-6); // Last 3 turns

    const response = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({
        model, // Use the same model as the conversation, or a cheap/fast one if preferred (e.g., gpt-4o-mini)
        messages: [
          { role: 'system', content: SUGGESTION_GENERATION_PROMPT },
          ...relevantMessages.map((m, i) =>
            i === relevantMessages.length - 1
              ? { ...m, content: m.content + "\n\n(Respond in JSON format)" }
              : m
          )
        ],
        stream: false,
        max_tokens: 200,
        temperature: 0.7,
        response_format: SUGGESTION_SCHEMA
      }),
    });

    if (!response.ok) {
      console.error('[SuggestionGenerator] Failed to generate suggestions:', response.statusText);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (content) {
      try {
        const parsed = JSON.parse(content);
        let suggestions = parsed.suggestions || [];

        // Filter out empty strings
        suggestions = suggestions.filter((s: string) => s && s.trim().length > 0);

        // Update the store
        if (suggestions.length > 0) {
          useUIStore.getState().setConversationSuggestions(conversationId, suggestions);
        }

        return suggestions;
      } catch (e) {
        console.error('[SuggestionGenerator] Failed to parse suggestions JSON:', e);
      }
    }

    return [];
  } catch (error) {
    console.error('[SuggestionGenerator] Error generating suggestions:', error);
    return [];
  }
}
