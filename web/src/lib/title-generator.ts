import { useUIStore } from '@/store';

const API_BASE_URL = '/api';

const TITLE_GENERATION_PROMPT = `You are a title generator. Based on the conversation below, generate a very short, descriptive title (3-6 words max). 
The title should capture the main topic or intent of the conversation.
Respond with ONLY the title, no quotes, no punctuation at the end, no explanation.

Examples of good titles:
- Python List Comprehension Help
- React State Management
- Debug MySQL Connection Error
- Travel Plans for Tokyo
- Recipe for Chocolate Cake`;

const generatedTitles = new Set<string>();

/**
 * Generate a title for a conversation using the chat completions API.
 * This is a standalone utility function that can be called after message completion.
 */
export async function generateConversationTitle(
  conversationId: string,
  model: string,
  userMessage: string,
  assistantMessage: string,
  apiKey: string | null
): Promise<string | null> {
  // Skip if we've already generated a title for this conversation
  if (generatedTitles.has(conversationId)) {
    return null;
  }

  // Check if conversation still has default title
  const conversation = useUIStore.getState().conversations[conversationId];
  if (!conversation) return null;

  // Only generate if the title is still the default or auto-generated short title
  const isDefaultTitle = conversation.title === 'New Chat' ||
    (conversation.title.length <= 30 && conversation.title === userMessage.slice(0, 30));

  if (!isDefaultTitle) {
    generatedTitles.add(conversationId);
    return null;
  }

  generatedTitles.add(conversationId);

  try {
    // Truncate messages to avoid token limits
    const truncatedUser = userMessage.slice(0, 500);
    const truncatedAssistant = assistantMessage.slice(0, 500);

    const response = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: TITLE_GENERATION_PROMPT },
          { role: 'user', content: `User: ${truncatedUser}\n\nAssistant: ${truncatedAssistant}` }
        ],
        stream: false,
        max_tokens: 30,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    let title = data.choices?.[0]?.message?.content?.trim();

    if (title && title.length > 0) {
      // Clean up the title - remove quotes if present
      title = title.replace(/^["']|["']$/g, '').trim();

      // Ensure reasonable length
      if (title.length > 60) {
        title = title.slice(0, 57) + '...';
      }

      if (title.length > 0) {
        // Set title directly without animation
        useUIStore.getState().setConversationTitle(conversationId, title);
        return title;
      }
    }

    return null;
  } catch (error) {
    // Remove from set so it can be retried
    generatedTitles.delete(conversationId);
    return null;
  }
}

/**
 * Reset tracking for a conversation (useful when conversation is cleared)
 */
export function resetTitleGeneration(conversationId: string): void {
  generatedTitles.delete(conversationId);
}

/**
 * Check if a title has been generated for a conversation
 */
export function hasTitleBeenGenerated(conversationId: string): boolean {
  return generatedTitles.has(conversationId);
}
