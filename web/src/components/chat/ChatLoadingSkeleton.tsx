import { Skeleton } from "@/components/ui/skeleton";

export function ChatLoadingSkeleton() {
  return (
    <div className="bg-terminal-bg text-terminal-text font-mono flex overflow-hidden h-dvh w-full">
      {/* Sidebar Skeleton - Hidden on mobile */}
      <div className="hidden md:flex w-[260px] lg:w-[300px] flex-col border-r border-terminal-border bg-terminal-surface/50 h-full shrink-0">
        <div className="p-4 border-b border-terminal-border/50">
          <Skeleton className="h-9 w-full rounded-md bg-terminal-muted/10" />
        </div>
        <div className="flex-1 p-3 flex flex-col gap-3 overflow-hidden">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-20 bg-terminal-muted/20 ml-2" />
            {[1, 2, 3].map((i) => (
              <Skeleton key={`recent-${i}`} className="h-10 w-full rounded-md bg-terminal-muted/10" />
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Skeleton className="h-4 w-20 bg-terminal-muted/20 ml-2" />
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={`old-${i}`} className="h-10 w-full rounded-md bg-terminal-muted/10" />
            ))}
          </div>
        </div>
        <div className="p-4 border-t border-terminal-border/50 mt-auto">
          <Skeleton className="h-10 w-full rounded-md bg-terminal-muted/10" />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-terminal-bg relative">
        {/* Header Skeleton */}
        <header className="bg-terminal-surface/50 border-b border-terminal-border px-3 sm:px-4 py-2 sm:py-3 shrink-0 z-10 w-full">
          <div className="flex items-center justify-between max-w-4xl mx-auto w-full">
            <div className="flex items-center gap-2 overflow-hidden min-w-0">
              <Skeleton className="h-8 w-8 rounded-md md:hidden bg-terminal-muted/10" />
              <Skeleton className="h-6 w-32 sm:w-48 bg-terminal-muted/10" />
            </div>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <Skeleton className="h-8 w-8 rounded-md bg-terminal-muted/10" />
              <Skeleton className="h-8 w-8 rounded-md bg-terminal-muted/10" />
              <div className="w-px h-4 bg-terminal-border mx-1" />
              <Skeleton className="h-8 w-8 rounded-md bg-terminal-muted/10" />
            </div>
          </div>
        </header>

        {/* Chat Messages Skeleton */}
        <div className="flex-1 overflow-hidden relative">
          <div className="max-w-4xl mx-auto w-full py-4 px-3 sm:px-4 flex flex-col gap-6 mt-4 sm:mt-8">
            {/* Mock User Message */}
            <div className="flex justify-end w-full pl-10">
              <Skeleton className="h-16 w-full sm:max-w-[70%] rounded-2xl rounded-tr-sm bg-terminal-muted/10" />
            </div>

            {/* Mock AI Message */}
            <div className="flex justify-start w-full pr-10">
              <div className="w-full sm:max-w-[85%] space-y-3">
                <div className="flex gap-2 items-center">
                  <Skeleton className="h-5 w-5 rounded-full bg-terminal-muted/20" />
                  <Skeleton className="h-4 w-24 bg-terminal-muted/20" />
                </div>
                <div className="space-y-2 pl-7">
                  <Skeleton className="h-4 w-full bg-terminal-muted/10" />
                  <Skeleton className="h-4 w-[90%] bg-terminal-muted/10" />
                  <Skeleton className="h-4 w-[95%] bg-terminal-muted/10" />
                  <Skeleton className="h-24 w-full rounded-md bg-terminal-muted/5 mt-2" />
                </div>
              </div>
            </div>

            {/* Mock User Message 2 */}
            <div className="flex justify-end w-full pl-10">
              <Skeleton className="h-10 w-[60%] sm:max-w-[50%] rounded-2xl rounded-tr-sm bg-terminal-muted/10" />
            </div>

            {/* Mock AI Message 2 - Loading look */}
            <div className="flex justify-start w-full pr-10">
              <div className="w-full sm:max-w-[85%] space-y-3">
                <div className="flex gap-2 items-center">
                  <Skeleton className="h-5 w-5 rounded-full bg-terminal-muted/20" />
                  <Skeleton className="h-4 w-24 bg-terminal-muted/20" />
                </div>
                <div className="space-y-2 pl-7">
                  <Skeleton className="h-4 w-[80%] bg-terminal-muted/10" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Input Area Skeleton */}
        <footer className="bg-terminal-bg px-2 py-2 sm:px-4 sm:py-3 shrink-0 safe-bottom z-10 w-full mb-safe">
          <div className="max-w-4xl mx-auto w-full">
            <Skeleton className="h-[52px] sm:h-[60px] w-full rounded-xl bg-terminal-surface border border-terminal-border/50" />
          </div>
        </footer>
      </div>
    </div>
  );
}
