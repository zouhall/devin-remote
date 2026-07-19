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
import { cx, fuzzyScore, relTime, truncate } from "../utils";
import {
  IconChart,
  IconCheck,
  IconCopy,
  IconDownload,
  IconFolder,
  IconLogo,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconX,
} from "../icons";

function sessionLabel(s: SessionState): string {
  return s.alias || s.title || `session ${s.sessionId.slice(0, 8)}`;
}

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

  return (
    <aside className={cx("sidebar", state.ui.sidebarOpen && "open")}>
      <div className="sidebar-header">
        <div className="brand">
          <IconLogo size={22} />
          Devin Console
          <span className="version">v{state.meta?.app.version ?? "…"}</span>
        </div>
      </div>

      <div className="new-session">
        <input
          className="text-input mono"
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
        <button className="btn btn-primary" onClick={() => void submitNew()} disabled={creating}>
          <IconPlus size={14} /> {creating ? "Creating…" : "New Session"}
        </button>
      </div>

      <div className="sidebar-search">
        <input
          className="text-input"
          placeholder="Filter sessions…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="session-list">
        {!state.sessionsLoaded && !state.sessionsLoading && groups.length === 0 && (
          <div className="loading-row">No sessions yet</div>
        )}
        {state.sessionsLoading && groups.length === 0 && (
          <div className="loading-row">
            <span className="spinner" /> Loading sessions…
          </div>
        )}
        {groups.map(([cwd, list]) => (
          <div key={cwd} className="session-group">
            <div className="session-group-label" title={cwd}>
              <IconFolder size={12} />
              <span className="mono">{cwd}</span>
            </div>
            {list.map((s) => (
              <div
                key={s.sessionId}
                className={cx("session-item", s.sessionId === state.activeSessionId && "active")}
                role="button"
                tabIndex={0}
                onClick={() => renamingId !== s.sessionId && selectSession(s.sessionId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") selectSession(s.sessionId);
                }}
              >
                {s.running && <span className="activity-dot" title="streaming" />}
                {renamingId === s.sessionId ? (
                  <>
                    <input
                      className="rename-input"
                      autoFocus
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void commitRename(s.sessionId);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="si-actions" style={{ display: "flex" }}>
                      <button
                        className="icon-btn"
                        title="Save"
                        onClick={(e) => {
                          e.stopPropagation();
                          void commitRename(s.sessionId);
                        }}
                      >
                        <IconCheck size={13} />
                      </button>
                      <button
                        className="icon-btn"
                        title="Cancel"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingId(null);
                        }}
                      >
                        <IconX size={13} />
                      </button>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="si-main">
                      <span className="si-title" title={sessionLabel(s)}>
                        {truncate(sessionLabel(s), 60)}
                      </span>
                      <span className="si-sub">
                        <span className="mono">{s.sessionId.slice(0, 8)}</span>
                        {s.updatedAt && (
                          <>
                            · <span>{relTime(s.updatedAt)}</span>
                          </>
                        )}
                      </span>
                    </span>
                    <span className="si-actions">
                      <button
                        className="icon-btn"
                        title="Rename"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingId(s.sessionId);
                          setRenameText(sessionLabel(s));
                        }}
                      >
                        <IconPencil size={13} />
                      </button>
                      <button
                        className="icon-btn"
                        title="Export zip"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(api.exportUrl(s.sessionId), "_blank");
                        }}
                      >
                        <IconDownload size={13} />
                      </button>
                      <button
                        className="icon-btn"
                        title="Copy session id"
                        onClick={(e) => {
                          e.stopPropagation();
                          void navigator.clipboard
                            .writeText(s.sessionId)
                            .then(() => showNotice("session id copied"))
                            .catch(() => showNotice("copy failed"));
                        }}
                      >
                        <IconCopy size={13} />
                      </button>
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <span className={cx("conn-dot", !state.wsConnected && "off")} title={state.wsConnected ? "connected" : "disconnected"} />
        <span>{state.wsConnected ? "connected" : "reconnecting…"}</span>
        <span className="spacer" />
        <button
          className="icon-btn"
          title="Refresh sessions"
          onClick={() => void refreshSessions()}
          disabled={state.sessionsLoading}
        >
          {state.sessionsLoading ? <span className="spinner" /> : <IconRefresh size={15} />}
        </button>
        <button className="icon-btn" title="Usage" onClick={() => setUi({ modal: "usage" })}>
          <IconChart size={15} />
        </button>
        <button className="icon-btn" title="Search (Ctrl+K)" onClick={() => setUi({ modal: "palette" })}>
          <IconSearch size={15} />
        </button>
        <button className="icon-btn" title="Settings" onClick={() => setUi({ modal: "settings" })}>
          <IconSettings size={15} />
        </button>
      </div>
    </aside>
  );
}
