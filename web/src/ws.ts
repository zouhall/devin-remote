import { dispatchEvent, refreshSessions, resyncActiveSession, setWsConnected } from "./state";
import type { WsServerEvent } from "./types";

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

/** Start the single WS client with 1s auto-reconnect. Idempotent. */
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
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 1000);
}
