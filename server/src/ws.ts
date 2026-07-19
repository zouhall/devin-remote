import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { WsServerEvent } from "./types.js";

/** Broadcast hub: one WebSocket endpoint, every event goes to every client. */
export class WsHub {
  private wss: WebSocketServer;

  constructor(server: Server, private hello: () => WsServerEvent) {
    this.wss = new WebSocketServer({ server, path: "/ws" });
    this.wss.on("connection", (ws) => {
      ws.send(JSON.stringify(this.hello()));
    });
  }

  broadcast(event: WsServerEvent) {
    const msg = JSON.stringify(event);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  }

  clients(): number {
    return this.wss.clients.size;
  }
}
