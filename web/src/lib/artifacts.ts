


export interface CodeArtifact {
  id: string;
  language: string;
  code: string;
  title?: string;
  isIncomplete?: boolean;
}

/**
 * Extracts code blocks from markdown content.
 * Matches standard markdown code blocks: ```language title
 * code
 * ```
 */
export function extractArtifacts(content: string): CodeArtifact[] {
  const artifacts: CodeArtifact[] = [];
  // Regex to match code blocks. 
  // Captures: 1=language+metadata, 2=content
  // We use [\s\S] to match any character including newlines.
  // We look for closing ``` or end of string (for streaming support detection?)
  // Actually for extraction we usually want complete blocks, or handle the last one if it's open.

  // This regex matches COMPLETE blocks.
  const regex = /```([^\n]*)\n([\s\S]*?)(?:```|$)/g;

  let match;
  while ((match = regex.exec(content)) !== null) {
    // If it's the last match and doesn't end with ```, it might be incomplete/streaming
    const fullMatch = match[0];
    const isComplete = fullMatch.endsWith('```');

    // If incomplete and short, maybe don't treat as artifact yet? 
    // But we want streaming to work.

    // Parse language and title from the first line
    const header = match[1].trim();
    const parts = header.split(/\s+/);
    const language = parts[0] || 'text';
    const title = parts.slice(1).join(' ') || undefined;

    const code = match[2].replace(/```$/, ''); // Remove trailing backticks if captured by lazy match at end

    // Only add if there is actual code or it's well-formed
    if (code.trim() || isComplete) {
      artifacts.push({
        id: `artifact-${match.index}`,
        language,
        code,
        title,
        isIncomplete: !isComplete
      });
    }
  }

  return artifacts;
}

/**
 * Splits content into segments of text and artifacts.
 */
export function splitContentWithArtifacts(content: string): Array<{ type: 'text' | 'artifact', content: string | CodeArtifact }> {
  const segments: Array<{ type: 'text' | 'artifact', content: string | CodeArtifact }> = [];

  const regex = /```([^\n]*)\n([\s\S]*?)(?:```|$)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    // Text before
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: content.slice(lastIndex, match.index)
      });
    }

    const header = match[1].trim();
    const parts = header.split(/\s+/);
    const language = parts[0] || 'text';
    const title = parts.slice(1).join(' ') || undefined;

    const isComplete = match[0].endsWith('```');
    const code = match[2]; // Captures everything inside

    // If it's the very last thing and incomplete, render as artifact (streaming)
    // If regex matched end-of-string '$', code might run to end.

    const artifact: CodeArtifact = {
      id: `artifact-${match.index}`,
      language,
      code,
      title,
      isIncomplete: !isComplete
    };

    segments.push({
      type: 'artifact',
      content: artifact
    });

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      content: content.slice(lastIndex)
    });
  }

  return segments;
}
