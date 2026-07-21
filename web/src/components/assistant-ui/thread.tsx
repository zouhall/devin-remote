"use client";

// Devin Remote thread — built on assistant-ui primitives, fed by our ACP
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
import { DevinMark } from "@/components/DevinLogo";
import { PermissionStack } from "@/components/PermissionCard";
import { PlanPanel } from "@/components/PlanPanel";
import { modeIcon } from "@/components/ModeSwitcher";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { setSessionConfig, setUi, showNotice, useStore } from "@/state";
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
  FolderIcon,
  PlusIcon,
  SquareIcon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FC,
} from "react";
import type { ConfigOption } from "@/types";

// memo: the parent tree re-renders on every store emit (once per streamed
// chunk); everything below subscribes narrowly, so the cascade stops here.
export const Thread: FC = memo(function Thread() {
  const isEmpty = useAuiState((s) => s.thread.messages.length === 0);
  const isLoading = useAuiState((s) => s.thread.isLoading);
  // Belt-and-braces: if our store already has timeline items but the runtime
  // hasn't caught up, show the skeleton — never a wrong "new session" hero.
  const storeEmpty = useStore((s) => {
    const active = s.activeSessionId ? s.sessions[s.activeSessionId] : null;
    return !active || active.timeline.length === 0;
  });
  const showSkeleton = isEmpty && (isLoading || !storeEmpty);
  const showHero = isEmpty && !isLoading && storeEmpty;

  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col bg-background">
      <ThreadPrimitive.Viewport className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-scroll scroll-smooth">
        <div
          className={cn(
            "mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-6",
            showHero && "justify-center",
          )}
        >
          {showSkeleton && <HistorySkeleton />}
          {showHero && <WelcomeHero />}

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
            {showHero && <SuggestionChips />}
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
});

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

const WelcomeHero: FC = () => {
  return (
    <div className="mb-6 flex flex-col items-center px-4">
      <DevinMark size={72} className="text-muted-foreground/25" />
    </div>
  );
};

const SuggestionChips: FC = () => {
  const composer = useComposerRuntime();
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 px-2 pt-1">
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          className="max-w-full truncate rounded-full bg-secondary px-3.5 py-1.5 text-[13px] text-secondary-foreground transition-all duration-150 hover:bg-accent active:scale-[0.98]"
          onClick={() => {
            composer.setText(s);
            composer.send();
          }}
        >
          {s}
        </button>
      ))}
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

// Stable empty fallback: returning a fresh [] from a selector would defeat
// useSyncExternalStore's Object.is bail-out and re-render on every emit.
const EMPTY_CONFIG_OPTIONS: ConfigOption[] = [];

const Composer: FC = () => {
  const composer = useComposerRuntime();
  // Narrow, reference-stable slices instead of the whole store — the composer
  // must not re-render per streamed chunk (it owns the focused textarea).
  const sessionId = useStore((s) => s.activeSessionId);
  const sessionCwd = useStore((s) => (s.activeSessionId ? s.sessions[s.activeSessionId]?.cwd ?? null : null));
  const configOptions = useStore(
    (s) => (s.activeSessionId ? s.sessions[s.activeSessionId]?.configOptions : undefined) ?? EMPTY_CONFIG_OPTIONS,
  );
  const currentModeId = useStore((s) =>
    s.activeSessionId ? s.sessions[s.activeSessionId]?.currentModeId ?? null : null,
  );
  const composerInject = useStore((s) => s.composerInject);
  const isEmpty = useAuiState((s) => s.thread.messages.length === 0);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const modeOpt = sessionId ? configOptions.find((o) => o.category === "mode") : undefined;
  const currentMode = sessionId ? (currentModeId ?? modeOpt?.currentValue ?? "") : "";
  const currentModeOpt = modeOpt?.options.find((o) => o.value === currentMode);
  const modelOpt = sessionId ? configOptions.find((o) => o.category === "model") : undefined;
  const currentModel = modelOpt?.options.find((o) => o.value === modelOpt.currentValue);

  const cycleMode = () => {
    if (!sessionId || !modeOpt || modeOpt.options.length === 0) return;
    const idx = modeOpt.options.findIndex((o) => o.value === currentMode);
    const next = modeOpt.options[(idx + 1) % modeOpt.options.length];
    void setSessionConfig(sessionId, "mode", next.value);
  };

  const focusCwdPicker = () => {
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;
    if (!isDesktop) setUi({ sidebarOpen: true });
    setTimeout(() => document.getElementById("dc-cwd-input")?.focus(), 50);
  };

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
    if (!composerInject) return;
    const current = composer.getState().text;
    composer.setText(current ? `${current.replace(/\s+$/, "")} ${composerInject.text}` : composerInject.text);
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerInject?.seq]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [sessionId]);

  return (
    <ComposerPrimitive.Root className="relative flex w-full flex-col gap-1.5">
      <div
        data-dragging={dragging || undefined}
        className={cn(
          "flex w-full flex-col gap-1 rounded-2xl border border-border bg-card p-3",
          "shadow-[0_1px_3px_rgba(0,0,0,0.05),0_8px_24px_-16px_rgba(0,0,0,0.12)] transition-[border-color,box-shadow] duration-150",
          "focus-within:border-muted-foreground/30",
          dragging && "border-dashed border-ring bg-accent/50",
        )}
      >
        <ComposerAttachments />
        <ComposerPrimitive.Input
          ref={inputRef}
          placeholder={
            dragging
              ? "Drop images to attach…"
              : isEmpty
                ? "Ask Devin to build features, fix bugs, or work on your code"
                : "Message Devin… (Enter to send, Shift+Enter for newline, @path to link files)"
          }
          className="caret-primary placeholder:text-muted-foreground/70 max-h-40 min-h-12 w-full resize-none bg-transparent px-1.5 py-1 text-[15px] leading-relaxed outline-none"
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
        <div className="flex items-center gap-2">
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
            size="icon"
            className="size-9 flex-none rounded-full bg-secondary text-secondary-foreground transition-all duration-150 hover:bg-accent active:scale-95"
            onClick={() => fileRef.current?.click()}
          >
            <PlusIcon className="size-4.5" />
          </TooltipIconButton>
          {modeOpt && modeOpt.options.length > 0 && (
            <button
              type="button"
              title={currentModeOpt?.description ?? "Switch mode"}
              className="flex h-9 items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground"
              onClick={cycleMode}
            >
              {modeIcon(currentMode, currentModeOpt?._meta?.["cognition.ai/icon"], "size-4")}
              <span className="hidden sm:inline">{currentModeOpt?.name ?? currentMode}</span>
            </button>
          )}
          {modelOpt && modelOpt.options.length > 0 && (
            <button
              type="button"
              title="Pick a model"
              className="hidden h-9 max-w-48 items-center truncate rounded-full px-1 text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground sm:flex"
              onClick={() => setUi({ modelPickerOpen: true })}
            >
              <span className="truncate">{currentModel?.name ?? modelOpt.currentValue}</span>
            </button>
          )}
          <span className="flex-1" />
          <AuiIf condition={(s) => !s.thread.isRunning}>
            <ComposerPrimitive.Send asChild>
              <Button
                type="button"
                size="icon"
                title="Send message"
                className="size-9 flex-none rounded-full bg-foreground text-background shadow-none transition-all duration-150 hover:bg-foreground/85 hover:text-background active:scale-95 disabled:bg-muted disabled:text-muted-foreground"
                aria-label="Send message"
              >
                <ArrowUpIcon className="size-4.5" />
              </Button>
            </ComposerPrimitive.Send>
          </AuiIf>
          <AuiIf condition={(s) => s.thread.isRunning}>
            <ComposerPrimitive.Cancel asChild>
              <Button
                type="button"
                size="icon"
                title="Stop generating"
                className="size-9 flex-none rounded-full bg-foreground text-background shadow-none transition-all duration-150 hover:bg-foreground/85 hover:text-background active:scale-95"
                aria-label="Stop generating"
              >
                <SquareIcon className="size-3.5 fill-current" />
              </Button>
            </ComposerPrimitive.Cancel>
          </AuiIf>
        </div>
      </div>
      {sessionId && (
        <div className="flex items-center gap-3 px-2 text-[11px] text-muted-foreground/80">
          <button
            type="button"
            className="flex min-w-0 items-center gap-1.5 rounded transition-colors hover:text-foreground"
            title="Change workspace directory"
            onClick={focusCwdPicker}
          >
            <FolderIcon className="size-3 flex-none" />
            <span className="tnum truncate font-mono">{sessionCwd || "Select a directory…"}</span>
          </button>
          <span className="flex-1" />
          <a
            href="https://docs.devin.ai"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-primary"
          >
            Docs ↗
          </a>
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
