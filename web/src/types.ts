// Protocol types for devin-console — mirror of the server contract (REST + WS + ACP).

export type ThemeName = "dark" | "light" | "system";

export interface Settings {
  theme: ThemeName;
  soundComplete: boolean;
  soundNotify: boolean;
  desktopNotify: boolean;
  defaultModel?: string;
  defaultMode?: string;
}

export interface AppInfo {
  name: string;
  version: string;
}

export interface DevinInfo {
  installed: boolean;
  version: string | null;
  authed: boolean;
  detail: string;
}

export interface ProcessInfo {
  cwd: string;
  startedAt: number;
  exited: boolean;
  capabilities: { loadSession?: boolean; image?: boolean };
}

export interface MetaResponse {
  app: AppInfo;
  devin: DevinInfo;
  workspaces: string[];
  processes: ProcessInfo[];
  settings: Settings;
  primaryCwd: string;
}

export interface SessionSummary {
  sessionId: string;
  cwd: string;
  title: string | null;
  alias: string | null;
  updatedAt: string | null;
}

// ---- ACP session updates --------------------------------------------------

export interface TextContent {
  type: "text";
  text: string;
}

export type ToolCallStatus = "pending" | "in_progress" | "completed" | "failed" | string;

export interface ToolCallContentText {
  type: "content";
  content: { type: string; text?: string };
}

export interface ToolCallContentDiff {
  type: "diff";
  path: string;
  oldText: string | null;
  newText: string;
}

export interface ToolCallContentTerminal {
  type: "terminal";
  terminalId: string;
}

export type ToolCallContent =
  | ToolCallContentText
  | ToolCallContentDiff
  | ToolCallContentTerminal
  | { type: string; [key: string]: unknown };

export interface ToolCallLocation {
  path: string;
  line?: number;
}

export interface PlanEntry {
  content: string;
  status: "pending" | "in_progress" | "completed" | string;
  priority?: string;
}

export interface ConfigOptionValue {
  value: string;
  name: string;
  description?: string;
  _meta?: Record<string, unknown>;
}

export interface ConfigOption {
  id: string;
  name: string;
  category: string;
  type: string;
  currentValue: string;
  options: ConfigOptionValue[];
}

export interface SlashCommand {
  name: string;
  description: string;
  input?: unknown;
}

export interface MessageChunkUpdate {
  sessionUpdate: "user_message_chunk" | "agent_message_chunk" | "agent_thought_chunk";
  content: TextContent;
}

export interface ToolCallStartUpdate {
  sessionUpdate: "tool_call";
  toolCallId: string;
  title: string;
  kind: string;
  status: ToolCallStatus;
  content?: ToolCallContent[];
  locations?: ToolCallLocation[];
  rawInput?: unknown;
}

export interface ToolCallPatchUpdate {
  sessionUpdate: "tool_call_update";
  toolCallId: string;
  status?: ToolCallStatus;
  content?: ToolCallContent[];
  rawOutput?: unknown;
}

export interface PlanUpdate {
  sessionUpdate: "plan";
  entries: PlanEntry[];
}

export interface UsageUpdate {
  sessionUpdate: "usage_update";
  used: number;
  size: number;
  _meta?: Record<string, unknown>;
}

export interface ConfigOptionUpdate {
  sessionUpdate: "config_option_update";
  configOptions: ConfigOption[];
}

export interface CurrentModeUpdate {
  sessionUpdate: "current_mode_update";
  currentModeId: string;
}

export interface AvailableCommandsUpdate {
  sessionUpdate: "available_commands_update";
  availableCommands: SlashCommand[];
}

export interface SessionInfoUpdate {
  sessionUpdate: "session_info_update";
  title?: string;
  [key: string]: unknown;
}

export type KnownSessionUpdate =
  | MessageChunkUpdate
  | ToolCallStartUpdate
  | ToolCallPatchUpdate
  | PlanUpdate
  | UsageUpdate
  | ConfigOptionUpdate
  | CurrentModeUpdate
  | AvailableCommandsUpdate
  | SessionInfoUpdate;

/** Catch-all keeps forward compatibility with agent-specific update kinds. */
export type SessionUpdate = KnownSessionUpdate | ({ sessionUpdate: string } & Record<string, unknown>);

// ---- WebSocket events -----------------------------------------------------

export interface PermissionOption {
  optionId: string;
  name: string;
  kind: string;
}

export interface PermissionRequestEvent {
  type: "permission_request";
  requestId: string;
  sessionId: string;
  toolCall: { title?: string; kind?: string; rawInput?: unknown; [key: string]: unknown };
  options: PermissionOption[];
}

export interface PromptDoneResult {
  stopReason: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  userMessageId?: string;
}

export type WsServerEvent =
  | { type: "config"; app: AppInfo; settings: Settings }
  | { type: "session_update"; sessionId: string; update: SessionUpdate }
  | PermissionRequestEvent
  | { type: "permission_resolved"; requestId: string }
  | { type: "terminal_output"; terminalId: string; sessionId: string; data: string }
  | { type: "terminal_exit"; terminalId: string; sessionId: string; exitCode: number | null; signal: string | null }
  | { type: "agent_log"; sessionId: string; channel: string; message: string; level: string }
  | { type: "process_status"; cwd: string; status: "exited"; code: number | null }
  | { type: "prompt_done"; sessionId: string; result: PromptDoneResult };

// ---- REST payloads --------------------------------------------------------

export interface PromptBlockText {
  type: "text";
  text: string;
}

export interface PromptBlockImage {
  type: "image";
  uploadId: string;
  mimeType: string;
}

export interface PromptBlockResourceLink {
  type: "resource_link";
  uri: string;
  name?: string;
}

export type PromptBlock = PromptBlockText | PromptBlockImage | PromptBlockResourceLink;

export interface UploadMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
  url: string;
}

export interface UsageDay {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  turns: number;
}

export interface UsageRecord {
  ts: number;
  sessionId: string;
  cwd: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface UsageResponse {
  totals: { inputTokens: number; outputTokens: number; totalTokens: number; turns: number };
  byDay: Record<string, UsageDay>;
  recent: UsageRecord[];
}
