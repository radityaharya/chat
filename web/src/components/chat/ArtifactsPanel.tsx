
import { useMessages } from '@/store';
import { extractArtifacts, type CodeArtifact } from '@/lib/artifacts';
import { Artifact, ArtifactHeader, ArtifactTitle, ArtifactDescription, ArtifactContent } from '@/components/ai-elements/artifact';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CalendarIcon, CodeIcon, FileIcon, FolderIcon, UploadIcon, Loader2Icon, PlayIcon } from 'lucide-react';
import { format } from 'date-fns';
import { useMemo, useState, useRef, useEffect } from 'react';
import { Streamdown } from 'streamdown';
import { Input } from '@/components/ui/input';
import { SearchIcon } from 'lucide-react';
import { Terminal } from '@/components/tools/Terminal';
import { Button } from '@/components/ui/button';
import { workspaceApi, type FileEntry } from '@/api/workspace';
import { useWorkspaceFiles } from '@/hooks/useWorkspaceFiles';
import { cn } from '@/lib/utils';
import { useActiveConversationId } from '@/store';
import { ArrowLeftIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useContainer } from '@/hooks/useContainer';

function FileViewer({ conversationId, file }: { conversationId: string; file: FileEntry }) {
  const { data: content, isLoading, error } = useQuery({
    queryKey: ['workspace-file', conversationId, file.name],
    queryFn: () => workspaceApi.readFile(conversationId, file.name),
  });

  if (isLoading) return <div className="flex items-center justify-center p-4"><Loader2Icon className="size-4 animate-spin" /></div>;
  if (error) return <div className="text-red-500 p-4 text-xs">Failed to load file content</div>;

  return (
    <div className="flex-1 overflow-auto bg-muted/30 p-2 rounded-md font-mono text-xs whitespace-pre-wrap">
      {content}
    </div>
  );
}

export function ArtifactsPanel() {
  const [activeTab, setActiveTab] = useState<'artifacts' | 'files'>('artifacts');
  const messages = useMessages();
  const { files, isLoading: isLoadingFiles, uploadFile, isUploading } = useWorkspaceFiles();
  const [viewingFile, setViewingFile] = useState<FileEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeConversationId = useActiveConversationId();
  const { runCommand } = useContainer();

  // CRITICAL FIX: Use ref to cache artifacts and track conversation ID
  const lastArtifactsRef = useRef<{ message: any, artifacts: CodeArtifact[] }[]>([]);
  const wasStreamingRef = useRef(false);
  const lastConversationIdRef = useRef<string | null>(null);

  // Reset UI state when conversation changes
  useEffect(() => {
    setViewingFile(null);
    setSearchQuery('');
  }, [activeConversationId]);

  // Check if ANY message is currently streaming
  const isStreaming = messages.some(m => m.streaming);

  // Extract all artifacts from messages  
  // ONLY process when streaming status changes from true to false OR conversation changes
  const artifactsByMessage = useMemo(() => {
    // Reset cache if conversation changed
    if (lastConversationIdRef.current !== activeConversationId) {
      lastConversationIdRef.current = activeConversationId;
      lastArtifactsRef.current = [];
      wasStreamingRef.current = false;

      // If no conversation, return empty
      if (!activeConversationId) {
        return [];
      }
    }

    // If streaming, return cached result (don't reprocess)
    if (isStreaming) {
      wasStreamingRef.current = true;
      return lastArtifactsRef.current;
    }

    // If we just stopped streaming OR first load, reprocess
    if (wasStreamingRef.current || lastArtifactsRef.current.length === 0) {
      wasStreamingRef.current = false;

      const newArtifacts = messages
        .filter(m => m.role === 'assistant' && !m.streaming)
        .map(message => {
          const artifacts = extractArtifacts(message.content);
          if (artifacts.length === 0) return null;
          return { message, artifacts };
        })
        .filter(item => item !== null) as { message: typeof messages[0], artifacts: CodeArtifact[] }[];

      lastArtifactsRef.current = newArtifacts;
      return newArtifacts;
    }

    // Return cached if nothing changed
    return lastArtifactsRef.current;
  }, [isStreaming, messages, activeConversationId]);

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

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    return files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [files, searchQuery]);

  const scrollToArtifact = (messageId: string, artifactId: string) => {
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadFile(file);
    } catch (err) {
      console.error("Upload failed", err);
      // Could add toast here
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="h-full w-full flex flex-col bg-terminal-surface min-h-0">
      {/* Header with Tabs */}
      <div className="flex items-center px-4 py-2 border-b border-terminal-border shrink-0 bg-terminal-surface gap-4">
        <button
          onClick={() => setActiveTab('artifacts')}
          className={cn(
            "flex items-center gap-2 text-sm font-medium pb-2 -mb-2.5 border-b-2 transition-colors",
            activeTab === 'artifacts'
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <CodeIcon className="size-4" />
          Artifacts
          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
            {artifactsByMessage.reduce((acc, item) => acc + item.artifacts.length, 0)}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('files')}
          className={cn(
            "flex items-center gap-2 text-sm font-medium pb-2 -mb-2.5 border-b-2 transition-colors",
            activeTab === 'files'
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <FolderIcon className="size-4" />
          Files
          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
            {files.length}
          </span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="px-4 py-2 border-b border-terminal-border bg-terminal-surface/50 flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder={activeTab === 'artifacts' ? "Search artifacts..." : "Search files..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs bg-terminal-bg border-terminal-border focus-visible:ring-1 focus-visible:ring-primary/20"
          />
        </div>
        {activeTab === 'files' && (
          <>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || !activeConversationId}
              title={!activeConversationId ? "Start a chat to upload files" : "Upload file"}
            >
              {isUploading ? <Loader2Icon className="size-3.5 animate-spin" /> : <UploadIcon className="size-3.5" />}
            </Button>
          </>
        )}
      </div>

      <ScrollArea className="flex-1 h-px">
        {activeTab === 'artifacts' ? (
          /* Artifacts Content */
          artifactsByMessage.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <CodeIcon className="size-12 mb-4 opacity-20" />
              <p className="font-medium">No artifacts yet</p>
              <p className="text-sm mt-1">Generated code snippets will appear here</p>
            </div>
          ) : (
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
                          <ArtifactContent className="p-0 relative group">
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
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                              {['bash', 'sh', 'zsh', 'python', 'python3', 'javascript', 'js'].includes(artifact.language || '') && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const fileName = artifact.title || 'script';
                                    let command = '';
                                    switch (artifact.language) {
                                      case 'bash': case 'sh': case 'zsh': command = artifact.code; break;
                                      case 'python': case 'python3': command = `python3 "${fileName}"`; break;
                                      case 'javascript': case 'js': command = `node "${fileName}"`; break;
                                    }
                                    if (command) runCommand({ command });
                                  }}
                                  title="Run in Terminal"
                                >
                                  <PlayIcon className="size-3 mr-1" />
                                  Run
                                </Button>
                              )}
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-6 px-2 text-[10px]"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const blob = new Blob([artifact.code], { type: 'text/plain' });
                                  const file = new File([blob], artifact.title || `artifact-${Date.now()}.${artifact.language || 'txt'}`);
                                  uploadFile(file);
                                }}
                                disabled={!activeConversationId || isUploading}
                              >
                                {isUploading ? <Loader2Icon className="size-3 animate-spin" /> : <UploadIcon className="size-3 mr-1" />}
                                Save
                              </Button>
                            </div>
                            <div className="absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-background to-transparent pointer-events-none" />
                          </ArtifactContent>
                        </Artifact>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )
        ) : null}

        {activeTab === 'files' && (
          <div className="flex flex-col gap-2 min-h-0 h-full p-2">
            {viewingFile ? (
              <div className="flex flex-col h-full min-h-0">
                <div className="flex items-center gap-2 mb-2 shrink-0">
                  <Button variant="ghost" size="sm" className="h-6 px-1 text-xs" onClick={() => setViewingFile(null)}>
                    <ArrowLeftIcon className="size-3.5 mr-1" /> Back
                  </Button>
                  <span className="text-xs font-medium truncate">{viewingFile.name}</span>
                </div>
                <FileViewer conversationId={activeConversationId!} file={viewingFile} />
              </div>
            ) : (
              <>


                {!activeConversationId ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                    <FolderIcon className="size-12 mb-4 opacity-20" />
                    <p className="font-medium">Start a chat</p>
                    <p className="text-sm mt-1">Files are associated with a specific conversation</p>
                  </div>
                ) : isLoadingFiles ? (
                  <div className="flex justify-center p-8 text-muted-foreground">
                    <Loader2Icon className="size-6 animate-spin" />
                  </div>
                ) : filteredFiles.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-center p-4">
                    <FolderIcon className="size-12 mb-4 opacity-20" />
                    <p className="font-medium">No files available</p>
                    <p className="text-sm mt-1">Upload files to this workspace</p>
                  </div>
                ) : (
                  <div className="space-y-1 overflow-auto min-h-0">
                    {filteredFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-md text-sm group cursor-pointer transition-colors"
                        onClick={() => !file.is_dir && setViewingFile(file)}
                      >
                        {file.is_dir ? (
                          <FolderIcon className="size-4 text-blue-400" />
                        ) : (
                          <FileIcon className="size-4 text-gray-400" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{file.name}</div>
                          <div className="text-[10px] text-muted-foreground flex gap-2">
                            <span>{(() => {
                              try {
                                return file.mod_time ? format(new Date(file.mod_time), 'MMM d, h:mm a') : '-';
                              } catch (e) {
                                return '-';
                              }
                            })()}</span>
                            <span>{file.size} bytes</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </ScrollArea>

      <Terminal className="shrink-0" />
    </div>
  );
}
