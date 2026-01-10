/**
 * File parsing utilities for chat attachments
 */

export interface ParsedFile {
  filename: string;
  type: string;
  content: string;
  isImage: boolean;
  isParsed: boolean;
}

/**
 * Parse a file and extract its content for AI consumption
 */
export async function parseFile(file: File): Promise<ParsedFile> {
  const filename = file.name;
  const type = file.type;
  const isImage = type.startsWith('image/');

  // Don't parse images - they're handled separately
  if (isImage) {
    return {
      filename,
      type,
      content: '',
      isImage: true,
      isParsed: false,
    };
  }

  try {
    // Determine parsing strategy based on file type and extension
    const extension = filename.split('.').pop()?.toLowerCase() || '';

    // JSON files
    if (type === 'application/json' || extension === 'json') {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const formattedContent = `**${filename}** (JSON):\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;

      return {
        filename,
        type,
        content: formattedContent,
        isImage: false,
        isParsed: true,
      };
    }

    // Text-based files
    const textExtensions = ['txt', 'md', 'csv', 'log', 'xml', 'html', 'css', 'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'sh', 'yaml', 'yml', 'toml', 'ini', 'conf', 'config'];
    const isTextFile = type.startsWith('text/') || textExtensions.includes(extension);

    if (isTextFile) {
      const text = await file.text();

      // Determine language for syntax highlighting
      let language = extension;
      if (['js', 'jsx'].includes(extension)) language = 'javascript';
      if (['ts', 'tsx'].includes(extension)) language = 'typescript';
      if (['yml'].includes(extension)) language = 'yaml';
      if (['sh'].includes(extension)) language = 'bash';

      // Format with appropriate code block if it looks like code
      const codeExtensions = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'sh', 'css', 'html', 'xml', 'yaml', 'yml', 'toml', 'json'];

      if (codeExtensions.includes(extension)) {
        const formattedContent = `**${filename}** (${extension.toUpperCase()}):\n\`\`\`${language}\n${text}\n\`\`\``;
        return {
          filename,
          type,
          content: formattedContent,
          isImage: false,
          isParsed: true,
        };
      } else {
        const formattedContent = `**${filename}**:\n${text}`;
        return {
          filename,
          type,
          content: formattedContent,
          isImage: false,
          isParsed: true,
        };
      }
    }

    // CSV files (special handling)
    if (type === 'text/csv' || extension === 'csv') {
      const text = await file.text();
      const formattedContent = `**${filename}** (CSV):\n\`\`\`csv\n${text}\n\`\`\``;

      return {
        filename,
        type,
        content: formattedContent,
        isImage: false,
        isParsed: true,
      };
    }

    // Unsupported file type
    return {
      filename,
      type,
      content: `**${filename}** (${type || 'unknown type'}): Binary file - content cannot be parsed`,
      isImage: false,
      isParsed: false,
    };

  } catch (error) {
    return {
      filename,
      type,
      content: `**${filename}**: Error parsing file - ${error instanceof Error ? error.message : 'unknown error'}`,
      isImage: false,
      isParsed: false,
    };
  }
}

/**
 * Parse multiple files and combine their content
 */
export async function parseFiles(files: File[]): Promise<{
  parsedFiles: ParsedFile[];
  combinedContent: string;
}> {
  const parsedFiles = await Promise.all(files.map(parseFile));

  // Combine non-image file contents
  const fileContents = parsedFiles
    .filter(f => !f.isImage && f.content)
    .map(f => f.content);

  const combinedContent = fileContents.length > 0
    ? `\n\nAttached files:\n\n${fileContents.join('\n\n')}`
    : '';

  return {
    parsedFiles,
    combinedContent,
  };
}
