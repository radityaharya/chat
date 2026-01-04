"use client";

import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupText,
} from "@/components/ui/button-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { FileUIPart, UIMessage } from "ai";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronLeftIcon,
  PaperclipIcon,
  XIcon,
  FileJson,
  FileText,
  FileCode,
} from "lucide-react";
import type { ComponentProps, HTMLAttributes, ReactElement } from "react";
import { createContext, memo, useContext, useEffect, useState } from "react";
import { Streamdown } from "streamdown";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full max-w-[95%] flex-col gap-2",
      from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
      className
    )}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      "is-user:dark flex max-w-full min-w-0 flex-col gap-2 text-sm group-[.is-user]:overflow-hidden",
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-l-md group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:text-foreground",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageActionsProps = ComponentProps<"div">;

export const MessageActions = ({
  className,
  children,
  ...props
}: MessageActionsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
);

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
};

export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: MessageActionProps) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};

type MessageBranchContextType = {
  currentBranch: number;
  totalBranches: number;
  goToPrevious: () => void;
  goToNext: () => void;
  branches: ReactElement[];
  setBranches: (branches: ReactElement[]) => void;
};

const MessageBranchContext = createContext<MessageBranchContextType | null>(
  null
);

const useMessageBranch = () => {
  const context = useContext(MessageBranchContext);

  if (!context) {
    throw new Error(
      "MessageBranch components must be used within MessageBranch"
    );
  }

  return context;
};

export type MessageBranchProps = HTMLAttributes<HTMLDivElement> & {
  defaultBranch?: number;
  onBranchChange?: (branchIndex: number) => void;
};

export const MessageBranch = ({
  defaultBranch = 0,
  onBranchChange,
  className,
  ...props
}: MessageBranchProps) => {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch);
  const [branches, setBranches] = useState<ReactElement[]>([]);

  const handleBranchChange = (newBranch: number) => {
    setCurrentBranch(newBranch);
    onBranchChange?.(newBranch);
  };

  const goToPrevious = () => {
    const newBranch =
      currentBranch > 0 ? currentBranch - 1 : branches.length - 1;
    handleBranchChange(newBranch);
  };

  const goToNext = () => {
    const newBranch =
      currentBranch < branches.length - 1 ? currentBranch + 1 : 0;
    handleBranchChange(newBranch);
  };

  const contextValue: MessageBranchContextType = {
    currentBranch,
    totalBranches: branches.length,
    goToPrevious,
    goToNext,
    branches,
    setBranches,
  };

  return (
    <MessageBranchContext.Provider value={contextValue}>
      <div
        className={cn("grid w-full gap-2 [&>div]:pb-0", className)}
        {...props}
      />
    </MessageBranchContext.Provider>
  );
};

export type MessageBranchContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageBranchContent = ({
  children,
  ...props
}: MessageBranchContentProps) => {
  const { currentBranch, setBranches, branches } = useMessageBranch();
  const childrenArray = Array.isArray(children) ? children : [children];

  // Use useEffect to update branches when they change
  useEffect(() => {
    if (branches.length !== childrenArray.length) {
      setBranches(childrenArray);
    }
  }, [childrenArray, branches, setBranches]);

  return childrenArray.map((branch, index) => (
    <div
      className={cn(
        "grid gap-2 overflow-hidden [&>div]:pb-0",
        index === currentBranch ? "block" : "hidden"
      )}
      key={branch.key}
      {...props}
    >
      {branch}
    </div>
  ));
};

export type MessageBranchSelectorProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const MessageBranchSelector = ({
  className,
  from,
  ...props
}: MessageBranchSelectorProps) => {
  const { totalBranches } = useMessageBranch();

  // Don't render if there's only one branch
  if (totalBranches <= 1) {
    return null;
  }

  return (
    <ButtonGroup
      className="[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md"
      orientation="horizontal"
      {...props}
    />
  );
};

export type MessageBranchPreviousProps = ComponentProps<typeof Button>;

export const MessageBranchPrevious = ({
  children,
  ...props
}: MessageBranchPreviousProps) => {
  const { goToPrevious, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Previous branch"
      disabled={totalBranches <= 1}
      onClick={goToPrevious}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronLeftIcon size={14} />}
    </Button>
  );
};

export type MessageBranchNextProps = ComponentProps<typeof Button>;

export const MessageBranchNext = ({
  children,
  className,
  ...props
}: MessageBranchNextProps) => {
  const { goToNext, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Next branch"
      disabled={totalBranches <= 1}
      onClick={goToNext}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronRightIcon size={14} />}
    </Button>
  );
};

export type MessageBranchPageProps = HTMLAttributes<HTMLSpanElement>;

export const MessageBranchPage = ({
  className,
  ...props
}: MessageBranchPageProps) => {
  const { currentBranch, totalBranches } = useMessageBranch();

  return (
    <ButtonGroupText
      className={cn(
        "border-none bg-transparent text-muted-foreground shadow-none",
        className
      )}
      {...props}
    >
      {currentBranch + 1} of {totalBranches}
    </ButtonGroupText>
  );
};

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      shikiTheme={["github-dark", "github-light"]}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

MessageResponse.displayName = "MessageResponse";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";

export type MessageAttachmentProps = HTMLAttributes<HTMLDivElement> & {
  data: FileUIPart & { parsedContent?: string };
  className?: string;
  onRemove?: () => void;
};

export function MessageAttachment({
  data,
  className,
  onRemove,
  ...props
}: MessageAttachmentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const filename = data.filename || "";
  const mediaType =
    data.mediaType?.startsWith("image/") && data.url ? "image" : "file";
  const isImage = mediaType === "image";
  const attachmentLabel = filename || (isImage ? "Image" : "Attachment");

  // Get file extension for icon display
  const fileExtension = filename.split('.').pop()?.toLowerCase() || '';

  // Helper to get file type label
  const getFileTypeLabel = () => {
    if (data.mediaType) {
      const type = data.mediaType.split('/')[1];
      return type?.toUpperCase() || 'FILE';
    }
    return fileExtension.toUpperCase() || 'FILE';
  };

  // Extract code from markdown-formatted parsed content
  const extractCodeFromParsed = () => {
    if (!data.parsedContent) return null;

    // Match code blocks: ```language\ncode\n```
    const codeBlockMatch = data.parsedContent.match(/```(\w+)?\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      return {
        language: codeBlockMatch[1] || 'text',
        code: codeBlockMatch[2].trim(),
      };
    }

    return null;
  };

  const codePreview = extractCodeFromParsed();
  const hasPreview = !isImage && codePreview && codePreview.code;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg",
        isImage ? "size-24" : "w-full max-w-2xl",
        className
      )}
      {...props}
    >
      {isImage ? (
        <Dialog>
          <DialogTrigger asChild>
            <div className="relative group/image overflow-hidden rounded-md cursor-pointer">
              <img
                alt={filename || "attachment"}
                className="size-full object-cover"
                height={100}
                src={data.url}
                width={100}
              />
              <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/10 transition-colors" />
            </div>
          </DialogTrigger>
          <DialogContent className="max-w-4xl w-auto p-0 border-none bg-transparent shadow-none">
            <DialogTitle className="sr-only">Image Preview</DialogTitle>
            <div className="relative w-full flex items-center justify-center">
              <img
                alt={filename || "attachment"}
                className="max-h-[85vh] w-auto max-w-full object-contain rounded-md"
                src={data.url}
              />
            </div>
          </DialogContent>

          {onRemove && (
            <Button
              aria-label="Remove attachment"
              className="absolute top-2 right-2 size-6 rounded-full bg-background/80 p-0 opacity-0 backdrop-blur-sm transition-opacity hover:bg-background group-hover:opacity-100 z-10 [&>svg]:size-3"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              type="button"
              variant="ghost"
            >
              <XIcon />
              <span className="sr-only">Remove</span>
            </Button>
          )}
        </Dialog>
      ) : (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <div className="flex flex-col rounded-lg border border-foreground/10 bg-muted/50 overflow-hidden">
            {/* Header - Always visible */}
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-muted">
                {/* File Icon */}
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  {(() => {
                    // Select icon based on file type
                    if (fileExtension === 'json' || data.mediaType?.includes('json')) {
                      return <FileJson className="size-5" />;
                    }
                    if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'sh', 'css', 'html', 'xml'].includes(fileExtension)) {
                      return <FileCode className="size-5" />;
                    }
                    if (['txt', 'md', 'csv', 'log'].includes(fileExtension) || data.mediaType?.startsWith('text/')) {
                      return <FileText className="size-5" />;
                    }
                    return <PaperclipIcon className="size-5" />;
                  })()}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-sm leading-tight">
                      {attachmentLabel}
                    </p>
                    {onRemove && (
                      <Button
                        aria-label="Remove attachment"
                        className="size-5 shrink-0 rounded p-0 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100 [&>svg]:size-3"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove();
                        }}
                        type="button"
                        variant="ghost"
                      >
                        <XIcon />
                        <span className="sr-only">Remove</span>
                      </Button>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {getFileTypeLabel()} File {hasPreview && "• Click to preview"}
                  </p>
                </div>

                {/* Expand Icon */}
                {hasPreview && (
                  <div className="shrink-0 text-muted-foreground">
                    {isOpen ? (
                      <ChevronDownIcon className="size-4" />
                    ) : (
                      <ChevronRightIcon className="size-4" />
                    )}
                  </div>
                )}
              </div>
            </CollapsibleTrigger>

            {/* Collapsible Content - Code Preview */}
            {hasPreview && (
              <CollapsibleContent>
                <div className="border-t border-border">
                  <div className="p-3 bg-background/50">
                    <pre className="text-xs overflow-x-auto">
                      <code className="font-mono">{codePreview.code}</code>
                    </pre>
                  </div>
                </div>
              </CollapsibleContent>
            )}
          </div>
        </Collapsible>
      )}
    </div>
  );
}

export type MessageAttachmentsProps = ComponentProps<"div">;

export function MessageAttachments({
  children,
  className,
  ...props
}: MessageAttachmentsProps) {
  if (!children) {
    return null;
  }

  return (
    <div
      className={cn(
        "ml-auto flex w-full flex-col items-start gap-2",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export type MessageToolbarProps = ComponentProps<"div">;

export const MessageToolbar = ({
  className,
  children,
  ...props
}: MessageToolbarProps) => (
  <div
    className={cn(
      "mt-4 flex w-full items-center justify-between gap-4",
      className
    )}
    {...props}
  >
    {children}
  </div>
);
