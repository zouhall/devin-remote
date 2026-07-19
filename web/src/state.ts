import { useSyncExternalStore } from "react";
import { api } from "./api";
import { notifyDesktop, soundComplete, soundNotify } from "./sound";
import type {
  Attachment,
  AppState,
  ChatMessage,
  PendingPermission,
  SessionState,
  SessionSummary,
  SessionUpdate,
  ToolCallState,
} from "./store-types";
import { mentionToUri, extractMentions } from "./utils";
import type {
  AvailableCommandsUpdate,
  ConfigOptionUpdate,
  CurrentModeUpdate,
  MessageChunkUpdate,
  MetaResponse,
  PermissionOption,
  PlanUpdate,
  PromptBlock,
  SessionInfoUpdate,
  Settings,
  ToolCallContent,
  ToolCallLocation,
  ToolCallPatchUpdate,
  ToolCallStartUpdate,
  UsageUpdate,
  WsServerEvent,
} from "./types";

// Re-export view types so components only import from one place.
export * from "./store-types";

// ---------------------------------------------------------------------------
// Reactive core

let state: AppState = {
  meta: null,
  settings: { theme: "light", soundComplete: true, soundNotify: true, desktopNotify: false },
  sessions: {},
  activeSessionId: null,
  sessionsLoading: false,
  sessionsLoaded: false,
  wsConnected: false,
  terminals: {},
  agentLog: [],
  notice: null,
  composerInject: null,
  ui: {
    sidebarOpen: false,
    modal: null,
    terminalOpen: false,
    logOpen: false,
    activeTerminalId: null,
    modelPickerOpen: false,
  },
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getState(): AppState {
  return state;
}

export function useStore(): AppState {
  return useSyncExternalStore(subscribe, getState);
}

function setState(partial: Partial<AppState>): void {
  state = { ...state, ...partial };
  emit();
}

// ---------------------------------------------------------------------------
// Non-reactive internals (sync queues, raw terminal buffers)

/** sessionId → live updates queued while a history sync is in flight. */
const syncQueues = new Map<string, SessionUpdate[]>();
/** terminalId → raw output (may contain ANSI). */
const termBuffers = new Map<string, string>();

const TERM_BUFFER_CAP = 512 * 1024;

export function getTerminalOutput(terminalId: string): string {
  return termBuffers.get(terminalId) ?? "";
}

// ---------------------------------------------------------------------------
// Sessions

let msgSeq = 0;

function emptySession(summary: SessionSummary): SessionState {
  return {
    sessionId: summary.sessionId,
    cwd: summary.cwd,
    title: summary.title ?? null,
    alias: summary.alias ?? null,
    updatedAt: summary.updatedAt ?? null,
    timeline: [],
    messages: {},
    toolCalls: {},
    plan: null,
    usage: null,
    configOptions: [],
    currentModeId: null,
    availableCommands: [],
    permissions: [],
    running: false,
    synced: false,
    openAgentMsg: null,
    openThoughtMsg: null,
    openUserMsg: null,
  };
}

export function updateSession(sessionId: string, fn: (draft: SessionState) => void): void {
  const existing = state.sessions[sessionId];
  if (!existing) return;
  const draft = { ...existing };
  fn(draft);
  setState({ sessions: { ...state.sessions, [sessionId]: draft } });
}

function ensureSession(summary: SessionSummary): void {
  const existing = state.sessions[summary.sessionId];
  if (existing) {
    updateSession(summary.sessionId, (d) => {
      d.cwd = summary.cwd || d.cwd;
      d.title = summary.title ?? d.title;
      d.alias = summary.alias ?? d.alias;
      d.updatedAt = summary.updatedAt ?? d.updatedAt;
    });
  } else {
    setState({ sessions: { ...state.sessions, [summary.sessionId]: emptySession(summary) } });
  }
}

export async function refreshSessions(): Promise<void> {
  if (state.sessionsLoading) return;
  setState({ sessionsLoading: true });
  try {
    const { sessions } = await api.listSessions();
    for (const s of sessions) ensureSession(s);
    setState({ sessionsLoaded: true });
  } catch (err) {
    showNotice(err instanceof Error ? err.message : "failed to list sessions");
  } finally {
    setState({ sessionsLoading: false });
  }
}

export async function refreshMeta(): Promise<MetaResponse | null> {
  try {
    const meta = await api.meta();
    setState({ meta, settings: meta.settings });
    return meta;
  } catch (err) {
    showNotice(err instanceof Error ? err.message : "failed to load server meta");
    return null;
  }
}

/**
 * Collapse replay generations inside the server-side log.
 * The server logs every update it ever saw — including the agent's replay
 * triggered by `open`, so after N opens the log holds N copies. A replay is
 * not always an exact prefix copy: the server mirrors user prompts into the
 * log itself, while the agent's replay omits them, so matching tolerates
/**
 * Collapse replay generations on the rendered timeline.
 * The server logs every update it ever saw — including the agent's replay
 * triggered by `open`, so after N opens the log holds N generations. A replay
 * is not fingerprint-identical to the original stream (thought chunks arrive
 * consolidated, state updates reorder, usage may be omitted), but the MERGED
 * messages it produces are textually identical, so dedupe happens here:
 * find the longest timeline suffix that is a subsequence of what precedes it
 * (a replay restates the same messages/tools, possibly skipping some) and
 * drop it; repeat until stable.
 */
function collapseRepeatedGenerations(d: SessionState): void {
  const keyOf = (item: SessionState["timeline"][number]): string => {
    if (item.kind === "message") {
      const m = d.messages[item.id];
      return m ? `m|${m.role}|${m.text}` : `m|?${item.id}`;
    }
    const t = d.toolCalls[item.id];
    return t ? `t|${t.id}|${t.status}` : `t|?${item.id}`;
  };
  for (;;) {
    const items = d.timeline;
    const n = items.length;
    if (n < 2) return;
    const keys = items.map(keyOf);
    let dropped = false;
    for (let L = n - 1; L >= 1; L--) {
      const s = n - L;
      // Is keys[s..n) a subsequence of keys[0..s)?
      let p = 0;
      let ok = true;
      for (let j = s; j < n; j++) {
        let found = false;
        while (p < s) {
          if (keys[p++] === keys[j]) {
            found = true;
            break;
          }
        }
        if (!found) {
          ok = false;
          break;
        }
      }
      if (ok) {
        const kept = items.slice(0, s);
        const keepMsg = new Set(kept.filter((i) => i.kind === "message").map((i) => i.id));
        const keepTool = new Set(kept.filter((i) => i.kind === "tool").map((i) => i.id));
        d.messages = Object.fromEntries(Object.entries(d.messages).filter(([id]) => keepMsg.has(id)));
        d.toolCalls = Object.fromEntries(Object.entries(d.toolCalls).filter(([id]) => keepTool.has(id)));
        d.timeline = kept;
        dropped = true;
        break;
      }
    }
    if (!dropped) return;
  }
}

function resetSessionContent(sessionId: string): void {
  updateSession(sessionId, (d) => {
    d.timeline = [];
    d.messages = {};
    d.toolCalls = {};
    d.plan = null;
    d.usage = null;
    d.running = false;
    d.openAgentMsg = null;
    d.openThoughtMsg = null;
    d.openUserMsg = null;
    d.synced = false;
  });
}

export function selectSession(sessionId: string): void {
  const s = state.sessions[sessionId];
  if (!s) return;
  setState({
    activeSessionId: sessionId,
    ui: { ...state.ui, sidebarOpen: false },
  });
  if (s.synced || syncQueues.has(sessionId)) return;

  resetSessionContent(sessionId);
  syncQueues.set(sessionId, []);
  void (async () => {
    // 1) Apply the server-side log first (it includes the user prompts the
    //    agent never broadcasts live).
    let updates: SessionUpdate[] = [];
    try {
      updates = (await api.history(sessionId)).updates;
    } catch {
      /* no server-side log */
    }
    for (const u of updates) applySessionUpdate(sessionId, u);
    updateSession(sessionId, (d) => {
      collapseRepeatedGenerations(d);
      d.running = false; // history is a snapshot; liveness comes from live events
      closeOpenMessages(d);
    });

    // 2) open() makes the agent replay the same conversation over WS; those
    //    events queue up in dispatchEvent. The loadSession response resolves
    //    only after the replay finished, so everything queued by then is
    //    replay and can be dropped. A short grace window catches stragglers.
    let openOk = false;
    try {
      await api.openSession(sessionId, s.cwd);
      openOk = true;
    } catch {
      /* loadSession unsupported/failed — queued events are genuinely live */
    }
    const queued = syncQueues.get(sessionId) ?? [];
    updateSession(sessionId, (d) => {
      d.synced = true;
    });
    if (!openOk) {
      syncQueues.delete(sessionId);
      for (const u of queued) applySessionUpdate(sessionId, u);
      updateSession(sessionId, (d) => {
        collapseRepeatedGenerations(d);
      });
    } else {
      setTimeout(() => {
        syncQueues.delete(sessionId);
      }, 500);
    }
  })();
}

export function resyncActiveSession(): void {
  const id = state.activeSessionId;
  if (!id) return;
  const s = state.sessions[id];
  if (!s) return;
  updateSession(id, (d) => {
    d.synced = false;
  });
  selectSession(id);
}

export async function createSession(cwd: string): Promise<void> {
  const dir = cwd.trim() || state.meta?.primaryCwd || "";
  if (!dir) {
    showNotice("no workspace directory — pass a cwd");
    return;
  }
  try {
    const res = await api.createSession(dir);
    ensureSession({ sessionId: res.sessionId, cwd: res.cwd, title: null, alias: null, updatedAt: null });
    updateSession(res.sessionId, (d) => {
      d.synced = true; // brand-new: nothing to replay
    });
    setState({ activeSessionId: res.sessionId, ui: { ...state.ui, sidebarOpen: false } });
    // Apply configured defaults for fresh sessions.
    const { defaultModel, defaultMode } = state.settings;
    if (defaultMode) void api.setConfig(res.sessionId, "mode", defaultMode, res.cwd).catch(() => undefined);
    if (defaultModel) void api.setConfig(res.sessionId, "model", defaultModel, res.cwd).catch(() => undefined);
  } catch (err) {
    showNotice(err instanceof Error ? err.message : "failed to create session");
  }
}

export async function renameSession(sessionId: string, title: string): Promise<void> {
  const s = state.sessions[sessionId];
  updateSession(sessionId, (d) => {
    d.alias = title || null;
  });
  try {
    await api.rename(sessionId, title, s?.cwd);
  } catch (err) {
    showNotice(err instanceof Error ? err.message : "rename failed");
  }
}

// ---------------------------------------------------------------------------
// Session-update reducer

function appendChunk(d: SessionState, role: "user" | "agent" | "thought", text: string): void {
  const openKey = role === "user" ? "openUserMsg" : role === "agent" ? "openAgentMsg" : "openThoughtMsg";
  const openId = d[openKey];
  if (openId && d.messages[openId]) {
    const msg = d.messages[openId];
    d.messages = { ...d.messages, [openId]: { ...msg, text: msg.text + text } };
    return;
  }
  const id = `m${++msgSeq}`;
  const msg: ChatMessage = { id, role, text, attachments: [], streaming: true, ts: Date.now() };
  d.messages = { ...d.messages, [id]: msg };
  d.timeline = [...d.timeline, { kind: "message", id }];
  d[openKey] = id;
}

function closeOpenMessages(d: SessionState, except?: "user" | "agent" | "thought"): void {
  const keys: Array<"openUserMsg" | "openAgentMsg" | "openThoughtMsg"> = [
    "openUserMsg",
    "openAgentMsg",
    "openThoughtMsg",
  ];
  for (const k of keys) {
    if (except && k === `open${except[0].toUpperCase()}${except.slice(1)}Msg`) continue;
    const id = d[k];
    if (id && d.messages[id]?.streaming) {
      d.messages = { ...d.messages, [id]: { ...d.messages[id], streaming: false } };
    }
    d[k] = null;
  }
}

function normalizeToolContent(items: ToolCallContent[] | undefined): ToolCallContent[] {
  return Array.isArray(items) ? items : [];
}

export function applySessionUpdate(sessionId: string, update: SessionUpdate): void {
  // Don't clobber an existing session's cwd with the primary-cwd fallback.
  ensureSession({
    sessionId,
    cwd: state.sessions[sessionId] ? "" : state.meta?.primaryCwd ?? "",
    title: null,
    alias: null,
    updatedAt: null,
  });
  updateSession(sessionId, (d) => {
    switch (update.sessionUpdate) {
      case "user_message_chunk":
      case "agent_message_chunk":
      case "agent_thought_chunk": {
        const u = update as MessageChunkUpdate;
        const role =
          u.sessionUpdate === "user_message_chunk"
            ? "user"
            : u.sessionUpdate === "agent_thought_chunk"
              ? "thought"
              : "agent";
        closeOpenMessages(d, role);
        appendChunk(d, role, u.content?.text ?? "");
        if (role !== "user") d.running = true;
        break;
      }
      case "tool_call": {
        const u = update as ToolCallStartUpdate;
        closeOpenMessages(d);
        d.running = true;
        const existing = d.toolCalls[u.toolCallId];
        const tc: ToolCallState = {
          id: u.toolCallId,
          title: u.title ?? existing?.title ?? "tool call",
          kind: u.kind ?? existing?.kind ?? "other",
          status: u.status ?? "pending",
          content: [...(existing?.content ?? []), ...normalizeToolContent(u.content)],
          locations: u.locations ?? existing?.locations,
          rawInput: u.rawInput ?? existing?.rawInput,
          rawOutput: existing?.rawOutput,
          startedAt: existing?.startedAt ?? Date.now(),
          finishedAt: existing?.finishedAt ?? null,
        };
        d.toolCalls = { ...d.toolCalls, [tc.id]: tc };
        if (!existing) d.timeline = [...d.timeline, { kind: "tool", id: tc.id }];
        registerTerminalsFromContent(sessionId, tc.content);
        break;
      }
      case "tool_call_update": {
        const u = update as ToolCallPatchUpdate;
        const existing = d.toolCalls[u.toolCallId];
        if (!existing) {
          // Update for a call we never saw — synthesize a card for it.
          const tc: ToolCallState = {
            id: u.toolCallId,
            title: "tool call",
            kind: "other",
            status: u.status ?? "in_progress",
            content: normalizeToolContent(u.content),
            rawOutput: u.rawOutput,
            startedAt: Date.now(),
            finishedAt: null,
          };
          d.toolCalls = { ...d.toolCalls, [tc.id]: tc };
          d.timeline = [...d.timeline, { kind: "tool", id: tc.id }];
          registerTerminalsFromContent(sessionId, tc.content);
          break;
        }
        const merged: ToolCallState = {
          ...existing,
          status: u.status ?? existing.status,
          content: u.content ? [...existing.content, ...u.content] : existing.content,
          rawOutput: u.rawOutput ?? existing.rawOutput,
          finishedAt:
            (u.status === "completed" || u.status === "failed") && existing.finishedAt == null
              ? Date.now()
              : existing.finishedAt,
        };
        d.toolCalls = { ...d.toolCalls, [merged.id]: merged };
        if (u.content) registerTerminalsFromContent(sessionId, u.content);
        break;
      }
      case "plan": {
        const u = update as PlanUpdate;
        closeOpenMessages(d);
        d.plan = u.entries ?? [];
        d.running = true;
        break;
      }
      case "usage_update": {
        const u = update as UsageUpdate;
        d.usage = { used: Number(u.used ?? 0), size: Number(u.size ?? 0) };
        break;
      }
      case "config_option_update": {
        const u = update as ConfigOptionUpdate;
        d.configOptions = u.configOptions ?? [];
        break;
      }
      case "current_mode_update": {
        const u = update as CurrentModeUpdate;
        d.currentModeId = u.currentModeId;
        break;
      }
      case "available_commands_update": {
        const u = update as AvailableCommandsUpdate;
        d.availableCommands = u.availableCommands ?? [];
        break;
      }
      case "session_info_update": {
        const u = update as SessionInfoUpdate;
        if (typeof u.title === "string" && u.title) d.title = u.title;
        break;
      }
      default:
        break;
    }
    d.updatedAt = new Date().toISOString();
  });
}

function applyLiveUpdate(sessionId: string, update: SessionUpdate): void {
  // Post-sync, live updates apply directly (dedupe happens during sync only).
  applySessionUpdate(sessionId, update);
}

// ---------------------------------------------------------------------------
// Terminals

function ensureTerminalMeta(terminalId: string, sessionId: string): void {
  const existing = state.terminals[terminalId];
  if (existing) return;
  setState({
    terminals: {
      ...state.terminals,
      [terminalId]: { id: terminalId, sessionId, exitCode: null, signal: null, version: 0, resetSeq: 0 },
    },
  });
}

function registerTerminalsFromContent(sessionId: string, content: ToolCallContent[]): void {
  for (const item of content) {
    if (item.type === "terminal" && typeof (item as { terminalId?: unknown }).terminalId === "string") {
      ensureTerminalMeta((item as { terminalId: string }).terminalId, sessionId);
    }
  }
}

function appendTerminalOutput(terminalId: string, sessionId: string, data: string): void {
  ensureTerminalMeta(terminalId, sessionId);
  let buf = (termBuffers.get(terminalId) ?? "") + data;
  const meta = state.terminals[terminalId];
  let resetSeq = meta.resetSeq;
  if (buf.length > TERM_BUFFER_CAP) {
    buf = buf.slice(-TERM_BUFFER_CAP / 2);
    resetSeq += 1;
  }
  termBuffers.set(terminalId, buf);
  setState({
    terminals: {
      ...state.terminals,
      [terminalId]: { ...meta, version: meta.version + 1, resetSeq },
    },
  });
}

// ---------------------------------------------------------------------------
// Prompting

export interface OutgoingAttachment extends Attachment {
  mime: string;
}

export async function sendPrompt(sessionId: string, text: string, attachments: Attachment[]): Promise<void> {
  const s = state.sessions[sessionId];
  if (!s) return;
  const blocks: PromptBlock[] = [];
  if (text.trim()) blocks.push({ type: "text", text });
  for (const a of attachments) {
    blocks.push({ type: "image", uploadId: a.id, mimeType: a.mime });
  }
  // @path mentions become ACP resource_link blocks; the text keeps the mention inline.
  for (const m of extractMentions(text)) {
    blocks.push({ type: "resource_link", uri: mentionToUri(m, s.cwd), name: m });
  }
  if (blocks.length === 0) return;

  const id = `m${++msgSeq}`;
  const msg: ChatMessage = { id, role: "user", text, attachments, streaming: false, ts: Date.now() };
  updateSession(sessionId, (d) => {
    closeOpenMessages(d);
    d.messages = { ...d.messages, [id]: msg };
    d.timeline = [...d.timeline, { kind: "message", id }];
    d.running = true;
  });

  try {
    await api.prompt(sessionId, blocks, s.cwd);
  } catch (err) {
    const eid = `m${++msgSeq}`;
    updateSession(sessionId, (d) => {
      closeOpenMessages(d);
      d.messages = {
        ...d.messages,
        [eid]: {
          id: eid,
          role: "agent",
          text: `**Error:** ${err instanceof Error ? err.message : "prompt failed"}`,
          attachments: [],
          streaming: false,
          ts: Date.now(),
        },
      };
      d.timeline = [...d.timeline, { kind: "message", id: eid }];
      d.running = false;
    });
  }
}

export async function cancelPrompt(sessionId: string): Promise<void> {
  const s = state.sessions[sessionId];
  if (!s) return;
  try {
    await api.cancel(sessionId, s.cwd);
  } catch (err) {
    showNotice(err instanceof Error ? err.message : "cancel failed");
    updateSession(sessionId, (d) => {
      d.running = false;
    });
  }
}

export async function setSessionConfig(sessionId: string, configId: "mode" | "model", value: string): Promise<void> {
  const s = state.sessions[sessionId];
  if (!s) return;
  const prevOptions = s.configOptions;
  const prevMode = s.currentModeId;
  // Optimistic update; the server echoes the authoritative config_option_update after.
  updateSession(sessionId, (d) => {
    d.configOptions = d.configOptions.map((opt) =>
      opt.id === configId || opt.category === configId ? { ...opt, currentValue: value } : opt,
    );
    if (configId === "mode") d.currentModeId = value;
  });
  try {
    await api.setConfig(sessionId, configId, value, s.cwd);
  } catch (err) {
    showNotice(err instanceof Error ? err.message : "failed to set config");
    updateSession(sessionId, (d) => {
      d.configOptions = prevOptions;
      d.currentModeId = prevMode;
    });
  }
}

// ---------------------------------------------------------------------------
// Permissions

export async function resolvePermission(requestId: string, optionId: string | null): Promise<void> {
  try {
    await api.resolvePermission(requestId, optionId);
  } catch (err) {
    showNotice(err instanceof Error ? err.message : "permission resolution failed");
  }
  // The server broadcasts permission_resolved; remove locally in case it races.
  removePermission(requestId);
}

function removePermission(requestId: string): void {
  for (const sid of Object.keys(state.sessions)) {
    const s = state.sessions[sid];
    if (s.permissions.some((p) => p.requestId === requestId)) {
      updateSession(sid, (d) => {
        d.permissions = d.permissions.filter((p) => p.requestId !== requestId);
      });
    }
  }
}

// ---------------------------------------------------------------------------
// UI helpers

let noticeTimer: ReturnType<typeof setTimeout> | null = null;

export function showNotice(text: string): void {
  setState({ notice: text });
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => setState({ notice: null }), 5000);
}

export function hideNotice(): void {
  if (noticeTimer) clearTimeout(noticeTimer);
  setState({ notice: null });
}

export function setUi(patch: Partial<AppState["ui"]>): void {
  setState({ ui: { ...state.ui, ...patch } });
}

export function setWsConnected(connected: boolean): void {
  if (state.wsConnected !== connected) setState({ wsConnected: connected });
}

export function injectIntoComposer(text: string): void {
  setState({ composerInject: { text, seq: (state.composerInject?.seq ?? 0) + 1 } });
}

export function pushAgentLog(entry: AppState["agentLog"][number]): void {
  const log = [...state.agentLog, entry];
  if (log.length > 500) log.splice(0, log.length - 500);
  setState({ agentLog: log });
}

export function clearAgentLog(): void {
  setState({ agentLog: [] });
}

// ---------------------------------------------------------------------------
// Settings

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const prev = state.settings;
  setState({ settings: { ...prev, ...patch } });
  try {
    const next = await api.putSettings(patch);
    setState({ settings: next });
  } catch (err) {
    showNotice(err instanceof Error ? err.message : "failed to save settings");
    setState({ settings: prev });
  }
}

// ---------------------------------------------------------------------------
// WS event dispatch (called from ws.ts)

export function dispatchEvent(ev: WsServerEvent): void {
  switch (ev.type) {
    case "config":
      setState({ settings: ev.settings });
      break;
    case "session_update": {
      const queue = syncQueues.get(ev.sessionId);
      if (queue) {
        queue.push(ev.update);
      } else {
        applyLiveUpdate(ev.sessionId, ev.update);
      }
      break;
    }
    case "permission_request": {
      ensureSession({
        sessionId: ev.sessionId,
        cwd: state.sessions[ev.sessionId] ? "" : state.meta?.primaryCwd ?? "",
        title: null,
        alias: null,
        updatedAt: null,
      });
      const perm: PendingPermission = {
        requestId: ev.requestId,
        toolCall: ev.toolCall,
        options: ev.options as PermissionOption[],
      };
      updateSession(ev.sessionId, (d) => {
        d.permissions = [...d.permissions, perm];
      });
      if (state.settings.soundNotify) soundNotify();
      if (document.hidden && state.settings.desktopNotify) {
        notifyDesktop("Devin needs permission", String(ev.toolCall?.title ?? "a tool call"));
      }
      break;
    }
    case "permission_resolved":
      removePermission(ev.requestId);
      break;
    case "terminal_output":
      appendTerminalOutput(ev.terminalId, ev.sessionId, ev.data);
      break;
    case "terminal_exit": {
      const meta = state.terminals[ev.terminalId];
      if (meta) {
        setState({
          terminals: {
            ...state.terminals,
            [ev.terminalId]: { ...meta, exitCode: ev.exitCode, signal: ev.signal },
          },
        });
      }
      break;
    }
    case "agent_log":
      pushAgentLog({ ts: Date.now(), sessionId: ev.sessionId, channel: ev.channel, message: ev.message, level: ev.level });
      break;
    case "process_status":
      if (ev.status === "exited") showNotice(`devin process exited (${ev.code ?? "?"}) — ${ev.cwd}`);
      break;
    case "prompt_done": {
      updateSession(ev.sessionId, (d) => {
        closeOpenMessages(d);
        d.running = false;
      });
      if (state.settings.soundComplete) soundComplete();
      if (document.hidden && state.settings.desktopNotify) {
        notifyDesktop("Devin finished a turn", `stop reason: ${ev.result?.stopReason ?? "end_turn"}`);
      }
      // The session title may have been generated — refresh the list lazily.
      setTimeout(() => void refreshSessions(), 1500);
      break;
    }
  }
}
