import fs from "node:fs/promises";
import { DevinAcp, type DevinAcpEvents } from "./acp.js";
import { TerminalRunner } from "./terminal.js";

export interface ManagedProcess {
  acp: DevinAcp;
  cwd: string;
  startedAt: number;
}

/**
 * Pool of `devin acp` child processes, one per workspace directory.
 * Sessions are multiplexed on each process by sessionId.
 */
export class AcpManager {
  private byCwd = new Map<string, ManagedProcess>();
  private starting = new Map<string, Promise<DevinAcp>>();
  readonly terminal = new TerminalRunner();

  constructor(
    private ev: Omit<DevinAcpEvents, "onExit"> & {
      onExit: (cwd: string, code: number | null) => void;
      /** Called with the owning process for each permission request. */
      onPermissionOwner: (requestId: string, owner: DevinAcp) => void;
    },
  ) {}

  /** Get (or lazily start) the ACP process for a workspace directory. */
  async get(cwd: string): Promise<DevinAcp> {
    const existing = this.byCwd.get(cwd);
    if (existing && !existing.acp.exited) return existing.acp;

    const pending = this.starting.get(cwd);
    if (pending) return pending;

    const p = (async () => {
      await fs.mkdir(cwd, { recursive: true });
      let instance: DevinAcp | null = null;
      const acp = await DevinAcp.start(cwd, this.terminal, {
        ...this.ev,
        onPermissionRequest: (requestId, sessionId, toolCall, options) => {
          if (instance) this.ev.onPermissionOwner(requestId, instance);
          this.ev.onPermissionRequest(requestId, sessionId, toolCall, options);
        },
        onExit: (code) => {
          this.byCwd.delete(cwd);
          this.ev.onExit(cwd, code);
        },
      });
      instance = acp;
      this.byCwd.set(cwd, { acp, cwd, startedAt: Date.now() });
      return acp;
    })();

    this.starting.set(cwd, p);
    try {
      return await p;
    } finally {
      this.starting.delete(cwd);
    }
  }

  status() {
    return [...this.byCwd.values()].map((m) => ({
      cwd: m.cwd,
      startedAt: m.startedAt,
      exited: m.acp.exited,
      capabilities: {
        loadSession: m.acp.capabilities?.agentCapabilities?.loadSession ?? false,
        image: m.acp.capabilities?.agentCapabilities?.promptCapabilities?.image ?? false,
      },
    }));
  }

  killAll() {
    for (const m of this.byCwd.values()) m.acp.kill();
    this.byCwd.clear();
    this.terminal.killAll();
  }
}
