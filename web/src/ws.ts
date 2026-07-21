import { dispatchEvent, refreshSessions, resyncActiveSession, setWsConnected } from "./state";
import type { WsServerEvent } from "./types";

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let attempts = 0;

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

/** Start the single WS client with auto-reconnect (exponential backoff). Idempotent. */
export function startWs(): void {
  if (started) return;
  started = true;
  connect();
}

function connect(): void {
  try {
    ws = new WebSocket(wsUrl());
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    attempts = 0;
    setWsConnected(true);
    // Catch up on anything missed while disconnected.
    void refreshSessions();
    resyncActiveSession();
  };
  ws.onmessage = (e) => {
    let ev: WsServerEvent;
    try {
      ev = JSON.parse(String(e.data)) as WsServerEvent;
    } catch {
      return;
    }
    dispatchEvent(ev);
  };
  ws.onclose = () => {
    setWsConnected(false);
    ws = null;
    scheduleReconnect();
  };
  ws.onerror = () => {
    ws?.close();
  };
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  // 1s → 2s → 4s → … capped at 15s, so a downed server isn't hammered once
  // per second forever from every open tab.
  const delay = Math.min(15_000, 1000 * 2 ** Math.min(attempts, 4));
  attempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}
