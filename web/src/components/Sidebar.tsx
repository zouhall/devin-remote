import { useMemo, useState } from "react";
import { api } from "../api";
import {
  createSession,
  refreshSessions,
  renameSession,
  selectSession,
  setUi,
  showNotice,
  useStore,
} from "../state";
import type { SessionState } from "../state";
import { fuzzyScore, relTime, truncate } from "../utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import {
  ChartColumnIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  FolderIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react";

function sessionLabel(s: SessionState): string {
  return s.alias || s.title || `session ${s.sessionId.slice(0, 8)}`;
}

const LogoMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden>
    <rect width="32" height="32" rx="7" className="fill-muted" />
    <path d="M9 23V9h5.5a5.5 5.5 0 0 1 0 14z" fill="none" className="stroke-primary" strokeWidth="2.4" />
  </svg>
);

export default function Sidebar() {
  const state = useStore();
  const [cwdInput, setCwdInput] = useState("");
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  const workspaces = useMemo(() => {
    const set = new Set<string>();
    for (const w of state.meta?.workspaces ?? []) set.add(w);
    for (const s of Object.values(state.sessions)) if (s.cwd) set.add(s.cwd);
    if (state.meta?.primaryCwd) set.add(state.meta.primaryCwd);
    return [...set].sort();
  }, [state.meta, state.sessions]);

  const groups = useMemo(() => {
    const all = Object.values(state.sessions);
    const filtered = filter.trim()
      ? all
          .map((s) => {
            const score = Math.min(
              ...[sessionLabel(s), s.cwd, s.sessionId].map((t) => fuzzyScore(filter, t) ?? Infinity),
            );
            return { s, score };
          })
          .filter(({ score }) => score !== Infinity)
          .sort((a, b) => a.score - b.score)
          .map(({ s }) => s)
      : all;
    const byCwd = new Map<string, SessionState[]>();
    for (const s of filtered) {
      const key = s.cwd || "(unknown cwd)";
      if (!byCwd.has(key)) byCwd.set(key, []);
      byCwd.get(key)!.push(s);
    }
    for (const list of byCwd.values()) {
      list.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    }
    return [...byCwd.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [state.sessions, filter]);

  const submitNew = async () => {
    const dir = cwdInput.trim() || state.meta?.primaryCwd || "";
    if (!dir || creating) return;
    setCreating(true);
    await createSession(dir);
    setCreating(false);
    setCwdInput("");
  };

  const commitRename = async (id: string) => {
    const title = renameText.trim();
    setRenamingId(null);
    if (title) await renameSession(id, title);
  };

  const loadingList = state.sessionsLoading && groups.length === 0;

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border bg-card/50 transition-transform duration-200 ease-out",
        "md:static md:translate-x-0",
        state.ui.sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
      )}
    >
      <div className="flex h-13 flex-none items-center gap-2 border-b border-border px-3.5">
        <LogoMark className="size-6 rounded-md" />
        <span className="text-sm font-semibold tracking-[-0.01em]">Devin Console</span>
        <span className="tnum font-mono text-[11px] text-muted-foreground">
          v{state.meta?.app.version ?? "…"}
        </span>
      </div>

      <div className="flex flex-none flex-col gap-2 border-b border-border p-3">
        <div className="flex gap-1.5">
          <Input
            className="tnum h-8 flex-1 bg-background font-mono text-xs"
            list="dc-workspaces"
            placeholder={state.meta?.primaryCwd ?? "/path/to/workspace"}
            value={cwdInput}
            onChange={(e) => setCwdInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitNew();
            }}
          />
          <datalist id="dc-workspaces">
            {workspaces.map((w) => (
              <option key={w} value={w} />
            ))}
          </datalist>
          <Button size="sm" className="h-8 gap-1" onClick={() => void submitNew()} disabled={creating}>
            {creating ? <Loader2Icon className="size-3.5 animate-spin" /> : <PlusIcon className="size-3.5" />}
            New
          </Button>
        </div>
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 bg-background pl-8 text-xs"
            placeholder="Filter sessions…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loadingList && (
          <div className="flex flex-col gap-2 p-1.5" aria-label="Loading sessions">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="dc-shimmer h-12 rounded-lg" />
            ))}
          </div>
        )}
        {!loadingList && groups.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            {state.sessionsLoaded ? "No sessions yet — create one above." : "No sessions yet"}
          </div>
        )}
        {groups.map(([cwd, list]) => (
          <div key={cwd} className="mb-1">
            <div
              className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[11px] text-muted-foreground"
              title={cwd}
            >
              <FolderIcon className="size-3 flex-none" />
              <span className="tnum truncate font-mono">{cwd}</span>
            </div>
            {list.map((s, i) => (
              <div
                key={s.sessionId}
                role="button"
                tabIndex={0}
                style={{ animationDelay: `${Math.min(i * 25, 200)}ms` }}
                className={cn(
                  "group relative flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 transition-colors duration-150",
                  "hover:bg-accent/60 active:scale-[0.99]",
                  s.sessionId === state.activeSessionId && "bg-accent",
                )}
                onClick={() => renamingId !== s.sessionId && selectSession(s.sessionId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") selectSession(s.sessionId);
                }}
              >
                {s.running && (
                  <span className="absolute left-0.5 top-1/2 size-1.5 -translate-y-1/2 animate-pulse rounded-full bg-primary" />
                )}
                {renamingId === s.sessionId ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Input
                      className="h-7 flex-1 bg-background px-1.5 text-xs"
                      autoFocus
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void commitRename(s.sessionId);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                    />
                    <TooltipIconButton
                      tooltip="Save"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => void commitRename(s.sessionId)}
                    >
                      <CheckIcon className="size-3.5" />
                    </TooltipIconButton>
                    <TooltipIconButton
                      tooltip="Cancel"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => setRenamingId(null)}
                    >
                      <XIcon className="size-3.5" />
                    </TooltipIconButton>
                  </div>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium leading-tight" title={sessionLabel(s)}>
                        {truncate(sessionLabel(s), 60)}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span className="tnum font-mono">{s.sessionId.slice(0, 8)}</span>
                        {s.updatedAt && (
                          <>
                            <span>·</span>
                            <span>{relTime(s.updatedAt)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-none items-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                      <TooltipIconButton
                        tooltip="Rename"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingId(s.sessionId);
                          setRenameText(sessionLabel(s));
                        }}
                      >
                        <PencilIcon className="size-3.5" />
                      </TooltipIconButton>
                      <TooltipIconButton
                        tooltip="Export zip"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(api.exportUrl(s.sessionId), "_blank");
                        }}
                      >
                        <DownloadIcon className="size-3.5" />
                      </TooltipIconButton>
                      <TooltipIconButton
                        tooltip="Copy session id"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          void navigator.clipboard
                            .writeText(s.sessionId)
                            .then(() => showNotice("session id copied"))
                            .catch(() => showNotice("copy failed"));
                        }}
                      >
                        <CopyIcon className="size-3.5" />
                      </TooltipIconButton>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="flex h-11 flex-none items-center gap-1.5 border-t border-border px-3">
        <span
          className={cn(
            "size-1.5 rounded-full",
            state.wsConnected ? "bg-emerald-500" : "animate-pulse bg-red-500",
          )}
          title={state.wsConnected ? "connected" : "disconnected"}
        />
        <span className="text-[11px] text-muted-foreground">
          {state.wsConnected ? "connected" : "reconnecting…"}
        </span>
        <span className="flex-1" />
        <TooltipIconButton
          tooltip="Refresh sessions"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => void refreshSessions()}
          disabled={state.sessionsLoading}
        >
          {state.sessionsLoading ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <RefreshCwIcon className="size-4" />
          )}
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="Usage"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setUi({ modal: "usage" })}
        >
          <ChartColumnIcon className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="Search (Ctrl+K)"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setUi({ modal: "palette" })}
        >
          <SearchIcon className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="Settings"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setUi({ modal: "settings" })}
        >
          <SettingsIcon className="size-4" />
        </TooltipIconButton>
      </div>
    </aside>
  );
}
