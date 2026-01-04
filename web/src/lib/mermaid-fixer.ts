/**
 * AI-powered Mermaid diagram fixer
 * 
 * Uses the chat completions API to fix syntax errors in Mermaid diagrams.
 */

import { useUIStore } from '@/store';

const API_BASE_URL = '/api';

const MERMAID_FIX_PROMPT = `You are a Mermaid diagram syntax expert. Fix the provided Mermaid diagram code that has a syntax error.

Rules:
1. Return ONLY the corrected Mermaid code, no explanations or commentary
2. Do not wrap the code in markdown code blocks or backticks
3. Preserve the original intent and structure of the diagram
4. Fix any syntax errors, missing semicolons, incorrect keywords, or malformed nodes
5. Ensure proper indentation and formatting

IMPORTANT syntax rules for different diagram types:

For CLASS DIAGRAMS (classDiagram):
- Style classes are applied using triple colon: \`ClassName:::styleName\` (NOT \`class ClassName styleName\`)
- Example: \`User:::mainClass\` applies the style "mainClass" to the User class
- Define styles with: \`classDef mainClass fill:#f9f,stroke:#333\`
- Relationships use: \`-->\` (solid), \`..\` (dashed), \`-->\` (association), \`*--\` (composition), \`o--\` (aggregation)

For FLOWCHARTS (flowchart/graph):
- Node definitions: \`A[Rectangle]\`, \`B(Rounded)\`, \`C{Diamond}\`, \`D((Circle))\`
- Links: \`-->\`, \`---\`, \`-.->\`, \`==>\`
- Style application: \`A:::className\` or \`class A className\`

For SEQUENCE DIAGRAMS:
- Participants are declared at the top
- Messages use: \`->>\` (solid arrow), \`-->>\` (dashed arrow)

Common fixes needed:
- Missing or incorrect arrows
- Malformed node definitions  
- Missing semicolons or line breaks
- Incorrect subgraph syntax
- Invalid characters in labels (need quotes for special chars)
- Wrong style application syntax`;


/**
 * Fix a Mermaid diagram using AI
 * 
 * @param mermaidCode The broken Mermaid code
 * @param errorMessage The error message from the Mermaid parser
 * @param model The model to use for fixing
 * @returns The fixed Mermaid code, or null if fixing failed
 */
export async function fixMermaidCode(
  mermaidCode: string,
  errorMessage: string,
  model: string
): Promise<string | null> {
  const apiKey = useUIStore.getState().apiKey;

  try {
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
          { role: 'system', content: MERMAID_FIX_PROMPT },
          {
            role: 'user',
            content: `Fix this Mermaid diagram:\n\n\`\`\`mermaid\n${mermaidCode}\n\`\`\`\n\nError: ${errorMessage}`
          }
        ],
        stream: false,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error('[MermaidFixer] Failed to fix diagram:', response.statusText);
      return null;
    }

    const data = await response.json();
    let fixedCode = data.choices?.[0]?.message?.content?.trim();

    if (fixedCode) {
      // Clean up - remove markdown code fence if present
      fixedCode = fixedCode
        .replace(/^```mermaid\s*/i, '')
        .replace(/^```\s*/gm, '')
        .replace(/\s*```$/g, '')
        .trim();

      console.log('[MermaidFixer] Successfully fixed diagram');
      return fixedCode;
    }

    return null;
  } catch (error) {
    console.error('[MermaidFixer] Error fixing diagram:', error);
    return null;
  }
}
