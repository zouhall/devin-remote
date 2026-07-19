const MAX_UPDATES_PER_SESSION = 5000;
const MAX_SESSIONS = 200;

interface LogEntry {
  ts: number;
  update: Record<string, unknown>;
}

/** In-memory ring buffer of session updates, used for export and late-joining clients. */
export class SessionLog {
  private logs = new Map<string, LogEntry[]>();

  append(sessionId: string, update: Record<string, unknown>) {
    let log = this.logs.get(sessionId);
    if (!log) {
      if (this.logs.size >= MAX_SESSIONS) {
        const oldest = this.logs.keys().next().value!;
        this.logs.delete(oldest);
      }
      log = [];
      this.logs.set(sessionId, log);
    }
    log.push({ ts: Date.now(), update });
    if (log.length > MAX_UPDATES_PER_SESSION) {
      log.splice(0, log.length - MAX_UPDATES_PER_SESSION);
    }
  }

  get(sessionId: string): LogEntry[] {
    return this.logs.get(sessionId) ?? [];
  }
}
