/**
 * End-to-end smoke test against a real `devin acp` process.
 *
 *   npm run smoke
 *
 * Creates a session in a temp dir, sends a tiny prompt, and prints every
 * session update plus the final prompt response. Requires `devin` on PATH
 * and a completed `devin auth login`.
 */
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { AcpManager } from "../server/src/manager.js";

const cwd = path.join(os.tmpdir(), "devin-console-smoke");
await fs.mkdir(cwd, { recursive: true });

const manager = new AcpManager({
  onSessionUpdate: (sid, update) => {
    const u = update as { sessionUpdate: string; [k: string]: unknown };
    const brief =
      u.sessionUpdate === "agent_message_chunk" || u.sessionUpdate === "agent_thought_chunk"
        ? JSON.stringify((u.content as { text?: string })?.text ?? "").slice(0, 80)
        : u.sessionUpdate === "usage_update"
          ? `used=${u.used} size=${u.size}`
          : "";
    console.log(`  [update] ${u.sessionUpdate} ${brief}`);
  },
  onAgentLog: (_sid, channel, message) => console.log(`  [log:${channel}] ${message.slice(0, 100)}`),
  onPermissionRequest: (id, _sid, toolCall, options) => {
    console.log(`  [permission] ${id} options=${options.map((o) => o.name).join("/")}`);
    // Auto-approve in smoke test: resolve via the acp instance below.
    resolvePermission(id, options[0]?.optionId ?? null);
  },
  onPermissionOwner: () => {},
  onTerminalOutput: () => {},
  onTerminalExit: (id, _sid, code) => console.log(`  [terminal ${id}] exit=${code}`),
  onExit: (cwd, code) => console.log(`[process ${cwd}] exited code=${code}`),
});

let acpRef: Awaited<ReturnType<AcpManager["get"]>> | null = null;
function resolvePermission(requestId: string, optionId: string | null) {
  acpRef?.resolvePermission(requestId, optionId);
}

console.log(`[smoke] starting devin acp in ${cwd}`);
const acp = await manager.get(cwd);
acpRef = acp;
console.log("[smoke] capabilities:", JSON.stringify(acp.capabilities?.agentCapabilities));

const session = await acp.newSession(cwd);
console.log(`[smoke] session: ${session.sessionId}`);

console.log('[smoke] prompting: "Reply with exactly: OK"');
const done = await acp.prompt(session.sessionId, [{ type: "text", text: "Reply with exactly: OK" }]);
console.log("[smoke] prompt finished:", JSON.stringify(done));

const sessions = await acp.listSessions();
console.log(`[smoke] session/list returned ${sessions.sessions.length} session(s)`);

manager.killAll();
console.log("[smoke] OK");
process.exit(0);
