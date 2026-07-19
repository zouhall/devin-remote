"use client";

// Devin Console thread — built on assistant-ui primitives, fed by our ACP
// session store via SessionRuntime. Plan/permissions/usage stay outside the
// message flow as session-level panels.

import {
  ComposerAttachments,
  UserMessageAttachments,
} from "@/components/assistant-ui/attachment";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { Reasoning, ReasoningGroup } from "@/components/assistant-ui/reasoning";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { DevinToolFallback } from "@/components/DevinToolFallback";
import { PermissionStack } from "@/components/PermissionCard";
import { PlanPanel } from "@/components/PlanPanel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { showNotice, useStore } from "@/state";
import {
  ActionBarPrimitive,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useComposerRuntime,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CopyIcon,
  PaperclipIcon,
  SquareIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FC,
} from "react";

export const Thread: FC = () => {
  const isEmpty = useAuiState((s) => s.thread.messages.length === 0);
  const isLoading = useAuiState((s) => s.thread.isLoading);

  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col bg-background">
      <ThreadPrimitive.Viewport className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-scroll scroll-smooth">
        <div
          className={cn(
            "mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-6",
            isEmpty && !isLoading && "justify-center",
          )}
        >
          {isLoading && isEmpty && <HistorySkeleton />}
          {!isLoading && isEmpty && <WelcomeHero />}

          <div className="flex flex-col gap-5 pb-10 empty:hidden">
            <ThreadPrimitive.Messages>
              {() => <ThreadMessage />}
            </ThreadPrimitive.Messages>
          </div>

          <ThreadPrimitive.ViewportFooter
            className={cn(
              "sticky bottom-0 flex flex-col gap-2 bg-background pb-3 md:pb-5",
              !isEmpty && "mt-auto pt-2",
            )}
          >
            <ThreadScrollToBottom />
            <PlanPanel />
            <PermissionStack />
            <Composer />
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const HistorySkeleton: FC = () => (
  <div className="flex flex-col gap-5" aria-label="Loading history">
    <Skeleton className="dc-shimmer h-9 w-2/5 self-end rounded-xl" />
    <Skeleton className="dc-shimmer h-24 w-4/5 rounded-xl" />
    <Skeleton className="dc-shimmer h-9 w-3/5 rounded-lg" />
    <Skeleton className="dc-shimmer h-16 w-4/5 rounded-xl" />
  </div>
);

const ThreadMessage: FC = () => {
  const role = useAuiState((s) => s.message.role);
  if (role === "user") return <UserMessage />;
  return <AssistantMessage />;
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="absolute -top-11 z-10 self-center rounded-full border-border bg-background shadow-md transition-all duration-150 hover:bg-accent disabled:invisible"
      >
        <ArrowDownIcon className="size-4" />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

// ---- welcome hero ----------------------------------------------------------

const SUGGESTIONS = [
  "Explore this workspace and summarize the project structure",
  "Find a bug or edge case worth fixing, and propose a patch",
  "Review @README.md and suggest three concrete improvements",
];

const LogoMark: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden>
    <rect width="32" height="32" rx="7" className="fill-muted" />
    <path
      d="M9 23V9h5.5a5.5 5.5 0 0 1 0 14z"
      fill="none"
      className="stroke-primary"
      strokeWidth="2.4"
    />
  </svg>
);

const WelcomeHero: FC = () => {
  const composer = useComposerRuntime();
  return (
    <div className="mb-8 flex flex-col items-center gap-4 px-4 text-center">
      <LogoMark className="size-14 rounded-2xl shadow-lg" />
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
          What should Devin work on?
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Attach screenshots, reference files with @path, or pick a starting point.
        </p>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            className="max-w-full truncate rounded-full border border-border/70 bg-card px-3.5 py-1.5 text-sm text-foreground/90 transition-all duration-150 hover:border-border hover:bg-accent active:scale-[0.98]"
            onClick={() => {
              composer.setText(s);
              composer.send();
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
};

// ---- composer ---------------------------------------------------------------

async function uploadImage(file: File): Promise<{
  id: string;
  name: string;
  type: "image";
  contentType: string;
  content: [{ type: "image"; image: string }];
} | null> {
  if (!file.type.startsWith("image/")) {
    showNotice(`"${file.name}" skipped — only images can be attached`);
    return null;
  }
  try {
    const meta = await api.upload(file, file.name || "image.png");
    return {
      id: meta.id,
      name: meta.name,
      type: "image",
      contentType: meta.mime,
      content: [{ type: "image", image: meta.url }],
    };
  } catch (err) {
    showNotice(err instanceof Error ? err.message : "upload failed");
    return null;
  }
}

const Composer: FC = () => {
  const composer = useComposerRuntime();
  const state = useStore();
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const session = state.activeSessionId ? state.sessions[state.activeSessionId] : null;

  const addFiles = useCallback(
    async (files: Iterable<File>) => {
      for (const file of files) {
        const att = await uploadImage(file);
        if (att) await composer.addAttachment(att);
      }
    },
    [composer],
  );

  // Window-level drag & drop of images.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const files = e.dataTransfer?.files;
      if (files?.length) void addFiles(files);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [addFiles]);

  // Consume palette injections (e.g. "/review ").
  useEffect(() => {
    const inject = state.composerInject;
    if (!inject) return;
    const current = composer.getState().text;
    composer.setText(current ? `${current.replace(/\s+$/, "")} ${inject.text}` : inject.text);
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.composerInject?.seq]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [session?.sessionId]);

  return (
    <ComposerPrimitive.Root className="relative flex w-full flex-col gap-1.5">
      <div
        data-dragging={dragging || undefined}
        className={cn(
          "flex w-full flex-col gap-1 rounded-2xl border border-border bg-card p-2",
          "shadow-[0_8px_30px_-12px_rgba(0,0,0,0.55)] transition-[border-color,box-shadow] duration-150",
          "focus-within:border-ring/50",
          dragging && "border-dashed border-ring bg-accent/50",
        )}
      >
        <ComposerAttachments />
        <ComposerPrimitive.Input
          ref={inputRef}
          placeholder={
            dragging
              ? "Drop images to attach…"
              : "Message Devin… (Enter to send, Shift+Enter for newline, @path to link files)"
          }
          className="caret-primary placeholder:text-muted-foreground/70 max-h-40 min-h-10 w-full resize-none bg-transparent px-2.5 py-1 text-[15px] leading-relaxed outline-none"
          rows={1}
          autoFocus
          enterKeyHint="send"
          aria-label="Message input"
          onPaste={(e) => {
            const files = [...e.clipboardData.files];
            if (files.length > 0) {
              e.preventDefault();
              void addFiles(files);
            }
          }}
        />
        <div className="flex items-center justify-between">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <TooltipIconButton
            tooltip="Attach images"
            side="top"
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded-full text-muted-foreground hover:text-foreground"
            onClick={() => fileRef.current?.click()}
          >
            <PaperclipIcon className="size-4" />
          </TooltipIconButton>
          <div className="flex items-center gap-1.5">
            <AuiIf condition={(s) => !s.thread.isRunning}>
              <ComposerPrimitive.Send asChild>
                <TooltipIconButton
                  tooltip="Send message"
                  side="top"
                  type="button"
                  variant="default"
                  size="icon"
                  className="size-8 rounded-full transition-transform active:scale-95"
                  aria-label="Send message"
                >
                  <ArrowUpIcon className="size-4.5" />
                </TooltipIconButton>
              </ComposerPrimitive.Send>
            </AuiIf>
            <AuiIf condition={(s) => s.thread.isRunning}>
              <ComposerPrimitive.Cancel asChild>
                <Button
                  type="button"
                  variant="default"
                  size="icon"
                  className="size-8 rounded-full transition-transform active:scale-95"
                  aria-label="Stop generating"
                >
                  <SquareIcon className="size-3.5 fill-current" />
                </Button>
              </ComposerPrimitive.Cancel>
            </AuiIf>
          </div>
        </div>
      </div>
      {session && (
        <div className="flex items-center gap-3 px-2 text-[11px] text-muted-foreground/80">
          <span className="tnum min-w-0 truncate font-mono" title={session.cwd}>
            {session.cwd}
          </span>
          <span className="flex-1" />
          {session.availableCommands.length > 0 && (
            <span className="hidden sm:inline">
              {session.availableCommands.length} /commands · Ctrl+K
            </span>
          )}
        </div>
      )}
    </ComposerPrimitive.Root>
  );
};

// ---- messages ---------------------------------------------------------------

const WorkingIndicator: FC = () => {
  // ConditionalEmpty also fires for tool-call-only messages; only show for
  // the genuinely empty optimistic bubble.
  const isEmpty = useAuiState((s) => s.message.parts.length === 0);
  if (!isEmpty) return null;
  return (
    <div className="flex items-center gap-2 px-2 text-sm text-muted-foreground">
      <span className="size-1.5 animate-pulse rounded-full bg-primary" />
      Devin is working…
    </div>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="relative flex flex-col">
      <div className="px-2 leading-relaxed break-words text-foreground">
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            Reasoning,
            ReasoningGroup,
            Empty: WorkingIndicator,
            tools: { Fallback: DevinToolFallback },
          }}
        />
      </div>
      <div className="ms-1 mt-1 flex min-h-7 items-center">
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <MessagePrimitive.If hasContent>
      <div className="flex gap-1 text-muted-foreground opacity-0 transition-opacity duration-150 hover:opacity-100 focus-within:opacity-100">
        <CopyButton />
      </div>
    </MessagePrimitive.If>
  );
};

const CopyButton: FC = () => {
  const isCopied = useAuiState((s) => s.message.isCopied);
  return (
    <ActionBarCopy>
      <TooltipIconButton tooltip="Copy" className="size-7">
        {isCopied ? (
          <CheckIcon className="size-3.5 text-emerald-500" />
        ) : (
          <CopyIcon className="size-3.5" />
        )}
      </TooltipIconButton>
    </ActionBarCopy>
  );
};

const ActionBarCopy: FC<{ children: React.ReactNode }> = ({ children }) => (
  <ActionBarPrimitive.Root className="flex gap-1">
    <ActionBarPrimitive.Copy asChild>{children}</ActionBarPrimitive.Copy>
  </ActionBarPrimitive.Root>
);

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="flex flex-col items-end gap-1.5 px-2">
      <UserMessageAttachments />
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-4 py-2 text-[15px] leading-relaxed break-words text-foreground empty:hidden">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
};
