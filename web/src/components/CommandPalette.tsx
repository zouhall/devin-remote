import { useEffect, useMemo, useRef, useState } from "react";
import { injectIntoComposer, selectSession, setUi, useStore } from "../state";
import type { SessionState } from "../state";
import { fuzzyScore, truncate } from "../utils";
import { IconCommand, IconSession } from "../icons";

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
      const sa = Math.min(
        ...[a.label, a.sub].map((t) => fuzzyScore(query, t) ?? Infinity),
      );
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
    const el = listRef.current?.querySelector(".palette-item.active");
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

  return (
    <div className="modal-overlay" onMouseDown={close}>
      <div className="modal palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          className="palette-input"
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
        <div className="palette-list" ref={listRef}>
          {items.length === 0 && <div className="palette-empty">No matches</div>}
          {items.some((i) => i.kind === "command") && <div className="palette-section">Commands</div>}
          {items
            .filter((i) => i.kind === "command")
            .map((item) => (
              <button
                key={item.key}
                className={`palette-item ${items[index] === item ? "active" : ""}`}
                onMouseEnter={() => setIndex(items.indexOf(item))}
                onClick={() => choose(item)}
              >
                <span className="pi-icon">
                  <IconCommand size={14} />
                </span>
                <span className="pi-main">{item.label}</span>
                <span className="pi-sub">{item.sub}</span>
              </button>
            ))}
          {items.some((i) => i.kind === "session") && <div className="palette-section">Sessions</div>}
          {items
            .filter((i) => i.kind === "session")
            .map((item) => (
              <button
                key={item.key}
                className={`palette-item ${items[index] === item ? "active" : ""}`}
                onMouseEnter={() => setIndex(items.indexOf(item))}
                onClick={() => choose(item)}
              >
                <span className="pi-icon">
                  <IconSession size={14} />
                </span>
                <span className="pi-main">{item.label}</span>
                <span className="pi-sub">{item.sub}</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
