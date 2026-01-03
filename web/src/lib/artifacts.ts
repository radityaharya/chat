


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
  const regex = /```([^\n]*)\n([\s\S]*?)(?:```|$)/g;

  let match;
  while ((match = regex.exec(content)) !== null) {
    const fullMatch = match[0];
    const isComplete = fullMatch.endsWith('```');

    const header = match[1].trim();
    const parts = header.split(/\s+/);
    let language = parts[0] || 'text';
    let title = parts.slice(1).join(' ') || undefined;

    // Support language:filename format
    if (language.includes(':') && !title) {
      const [lang, filename] = language.split(':');
      language = lang;
      title = filename;
    }

    let code = match[2].replace(/```$/, ''); // Remove trailing backticks if captured by lazy match at end

    // Check if the code starts with a title like "#filename"
    // We keep this as a fallback for flexibility
    if (!title && code.trim().startsWith('#')) {
      const firstLineMatch = code.match(/^#([^\n]*)(?:\n|$)/);
      if (firstLineMatch) {
        title = firstLineMatch[1].trim();
        // Remove the title line from code
        code = code.replace(/^#[^\n]*(\n|$)/, '');
      }
    }

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
    let language = parts[0] || 'text';
    let title = parts.slice(1).join(' ') || undefined;

    // Support language:filename format
    if (language.includes(':') && !title) {
      const [lang, filename] = language.split(':');
      language = lang;
      title = filename;
    }

    const isComplete = match[0].endsWith('```');
    let code = match[2]; // Captures everything inside

    // Check if the code starts with a title like "#filename"
    if (!title && code.trim().startsWith('#')) {
      const firstLineMatch = code.match(/^#([^\n]*)(?:\n|$)/);
      if (firstLineMatch) {
        title = firstLineMatch[1].trim();
        // Remove the title line from code
        code = code.replace(/^#[^\n]*(\n|$)/, '');
      }
    }

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
