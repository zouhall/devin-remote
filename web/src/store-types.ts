// View-state shapes for the client store (kept apart from protocol types).

import type {
  ConfigOption,
  MetaResponse,
  PlanEntry,
  SessionSummary,
  SessionUpdate,
  Settings,
  SlashCommand,
  ToolCallContent,
  ToolCallLocation,
  ToolCallStatus,
} from "./types";

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  url: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent" | "thought";
  text: string;
  attachments: Attachment[];
  streaming: boolean;
  ts: number;
}

export interface ToolCallState {
  id: string;
  title: string;
  kind: string;
  status: ToolCallStatus;
  content: ToolCallContent[];
  locations?: ToolCallLocation[];
  rawInput?: unknown;
  rawOutput?: unknown;
}

export type TimelineItem = { kind: "message" | "tool"; id: string };

export interface PendingPermission {
  requestId: string;
  toolCall: { title?: string; kind?: string; rawInput?: unknown; [key: string]: unknown };
  options: Array<{ optionId: string; name: string; kind: string }>;
}

export interface SessionState {
  sessionId: string;
  cwd: string;
  title: string | null;
  alias: string | null;
  updatedAt: string | null;
  timeline: TimelineItem[];
  messages: Record<string, ChatMessage>;
  toolCalls: Record<string, ToolCallState>;
  plan: PlanEntry[] | null;
  usage: { used: number; size: number } | null;
  configOptions: ConfigOption[];
  currentModeId: string | null;
  availableCommands: SlashCommand[];
  permissions: PendingPermission[];
  running: boolean;
  /** True once history + live stream have been reconciled for display. */
  synced: boolean;
  /** Ids of the currently-open streaming bubbles, per role. */
  openAgentMsg: string | null;
  openThoughtMsg: string | null;
  openUserMsg: string | null;
}

export interface TerminalMeta {
  id: string;
  sessionId: string;
  exitCode: number | null;
  signal: string | null;
  /** Bumped on every output chunk — drives xterm writes. */
  version: number;
  /** Bumped when the buffer is trimmed; xterm must reset and rewrite. */
  resetSeq: number;
}

export interface AgentLogEntry {
  ts: number;
  sessionId: string;
  channel: string;
  message: string;
  level: string;
}

export interface UiState {
  sidebarOpen: boolean;
  modal: null | "settings" | "usage" | "palette";
  terminalOpen: boolean;
  logOpen: boolean;
  activeTerminalId: string | null;
}

export interface AppState {
  meta: MetaResponse | null;
  settings: Settings;
  sessions: Record<string, SessionState>;
  activeSessionId: string | null;
  sessionsLoading: boolean;
  sessionsLoaded: boolean;
  wsConnected: boolean;
  terminals: Record<string, TerminalMeta>;
  agentLog: AgentLogEntry[];
  notice: string | null;
  composerInject: { text: string; seq: number } | null;
  ui: UiState;
}

// Re-exported so the store module can build updates without extra imports.
export type { SessionSummary, SessionUpdate };
