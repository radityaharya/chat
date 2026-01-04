"use client";

import { Suspense, lazy, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Loader2Icon } from "lucide-react";

// Dynamically import CodeMirror only when needed
const CodeMirrorEditor = lazy(() => import("./codemirror-editor"));

type EditableCodeBlockProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> & {
  code: string;
  language: string;
  showLineNumbers?: boolean;
  onChange?: (code: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  autoFocus?: boolean;
};

/**
 * Editable code block using CodeMirror 6.
 * CodeMirror is dynamically imported to avoid bundle bloat.
 */
export const EditableCodeBlock = ({
  code,
  language,
  showLineNumbers = false,
  onChange,
  onKeyDown,
  autoFocus = false,
  className,
  ...props
}: EditableCodeBlockProps) => {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-none border bg-[#0d0d0d] text-foreground",
        className
      )}
      onKeyDown={onKeyDown}
      {...props}
    >
      <Suspense
        fallback={
          <div className="flex items-center justify-center w-full h-[200px] text-muted-foreground">
            <Loader2Icon className="size-5 animate-spin mr-2" />
            <span className="text-sm">Loading editor...</span>
          </div>
        }
      >
        <CodeMirrorEditor
          code={code}
          language={language}
          showLineNumbers={showLineNumbers}
          onChange={onChange}
          autoFocus={autoFocus}
        />
      </Suspense>
    </div>
  );
};
