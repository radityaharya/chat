
import { useMessages } from '@/store';
import { extractArtifacts, type CodeArtifact } from '@/lib/artifacts';
import { Artifact, ArtifactHeader, ArtifactTitle, ArtifactDescription, ArtifactContent } from '@/components/ai-elements/artifact';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CalendarIcon, CodeIcon } from 'lucide-react';
import { format } from 'date-fns';
import { useMemo } from 'react';
import { Streamdown } from 'streamdown';
import { Input } from '@/components/ui/input';
import { SearchIcon } from 'lucide-react';
import { useState } from 'react';

export function ArtifactsPanel() {
  const messages = useMessages();

  // Extract all artifacts from messages
  const artifactsByMessage = useMemo(() => {
    return messages
      .filter(m => m.role === 'assistant')
      .map(message => {
        const artifacts = extractArtifacts(message.content);
        if (artifacts.length === 0) return null;
        return {
          message,
          artifacts
        };
      })
      .filter(item => item !== null) as { message: typeof messages[0], artifacts: CodeArtifact[] }[];
  }, [messages]);

  const [searchQuery, setSearchQuery] = useState('');

  const filteredArtifacts = useMemo(() => {
    if (!searchQuery.trim()) return artifactsByMessage;

    return artifactsByMessage
      .map(item => {
        const filtered = item.artifacts.filter(artifact => {
          const title = (artifact.title || `${artifact.language} snippet`).toLowerCase();
          const code = artifact.code.toLowerCase();
          const query = searchQuery.toLowerCase();
          return title.includes(query) || code.includes(query);
        });

        if (filtered.length === 0) return null;
        return {
          ...item,
          artifacts: filtered
        };
      })
      .filter(item => item !== null) as { message: typeof messages[0], artifacts: CodeArtifact[] }[];
  }, [artifactsByMessage, searchQuery]);

  const scrollToArtifact = (messageId: string, artifactId: string) => {
    // Try to find the specific artifact element
    // The ChatMessage component needs to assign IDs to artifacts
    // We'll assume format: `artifact-${messageId}-${artifactId}`
    // But wait, the artifact.id in lib is `artifact-${index}`. 
    // ChatMessage renders using that ID.
    // So the DOM ID should be stable if we use that.

    // Let's refine the ChatMessage rendering to use robust IDs.
    // Ideally: `msg-${messageId}-artifact-${artifactId}`

    // For now, let's scroll to message if artifact scroll fails
    // format: `msg-${messageId}-${artifactId}`
    const element = document.getElementById(`msg-${messageId}-${artifactId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('bg-primary/20');
      setTimeout(() => element.classList.remove('bg-primary/20'), 1500);
    } else {
      const msgElement = document.getElementById(`message-${messageId}`);
      if (msgElement) {
        msgElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        msgElement.classList.add('bg-primary/5');
        setTimeout(() => msgElement.classList.remove('bg-primary/5'), 2000);
      }
    }
  };

  if (artifactsByMessage.length === 0) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground bg-terminal-surface/50">
        <CodeIcon className="size-12 mb-4 opacity-20" />
        <p className="font-medium">No artifacts yet</p>
        <p className="text-sm mt-1">Generated code snippets will appear here</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-terminal-surface min-h-0">
      <div className="flex items-center px-4 py-3 border-b border-terminal-border shrink-0 bg-terminal-surface">
        <CodeIcon className="size-4 mr-2 text-terminal-muted" />
        <h2 className="font-semibold text-sm">Artifacts</h2>
        <span className="ml-2 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {artifactsByMessage.reduce((acc, item) => acc + item.artifacts.length, 0)}
        </span>
      </div>

      <div className="px-4 py-2 border-b border-terminal-border bg-terminal-surface/50">
        <div className="relative">
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search artifacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs bg-terminal-bg border-terminal-border focus-visible:ring-1 focus-visible:ring-primary/20"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 h-px">
        <div className="p-4 space-y-6">
          {filteredArtifacts.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">
              No artifacts found matching "{searchQuery}"
            </div>
          ) : (
            filteredArtifacts.map(({ message, artifacts }) => (
              <div key={message.id} className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                  <CalendarIcon className="size-3" />
                  <span>{format(message.timestamp || Date.now(), 'h:mm a')}</span>
                </div>

                <div className="space-y-3">
                  {artifacts.map((artifact, idx) => (
                    <Artifact
                      key={artifact.id || idx}
                      className="border border-border/50 text-sm shadow-none cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => scrollToArtifact(message.id, artifact.id || `${idx}`)}
                    >
                      <ArtifactHeader className="px-3 py-2 bg-muted/30">
                        <div className="min-w-0">
                          <ArtifactTitle className="text-xs font-semibold truncate">
                            {artifact.title || `${artifact.language} snippet`}
                          </ArtifactTitle>
                          <ArtifactDescription className="text-[10px]">
                            {artifact.language}
                          </ArtifactDescription>
                        </div>
                      </ArtifactHeader>
                      <ArtifactContent className="p-0 max-h-[200px] overflow-hidden relative group">
                        {artifact.language === 'mermaid' ? (
                          <div className="p-4 bg-white/20">
                            <Streamdown shikiTheme={["github-dark", "github-light"]}>
                              {`\`\`\`mermaid\n${artifact.code}\n\`\`\``}
                            </Streamdown>
                          </div>
                        ) : (
                          <CodeBlock
                            code={artifact.code}
                            language={artifact.language as any}
                            className="rounded-none border-none text-[10px] leading-tight [&_pre]:whitespace-pre-wrap! [&_pre]:break-all! [&_code]:whitespace-pre-wrap! [&_code]:break-all!"
                          />
                        )}
                        <div className="absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-background to-transparent pointer-events-none" />
                      </ArtifactContent>
                    </Artifact>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
