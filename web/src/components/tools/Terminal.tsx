import { useState, useRef, useEffect } from 'react';
import { useContainer } from '@/hooks/useContainer';
import { useTerminalStore } from '@/store/terminal';
import { useActiveConversationId } from '@/store'; // Import active conversation hook
import { TerminalIcon, Trash2, Maximize2, Minimize2, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';



export function Terminal({ className }: { className?: string }) {
  const activeConversationId = useActiveConversationId();
  const { runCommand, isPending } = useContainer();
  // Get raw store actions and getters
  const { clearHistory: clearStoreHistory, getHistory, getCwd } = useTerminalStore();

  // Derived state based on active conversation
  const history = getHistory(activeConversationId);
  const cwd = getCwd(activeConversationId);

  // Wrapper for clearing history
  const clearHistory = () => {
    if (activeConversationId) {
      clearStoreHistory(activeConversationId);
    }
  };

  const [input, setInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;

    if (input.trim() === 'clear') {
      clearHistory();
      setInput('');
      setHistoryIndex(-1);
      return;
    }

    if (isPending) return;

    const cmd = input.trim();
    setInput('');
    setHistoryIndex(-1); // Reset history index

    try {
      await runCommand({ command: cmd });
      // History update is handled by the hook/store now
    } catch (err) {
      // Error logging is handled by hook too, but maybe we want to show it in UI if hook doesn't?
      // Hook catches error and logs console.
      // We should probably add error to history in store if hook throws?
      // Actually hook logic in previous step swallows error in onSuccess/onError?
      // No, executeMutation throws if not caught.
      // Let's rely on store updates.
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(history[newIndex].command);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = Math.min(history.length - 1, historyIndex + 1);
        if (newIndex === history.length - 1 && historyIndex === history.length - 1) {
          // If we are at the end, clear input
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIndex);
          setInput(history[newIndex].command);
        }
      }
    }
  };

  // Auto-scroll to bottom when history changes (but don't auto-focus)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  const handleTerminalBodyClick = () => {
    // Only focus when clicking on the terminal output area, not the header
    if (!isCollapsed) {
      inputRef.current?.focus();
    }
  };

  const toggleExpand = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    if (newState) setIsCollapsed(false);
  };

  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    if (newState) setIsExpanded(false);
  };

  // Shorten CWD for display
  const displayCwd = cwd.replace(/^\/root\/workspaces\/[^\/]+/, '~');

  return (
    <div
      className={cn(
        "flex flex-col bg-[#0d0d0d] text-xs font-mono border-t border-white/10 transition-all duration-300",
        isExpanded ? "fixed inset-0 z-50 h-full max-h-none! border-t-0" : "",
        className
      )}
    >
      <div
        className="flex items-center px-4 py-2 bg-white/5 border-b border-white/5 shrink-0 select-none cursor-pointer hover:bg-white/10 transition-colors"
        onClick={toggleCollapse}
      >
        <TerminalIcon className="size-3.5 mr-2 text-primary/70" />
        <span className="text-muted-foreground font-medium">Terminal</span>
        {!isCollapsed && (
          <span className="ml-3 px-2 py-0.5 rounded-full bg-white/5 text-[10px] text-muted-foreground/70 font-sans border border-white/5">{displayCwd}</span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); clearHistory(); }}
            className="p-1.5 hover:bg-white/10 rounded-md text-muted-foreground transition-colors"
            title="Clear Terminal"
          >
            <Trash2 className="size-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); toggleExpand(); }}
            className="p-1.5 hover:bg-white/10 rounded-md text-muted-foreground transition-colors"
            title={isExpanded ? "Minimize" : "Maximize"}
          >
            {isExpanded ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); toggleCollapse(); }}
            className="p-1.5 hover:bg-white/10 rounded-md text-muted-foreground transition-colors"
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          <div
            ref={scrollRef}
            onClick={handleTerminalBodyClick}
            className={cn(
              "flex-1 overflow-y-auto p-4 space-y-4 font-mono scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent cursor-text",
              isExpanded ? "h-full" : "min-h-[250px] max-h-[350px]"
            )}
          >
            {history.length === 0 && (
              <div className="text-muted-foreground/30 text-center py-8 select-none">
                Type 'help' or commands to start...
              </div>
            )}

            {history.map((item, i) => (
              <div key={i} className="group">
                <div className="flex items-center text-muted-foreground/80 mb-1">
                  <span className="text-green-500 font-bold mr-2">➜</span>
                  <span className="opacity-60 mr-2">{item.cwd}</span>
                  <span className="text-foreground font-bold">{item.command}</span>
                </div>
                {item.output && (
                  <div className="pl-6 whitespace-pre-wrap text-muted-foreground leading-relaxed wrap-break-word selection:bg-white/20">
                    {item.output}
                  </div>
                )}
              </div>
            ))}

            {isPending && (
              <div className="flex items-center text-muted-foreground pl-6 animate-pulse">
                Running...
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-3 bg-white/2 border-t border-white/5 flex gap-2 shrink-0">
            <div className="flex-1 relative flex items-center">
              <span className="text-green-500 font-bold mr-2 text-sm">➜</span>
              <input
                ref={inputRef}
                className="flex-1 bg-transparent border-none p-0 focus:outline-none focus:ring-0 placeholder:text-muted-foreground/30 text-foreground font-medium"
                placeholder="Enter command..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isPending}
                autoComplete="off"
                spellCheck="false"
              />
            </div>
          </form>
        </>
      )}
    </div>
  );
}
