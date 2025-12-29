import type { UIResponseData, ParsedUIResponse } from '@/types/ui-response';

/**
 * Parse UI response tags from message content
 * Supports formats:
 * - <ui-response>content</ui-response>
 * - <ui-response type="table">content</ui-response>
 */
export function parseUIResponses(content: string): ParsedUIResponse {
  const uiResponses: UIResponseData[] = [];
  let cleanedContent = content;

  // Regex to match <ui-response> tags with optional type attribute
  const uiResponseRegex = /<ui-response(?:\s+type=["']([^"']+)["'])?\s*>([\s\S]*?)<\/ui-response>/g;

  let match;
  let index = 0;

  while ((match = uiResponseRegex.exec(content)) !== null) {
    const [fullMatch, type, rawContent] = match;
    const id = `ui-response-${index++}`;

    // Try to parse content as JSON
    let parsed: any = rawContent.trim();
    try {
      parsed = JSON.parse(rawContent.trim());
    } catch {
      // If not valid JSON, keep as string
      parsed = rawContent.trim();
    }

    uiResponses.push({
      id,
      type: type || 'data',
      content: rawContent.trim(),
      parsed,
    });
  }

  // Remove all ui-response tags from content
  cleanedContent = cleanedContent.replace(uiResponseRegex, '').trim();

  return {
    uiResponses,
    cleanedContent,
  };
}

/**
 * Check if content contains any ui-response tags
 */
export function hasUIResponses(content: string): boolean {
  return /<ui-response[\s\S]*?>[\s\S]*?<\/ui-response>/i.test(content);
}

/**
 * Check if there's an unclosed ui-response tag (for streaming)
 */
export function hasPartialUIResponse(content: string): boolean {
  const openTags = (content.match(/<ui-response(?:\s+[^>]*)?\s*>/g) || []).length;
  const closeTags = (content.match(/<\/ui-response>/g) || []).length;
  return openTags > closeTags;
}
