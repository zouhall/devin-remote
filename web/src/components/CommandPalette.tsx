import { useEffect, useMemo, useRef, useState } from "react";
import { injectIntoComposer, selectSession, setUi, useStore } from "../state";
import type { SessionState } from "../state";
import { fuzzyScore, truncate } from "../utils";
import { cn } from "@/lib/utils";
import { SquareSlashIcon, MessageSquareIcon } from "lucide-react";

interface Item {
  key: string;
  label: string;
  sub: string;
  kind: "session" | "command";
  session?: SessionState;
  command?: string;
}

export default function CommandPalette() {
  const state = useStore();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const active = state.activeSessionId ? state.sessions[state.activeSessionId] : null;

  const items = useMemo(() => {
    const out: Item[] = [];
    for (const s of Object.values(state.sessions)) {
      const label = s.alias || s.title || `session ${s.sessionId.slice(0, 8)}`;
      const score = Math.min(
        ...[label, s.cwd, s.sessionId].map((t) => fuzzyScore(query, t) ?? Infinity),
      );
      if (score !== Infinity) {
        out.push({
          key: `s:${s.sessionId}`,
          label: truncate(label, 60),
          sub: s.cwd,
          kind: "session",
          session: s,
        });
      }
    }
    out.sort((a, b) => {
      const sa = Math.min(...[a.label, a.sub].map((t) => fuzzyScore(query, t) ?? Infinity));
      const sb = Math.min(...[b.label, b.sub].map((t) => fuzzyScore(query, t) ?? Infinity));
      return sa - sb;
    });
    const sessions = out.slice(0, 8);
    const commands: Item[] = [];
    for (const c of active?.availableCommands ?? []) {
      if (fuzzyScore(query, `/${c.name}`) !== null || fuzzyScore(query, c.description) !== null) {
        commands.push({
          key: `c:${c.name}`,
          label: `/${c.name}`,
          sub: truncate(c.description ?? "", 60),
          kind: "command",
          command: c.name,
        });
      }
    }
    return [...commands.slice(0, 6), ...sessions];
  }, [state.sessions, active, query]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector("[data-active='true']");
    el?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const close = () => setUi({ modal: null });

  const choose = (item: Item) => {
    if (item.kind === "session" && item.session) {
      selectSession(item.session.sessionId);
    } else if (item.kind === "command" && item.command) {
      injectIntoComposer(`/${item.command} `);
    }
    close();
  };

  const renderItem = (item: Item) => (
    <button
      key={item.key}
      data-active={items[index] === item || undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-100",
        items[index] === item ? "bg-accent" : "hover:bg-accent/50",
      )}
      onMouseEnter={() => setIndex(items.indexOf(item))}
      onClick={() => choose(item)}
    >
      <span className="flex size-7 flex-none items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground">
        {item.kind === "command" ? <SquareSlashIcon className="size-3.5" /> : <MessageSquareIcon className="size-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{item.label}</span>
        {item.sub && <span className="tnum block truncate font-mono text-[11px] text-muted-foreground">{item.sub}</span>}
      </span>
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={close}
    >
      <div
        className="flex max-h-[60vh] w-[calc(100vw-2rem)] max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          className="h-12 flex-none border-b border-border bg-transparent px-4 text-[15px] outline-none placeholder:text-muted-foreground/70"
          autoFocus
          placeholder="Jump to a session, or type a /command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && items[index]) {
              choose(items[index]);
            }
          }}
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5" ref={listRef}>
          {items.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">No matches</div>
          )}
          {items.some((i) => i.kind === "command") && (
            <div className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">Commands</div>
          )}
          {items.filter((i) => i.kind === "command").map(renderItem)}
          {items.some((i) => i.kind === "session") && (
            <div className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">Sessions</div>
          )}
          {items.filter((i) => i.kind === "session").map(renderItem)}
        </div>
      </div>
    </div>
  );
}
