import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import fsp from "node:fs/promises";
import type { StoreShape, UsageRecord } from "./types.js";

const DEFAULTS: StoreShape = {
  aliases: {},
  workspaces: [],
  usage: [],
  settings: {
    theme: "dark",
    soundComplete: true,
    soundNotify: true,
    desktopNotify: false,
  },
};

const MAX_USAGE_RECORDS = 50_000;

export class Store {
  readonly dataDir: string;
  readonly uploadsDir: string;
  private file: string;
  private data: StoreShape;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.dataDir =
      process.env.DEVIN_REMOTE_HOME ??
      process.env.DEVIN_CONSOLE_HOME ??
      path.join(os.homedir(), ".devin-remote");
    // One-time migration from the pre-0.3 data dir.
    const legacy = path.join(os.homedir(), ".devin-console");
    if (!process.env.DEVIN_REMOTE_HOME && !fs.existsSync(this.dataDir) && fs.existsSync(legacy)) {
      fs.cpSync(legacy, this.dataDir, { recursive: true });
    }
    this.uploadsDir = path.join(this.dataDir, "uploads");
    this.file = path.join(this.dataDir, "store.json");
    fs.mkdirSync(this.uploadsDir, { recursive: true });
    this.data = this.load();
  }

  private load(): StoreShape {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return {
        ...DEFAULTS,
        ...raw,
        settings: { ...DEFAULTS.settings, ...(raw.settings ?? {}) },
      };
    } catch {
      return structuredClone(DEFAULTS);
    }
  }

  private save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void fsp.writeFile(this.file, JSON.stringify(this.data, null, 2));
    }, 250);
  }

  flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  get settings() {
    return this.data.settings;
  }

  setSettings(patch: Partial<StoreShape["settings"]>) {
    Object.assign(this.data.settings, patch);
    this.save();
    return this.data.settings;
  }

  alias(sessionId: string): string | undefined {
    return this.data.aliases[sessionId];
  }

  setAlias(sessionId: string, title: string) {
    if (title) this.data.aliases[sessionId] = title;
    else delete this.data.aliases[sessionId];
    this.save();
  }

  aliases(): Record<string, string> {
    return this.data.aliases;
  }

  workspaces(): string[] {
    return this.data.workspaces;
  }

  addWorkspace(cwd: string) {
    if (!this.data.workspaces.includes(cwd)) {
      this.data.workspaces.push(cwd);
      this.save();
    }
  }

  recordUsage(rec: UsageRecord) {
    this.data.usage.push(rec);
    if (this.data.usage.length > MAX_USAGE_RECORDS) {
      this.data.usage = this.data.usage.slice(-MAX_USAGE_RECORDS);
    }
    this.save();
  }

  usage(): UsageRecord[] {
    return this.data.usage;
  }
}
