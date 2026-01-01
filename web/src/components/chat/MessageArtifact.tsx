
import { useState } from 'react';
import {
  Artifact,
  ArtifactHeader,
  ArtifactTitle,
  ArtifactDescription,
  ArtifactActions,
  ArtifactAction,
  ArtifactContent,
} from '@/components/ai-elements/artifact';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { MessageResponse } from '@/components/ai-elements/message';
import { type CodeArtifact } from '@/lib/artifacts';
import { CopyIcon, DownloadIcon, CodeIcon, PresentationIcon } from 'lucide-react';

interface MessageArtifactProps {
  artifact: CodeArtifact;
  messageId: string;
  index: number;
}

export function MessageArtifact({ artifact, messageId, index }: MessageArtifactProps) {
  const [mode, setMode] = useState<'code' | 'preview'>('preview');
  const isMermaid = artifact.language === 'mermaid';

  const handleCopy = () => {
    navigator.clipboard.writeText(artifact.code);
  };

  const handleDownload = () => {
    const blob = new Blob([artifact.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = artifact.title || `code.${artifact.language === 'markdown' ? 'md' : artifact.language}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Artifact
      id={`msg-${messageId}-${artifact.id || `artifact-${index}`}`}
      className="my-2 scroll-mt-20"
    >
      <ArtifactHeader>
        <div className="flex flex-col min-w-0 mr-4">
          <ArtifactTitle className="truncate">
            {artifact.title || `${artifact.language} code`}
          </ArtifactTitle>
          <ArtifactDescription>
            {artifact.language}
          </ArtifactDescription>
        </div>
        <ArtifactActions>
          {isMermaid && (
            <ArtifactAction
              icon={mode === 'preview' ? CodeIcon : PresentationIcon}
              label={mode === 'preview' ? 'Code' : 'Preview'}
              onClick={() => setMode(mode === 'preview' ? 'code' : 'preview')}
              tooltip={mode === 'preview' ? 'Show Code' : 'Show Diagram'}
            />
          )}
          <ArtifactAction
            icon={CopyIcon}
            label="Copy"
            onClick={handleCopy}
            tooltip="Copy code"
          />
          <ArtifactAction
            icon={DownloadIcon}
            label="Download"
            onClick={handleDownload}
            tooltip="Download"
          />
        </ArtifactActions>
      </ArtifactHeader>
      <ArtifactContent className="p-0">
        {isMermaid && mode === 'preview' ? (
          <div className="bg-white/80 border-b p-0 rounded-b-lg overflow-x-auto">
            <MessageResponse className="border-0 p-0">
              {`\`\`\`mermaid\n${artifact.code}\n\`\`\``}
            </MessageResponse>
          </div>
        ) : (
          <CodeBlock
            code={artifact.code}
            language={artifact.language as any}
            showLineNumbers
            className="border-none rounded-none"
          />
        )}
      </ArtifactContent>
    </Artifact>
  );
}
