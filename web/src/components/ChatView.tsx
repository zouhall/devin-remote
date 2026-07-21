import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { createSession, renameSession, selectSession, setUi, showNotice, useStore } from "../state";
import type { SessionState } from "../state";
import { formatTokens, relTime } from "../utils";
import { cn } from "@/lib/utils";
import ModeSwitcher from "./ModeSwitcher";
import ModelPicker from "./ModelPicker";
import { sessionLabel } from "./Sidebar";
import { DevinMark } from "./DevinLogo";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  AlertTriangleIcon,
  ChartColumnIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  MenuIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  ScrollTextIcon,
  SquareTerminalIcon,
} from "lucide-react";

const SessionChat = lazy(() => import("./SessionChat"));

const Gauge = ({ usage }: { usage: { used: number; size: number } | null }) => {
  if (!usage || !usage.size) return null;
  const pct = Math.min(100, Math.round((usage.used / usage.size) * 100));
  return (
    <span
      className="hidden items-center gap-1.5 md:flex"
      title={`Context window: ${usage.used.toLocaleString()} / ${usage.size.toLocaleString()} tokens (${pct}%)`}
    >
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-secondary">
        <span
          className={cn(
            "block h-full rounded-full transition-[width] duration-300",
            pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-primary" : "bg-emerald-500",
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="tnum font-mono text-[11px] text-muted-foreground">
        {formatTokens(usage.used)}/{formatTokens(usage.size)}
      </span>
    </span>
  );
};

// ---- overflow menu (rename / export / copy id / usage) ---------------------

function OverflowMenu({ session }: { session: SessionState }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-foreground transition-colors duration-100 hover:bg-accent";

  return (
    <div className="relative" ref={ref}>
      <TooltipIconButton
        tooltip="More"
        variant="ghost"
        size="icon"
        className="size-9 text-muted-foreground"
        aria-label="More actions"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontalIcon className="size-4" />
      </TooltipIconButton>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-52 rounded-xl border border-border bg-popover p-1.5 shadow-lg">
          {renaming ? (
            <div className="flex items-center gap-1 p-1">
              <Input
                autoFocus
                className="h-8 flex-1 bg-background px-2 text-xs"
                value={renameText}
                onChange={(e) => setRenameText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renameText.trim()) {
                    void renameSession(session.sessionId, renameText.trim());
                    setRenaming(false);
                    setOpen(false);
                  }
                  if (e.key === "Escape") setRenaming(false);
                }}
              />
              <TooltipIconButton
                tooltip="Save"
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => {
                  if (renameText.trim()) void renameSession(session.sessionId, renameText.trim());
                  setRenaming(false);
                  setOpen(false);
                }}
              >
                <CheckIcon className="size-3.5" />
              </TooltipIconButton>
            </div>
          ) : (
            <button
              className={item}
              onClick={() => {
                setRenameText(sessionLabel(session));
                setRenaming(true);
              }}
            >
              <PencilIcon className="size-3.5 text-muted-foreground" /> Rename session
            </button>
          )}
          <button
            className={item}
            onClick={() => {
              window.open(api.exportUrl(session.sessionId), "_blank", "noopener,noreferrer");
              setOpen(false);
            }}
          >
            <DownloadIcon className="size-3.5 text-muted-foreground" /> Export zip
          </button>
          <button
            className={item}
            onClick={() => {
              void navigator.clipboard
                .writeText(session.sessionId)
                .then(() => showNotice("session id copied"))
                .catch(() => showNotice("copy failed"));
              setOpen(false);
            }}
          >
            <CopyIcon className="size-3.5 text-muted-foreground" /> Copy session id
          </button>
          <button
            className={item}
            onClick={() => {
              setUi({ modal: "usage" });
              setOpen(false);
            }}
          >
            <ChartColumnIcon className="size-3.5 text-muted-foreground" /> Usage
          </button>
        </div>
      )}
    </div>
  );
}

// ---- home (no session selected) ---------------------------------------------

function Home() {
  const state = useStore();
  const recent = useMemo(
    () =>
      Object.values(state.sessions)
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
        .slice(0, 5),
    [state.sessions],
  );

  const newSession = () => {
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;
    if (!isDesktop) {
      setUi({ sidebarOpen: true });
      setTimeout(() => document.getElementById("dc-cwd-input")?.focus(), 50);
      return;
    }
    const dir = state.meta?.primaryCwd;
    if (dir) void createSession(dir);
  };

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="flex w-full max-w-xl flex-col items-center gap-8">
        <DevinMark size={72} className="text-muted-foreground/25" />

        <div className="flex w-full items-center justify-center gap-2">
          <button
            className="flex h-10 items-center gap-2 rounded-xl bg-secondary px-4 text-sm font-medium text-secondary-foreground transition-all duration-150 hover:bg-accent active:scale-[0.98]"
            onClick={newSession}
          >
            New session
          </button>
          <a
            href="https://docs.devin.ai"
            target="_blank"
            rel="noreferrer"
            className="flex h-10 items-center rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            Docs ↗
          </a>
        </div>

        {recent.length > 0 && (
          <div className="w-full">
            <div className="mb-2 flex items-baseline justify-between px-1">
              <span className="text-sm text-muted-foreground">Recent sessions</span>
              <button
                className="text-sm text-primary transition-opacity hover:opacity-80"
                onClick={() => setUi({ modal: "palette" })}
              >
                View all
              </button>
            </div>
            <div className="w-full rounded-2xl border border-border bg-card px-4 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              {recent.map((s) => (
                <button
                  key={s.sessionId}
                  className="flex w-full items-center gap-2 border-b border-border/60 py-2.5 text-left text-[15px] transition-colors last:border-b-0 hover:text-primary"
                  onClick={() => selectSession(s.sessionId)}
                >
                  <MessageSquareIcon className="size-3.5 flex-none text-muted-foreground/60" />
                  <span className="min-w-0 flex-1 truncate font-medium">{sessionLabel(s)}</span>
                  <span className="flex-none text-[13px] text-muted-foreground">
                    {relTime(s.updatedAt)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SetupBanner({ installed, authed, detail }: { installed: boolean; authed: boolean; detail: string }) {
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6">
        <h3 className="flex items-center gap-2 text-base font-semibold tracking-[-0.01em]">
          <AlertTriangleIcon className="size-4 text-primary" />
          {!installed ? "Devin CLI not found" : "Devin CLI not logged in"}
        </h3>
        {!installed ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              The devin CLI is not installed (or not on PATH). Install it, then restart this server.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-secondary p-3 font-mono text-xs">{`# see https://docs.devin.ai/cli for installation\ndevin version`}</pre>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              The devin CLI is installed but not authenticated. Log in on this machine, then reload the
              page.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-secondary p-3 font-mono text-xs">{`devin auth login\ndevin auth status`}</pre>
          </>
        )}
        {detail && <p className="tnum mt-3 font-mono text-xs text-muted-foreground">{detail}</p>}
        <p className="mt-3 text-xs text-muted-foreground">
          Sessions and chat become available once the CLI is ready.
        </p>
      </div>
    </div>
  );
}

export default function ChatView({ session }: { session: SessionState | null }) {
  const state = useStore();
  const meta = state.meta;
  const setupNeeded = !!meta && (!meta.devin.installed || !meta.devin.authed);
  const title = session ? sessionLabel(session) : "Devin Remote";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-13 flex-none items-center gap-2 border-b border-border px-3">
        <TooltipIconButton
          tooltip="Sessions"
          variant="ghost"
          size="icon"
          className="size-9 md:hidden"
          aria-label="open sidebar"
          onClick={() => setUi({ sidebarOpen: true })}
        >
          <MenuIcon className="size-4.5" />
        </TooltipIconButton>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-[-0.01em]" title={title}>
            {title}
          </div>
          {session && (
            <div className="tnum -mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title={session.cwd}>
              {session.cwd}
            </div>
          )}
        </div>
        <div className="flex-1" />
        {session && <ModeSwitcher session={session} />}
        {session && <ModelPicker session={session} />}
        {session && <Gauge usage={session.usage} />}
        {session && (
          <TooltipIconButton
            tooltip="Terminals"
            variant="ghost"
            size="icon"
            className={cn("size-9 text-muted-foreground", state.ui.terminalOpen && "bg-secondary text-foreground")}
            onClick={() => setUi({ terminalOpen: !state.ui.terminalOpen })}
          >
            <SquareTerminalIcon className="size-4" />
          </TooltipIconButton>
        )}
        {session && (
          <TooltipIconButton
            tooltip="Agent log"
            variant="ghost"
            size="icon"
            className={cn("size-9 text-muted-foreground", state.ui.logOpen && "bg-secondary text-foreground")}
            onClick={() => setUi({ logOpen: !state.ui.logOpen })}
          >
            <ScrollTextIcon className="size-4" />
          </TooltipIconButton>
        )}
        {session && <OverflowMenu session={session} />}
      </header>

      {setupNeeded ? (
        <SetupBanner installed={meta!.devin.installed} authed={meta!.devin.authed} detail={meta!.devin.detail} />
      ) : session ? (
        <Suspense fallback={<ThreadSkeleton />}>
          <SessionChat session={session} />
        </Suspense>
      ) : (
        <Home />
      )}
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pt-6">
      <Skeleton className="dc-shimmer h-9 w-2/5 self-end rounded-xl" />
      <Skeleton className="dc-shimmer h-24 w-4/5 rounded-xl" />
    </div>
  );
}
