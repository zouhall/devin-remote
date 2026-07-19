import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { CreateTerminalRequest, CreateTerminalResponse, TerminalOutputResponse, WaitForTerminalExitResponse } from "@agentclientprotocol/sdk";
import type { DevinAcpEvents } from "./acp.js";

interface Terminal {
  id: string;
  sessionId: string;
  proc: ChildProcess;
  output: string;
  truncated: boolean;
  exitCode: number | null;
  signal: string | null;
  waiters: Array<() => void>;
  limit: number;
}

const MAX_OUTPUT = 1024 * 1024; // 1 MiB ring buffer per terminal

/**
 * Implements the ACP terminal/* client methods with plain child_process.
 * No native pty dependency — agent commands are non-interactive, so piped
 * stdio is enough and `npx devin-console` stays build-free.
 */
export class TerminalRunner {
  private terminals = new Map<string, Terminal>();

  async create(
    defaultCwd: string,
    params: CreateTerminalRequest,
    ev: Pick<DevinAcpEvents, "onTerminalOutput" | "onTerminalExit">,
  ): Promise<CreateTerminalResponse> {
    const id = randomUUID();
    const limit = params.outputByteLimit ?? MAX_OUTPUT;
    const proc = spawn(params.command, params.args ?? [], {
      cwd: params.cwd ?? defaultCwd,
      env: {
        ...process.env,
        ...Object.fromEntries((params.env ?? []).map((e) => [e.name, e.value])),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const term: Terminal = {
      id,
      sessionId: params.sessionId,
      proc,
      output: "",
      truncated: false,
      exitCode: null,
      signal: null,
      waiters: [],
      limit,
    };
    this.terminals.set(id, term);

    const onData = (chunk: Buffer) => {
      const data = chunk.toString("utf8");
      term.output += data;
      if (term.output.length > term.limit) {
        term.output = term.output.slice(-term.limit);
        term.truncated = true;
      }
      ev.onTerminalOutput(id, term.sessionId, data);
    };
    proc.stdout!.on("data", onData);
    proc.stderr!.on("data", onData);
    proc.on("exit", (code, signal) => {
      term.exitCode = code;
      term.signal = signal;
      ev.onTerminalExit(id, term.sessionId, code, signal);
      for (const w of term.waiters) w();
      term.waiters = [];
    });

    return { terminalId: id };
  }

  async output(terminalId: string): Promise<TerminalOutputResponse> {
    const t = this.mustGet(terminalId);
    const exited = t.exitCode !== null || t.signal !== null;
    return {
      output: t.output,
      truncated: t.truncated,
      ...(exited
        ? { exitStatus: { exitCode: t.exitCode, signal: t.signal } }
        : {}),
    };
  }

  async waitForExit(terminalId: string): Promise<WaitForTerminalExitResponse> {
    const t = this.mustGet(terminalId);
    if (t.exitCode === null && t.signal === null) {
      await new Promise<void>((resolve) => t.waiters.push(resolve));
    }
    return { exitCode: t.exitCode, signal: t.signal };
  }

  kill(terminalId: string) {
    const t = this.terminals.get(terminalId);
    if (t && t.exitCode === null) t.proc.kill("SIGKILL");
  }

  release(terminalId: string) {
    this.kill(terminalId);
    this.terminals.delete(terminalId);
  }

  killAll() {
    for (const t of this.terminals.values()) {
      if (t.exitCode === null) t.proc.kill("SIGKILL");
    }
    this.terminals.clear();
  }

  private mustGet(id: string): Terminal {
    const t = this.terminals.get(id);
    if (!t) throw new Error(`unknown terminal: ${id}`);
    return t;
  }
}
