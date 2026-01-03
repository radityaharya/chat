
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
import { CopyIcon, DownloadIcon, CodeIcon, PresentationIcon, PlayIcon, Loader2Icon, ExternalLinkIcon, RefreshCwIcon } from 'lucide-react';
import { useContainer } from '@/hooks/useContainer';
import { useActiveConversationId } from '@/store';
import { useWorkspaceFiles } from '@/hooks/useWorkspaceFiles';

interface MessageArtifactProps {
  artifact: CodeArtifact;
  messageId: string;
  index: number;
}

export function MessageArtifact({ artifact, messageId, index }: MessageArtifactProps) {
  const [mode, setMode] = useState<'code' | 'preview'>('preview');
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0); // For reloading iframe
  const { runCommand } = useContainer();
  const activeConversationId = useActiveConversationId();
  const { files } = useWorkspaceFiles();

  const isMermaid = artifact.language === 'mermaid';
  const isHtml = artifact.language === 'html';
  const isFileReady = files.some(f => f.name === artifact.title);

  // Script languages that we can execute
  const isRunnable = ['bash', 'sh', 'zsh', 'python', 'python3', 'javascript', 'js'].includes(artifact.language || '');

  // Construct file URL for HTML preview
  // Note used for Iframe src
  const fileUrl = activeConversationId && artifact.title
    ? `/api/v1/workspaces/${activeConversationId}/files/${encodeURIComponent(artifact.title)}`
    : null;

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

  const handleRun = async () => {
    if (isRunning) return;

    setIsRunning(true);
    try {
      let command = '';
      const fileName = artifact.title; // Assumes saved as title by auto-save

      switch (artifact.language) {
        case 'bash':
        case 'sh':
        case 'zsh':
          command = artifact.code;
          break;
        case 'python':
        case 'python3':
          command = `python3 "${fileName}"`;
          break;
        case 'javascript':
        case 'js':
          command = `node "${fileName}"`;
          break;
      }

      if (command) {
        const result = await runCommand({ command, silent: true });
        setOutput(result.output || 'No output');
        setMode('preview');
      }
    } catch (error: any) {
      console.error('Failed to run artifact:', error);
      setOutput(`Error: ${error.message || 'Unknown error'}`);
      setMode('preview');
    } finally {
      setIsRunning(false);
    }
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
          {isHtml && (
            <>
              <ArtifactAction
                icon={mode === 'preview' ? CodeIcon : PresentationIcon}
                label={mode === 'preview' ? 'Code' : 'Preview'}
                onClick={() => setMode(mode === 'preview' ? 'code' : 'preview')}
                tooltip={mode === 'preview' ? 'Show Code' : 'Show Preview'}
              />
              <ArtifactAction
                icon={RefreshCwIcon}
                label="Reload"
                onClick={() => setIframeKey(k => k + 1)}
                tooltip="Reload Preview"
                disabled={!fileUrl || !isFileReady}
              />
              <ArtifactAction
                icon={ExternalLinkIcon}
                label="Open"
                onClick={() => fileUrl && window.open(fileUrl, '_blank')}
                tooltip="Open in new window"
                disabled={!fileUrl || !isFileReady}
              />
            </>
          )}
          {isRunnable && (
            <>
              <ArtifactAction
                icon={mode === 'preview' ? CodeIcon : PresentationIcon}
                label={mode === 'preview' ? 'Code' : 'Output'}
                onClick={() => setMode(mode === 'preview' ? 'code' : 'preview')}
                tooltip={mode === 'preview' ? 'Show Code' : 'Show Output'}
                disabled={!output && mode === 'code'} // Only enable if we have output or are in preview mode
              />
              <ArtifactAction
                icon={PlayIcon}
                label="Run"
                onClick={handleRun}
                tooltip={isRunning ? 'Running...' : 'Run'}
                disabled={isRunning}
              />
            </>
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
          <div className="border-b p-0 rounded-b-lg overflow-x-auto">
            {/* child border  */}
            <MessageResponse className="*:border-0 p-0 rounded-none *:rounded-none [&>*:nth-child(2)]:p-0!" mermaid={{ config: { theme: 'dark' } }}>
              {`\`\`\`mermaid\n${artifact.code}\n\`\`\``}
            </MessageResponse>
          </div>
        ) : isHtml && mode === 'preview' && fileUrl ? (
          <div className="bg-white border-b p-0 rounded-b-lg overflow-hidden h-96 relative group">
            {isFileReady ? (
              <iframe
                key={iframeKey}
                src={fileUrl}
                className="w-full h-full border-0"
                title={artifact.title || 'HTML Preview'}
                sandbox="allow-scripts allow-same-origin"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <Loader2Icon className="size-6 animate-spin" />
                <span className="text-xs">Preparing preview...</span>
              </div>
            )}
          </div>
        ) : (isRunnable && mode === 'preview' && output) ? (
          <div className="bg-[#0d0d0d] text-muted-foreground p-4 font-mono text-xs overflow-x-auto whitespace-pre-wrap rounded-b-lg border-t border-white/10 max-h-96">
            {output}
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
    </Artifact >
  );
}
