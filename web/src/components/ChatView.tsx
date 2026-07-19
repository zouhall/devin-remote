import { lazy, Suspense } from "react";
import { setUi, useStore } from "../state";
import type { SessionState } from "../state";
import { formatTokens } from "../utils";
import { cn } from "@/lib/utils";
import ModeSwitcher from "./ModeSwitcher";
import ModelPicker from "./ModelPicker";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangleIcon,
  ChartColumnIcon,
  MenuIcon,
  ScrollTextIcon,
  SettingsIcon,
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
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
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

const LogoMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden>
    <rect width="32" height="32" rx="7" className="fill-muted" />
    <path d="M9 23V9h5.5a5.5 5.5 0 0 1 0 14z" fill="none" className="stroke-primary" strokeWidth="2.4" />
  </svg>
);

const TIPS: Array<[string, string]> = [
  ["Slash commands", "Press Ctrl+K to search sessions and insert agent commands like /review."],
  ["Attach images", "Paste, drag & drop, or use the paperclip — screenshots go straight into the prompt."],
  ["Reference files", "Type @path/to/file.ts in your message to link a workspace file."],
  ["Modes & models", "Switch Code / Ask / Plan / Bypass and pick any model from the chat header."],
];

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="flex max-w-lg flex-col items-center gap-5 text-center">
        <LogoMark className="size-16 rounded-2xl shadow-xl" />
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">Devin Console</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            A browser console for the Devin CLI over the Agent Client Protocol. Create a session from
            the sidebar, or pick an existing one.
          </p>
        </div>
        <div className="grid w-full gap-2 text-left sm:grid-cols-2">
          {TIPS.map(([title, body]) => (
            <div key={title} className="rounded-xl border border-border bg-card p-3.5">
              <div className="text-[13px] font-medium">{title}</div>
              <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</div>
            </div>
          ))}
        </div>
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
            <pre className="mt-3 overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-xs">{`# see https://docs.devin.ai/cli for installation\ndevin version`}</pre>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              The devin CLI is installed but not authenticated. Log in on this machine, then reload the
              page.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-xs">{`devin auth login\ndevin auth status`}</pre>
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
  const title = session
    ? session.alias || session.title || `session ${session.sessionId.slice(0, 8)}`
    : "Devin Console";

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
        <TooltipIconButton
          tooltip="Terminals"
          variant="ghost"
          size="icon"
          className={cn("size-9", state.ui.terminalOpen && "bg-accent text-foreground")}
          onClick={() => setUi({ terminalOpen: !state.ui.terminalOpen })}
        >
          <SquareTerminalIcon className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="Agent log"
          variant="ghost"
          size="icon"
          className={cn("size-9", state.ui.logOpen && "bg-accent text-foreground")}
          onClick={() => setUi({ logOpen: !state.ui.logOpen })}
        >
          <ScrollTextIcon className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="Usage"
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={() => setUi({ modal: "usage" })}
        >
          <ChartColumnIcon className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="Settings"
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={() => setUi({ modal: "settings" })}
        >
          <SettingsIcon className="size-4" />
        </TooltipIconButton>
      </header>

      {setupNeeded ? (
        <SetupBanner installed={meta!.devin.installed} authed={meta!.devin.authed} detail={meta!.devin.detail} />
      ) : session ? (
        <Suspense fallback={<ThreadSkeleton />}>
          <SessionChat session={session} />
        </Suspense>
      ) : (
        <EmptyState />
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
