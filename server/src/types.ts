// Shared event types between the devin-console server and its web client.
// Keep in sync with web/src/types.ts.

export interface WsServerEvent {
  type:
    | "session_update"
    | "permission_request"
    | "permission_resolved"
    | "terminal_output"
    | "terminal_exit"
    | "agent_log"
    | "process_status"
    | "prompt_done"
    | "config";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface PermissionRequestPayload {
  requestId: string;
  sessionId: string;
  toolCall: unknown;
  options: Array<{ optionId: string; name: string; kind: string }>;
}

export interface SessionMeta {
  sessionId: string;
  cwd: string;
  title?: string;
  alias?: string;
  updatedAt?: string;
}

export interface UsageRecord {
  ts: number;
  sessionId: string;
  cwd: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model?: string;
}

export interface StoreShape {
  aliases: Record<string, string>;
  workspaces: string[];
  usage: UsageRecord[];
  settings: {
    theme: "dark" | "light" | "system";
    soundComplete: boolean;
    soundNotify: boolean;
    desktopNotify: boolean;
    defaultModel?: string;
    defaultMode?: string;
  };
}
