import { zipSync, strToU8 } from "fflate";
import type { SessionLog } from "./sessionlog.js";

interface AnyUpdate {
  sessionUpdate?: string;
  [k: string]: unknown;
}

function textOf(content: unknown): string {
  const c = content as { type?: string; text?: string } | undefined;
  return c?.text ?? "";
}

const CHUNK_KINDS = new Set(["user_message_chunk", "agent_message_chunk", "agent_thought_chunk"]);

/**
 * Merge consecutive streaming chunks of the same kind into one entry, so the
 * transcript renders one paragraph (and one "You" header) per message instead
 * of one per token fragment.
 */
function coalesceChunks(entries: Array<{ ts: number; update: AnyUpdate }>): Array<{ ts: number; update: AnyUpdate }> {
  const out: Array<{ ts: number; update: AnyUpdate }> = [];
  for (const e of entries) {
    const kind = e.update.sessionUpdate;
    const prev = out[out.length - 1];
    if (prev && kind && CHUNK_KINDS.has(kind) && prev.update.sessionUpdate === kind) {
      // Agent/thought chunks are token fragments (concatenate raw); user
      // chunks are whole blocks, and may even be separate prompts when the
      // agent produced nothing in between — keep them apart with a blank line.
      const sep = kind === "user_message_chunk" ? "\n\n" : "";
      prev.update = {
        ...prev.update,
        content: { type: "text", text: textOf(prev.update.content) + sep + textOf(e.update.content) },
      };
      continue;
    }
    out.push({ ts: e.ts, update: e.update });
  }
  return out;
}

/** Render the recorded session updates as a readable markdown transcript. */
function toMarkdown(sessionId: string, entries: Array<{ ts: number; update: AnyUpdate }>): string {
  const lines: string[] = [`# Devin session ${sessionId}`, ""];
  for (const { ts, update } of entries) {
    const kind = update.sessionUpdate;
    switch (kind) {
      case "user_message_chunk":
        lines.push(`\n## 👤 You — ${new Date(ts).toISOString()}\n`, textOf(update.content));
        break;
      case "agent_message_chunk":
        lines.push(textOf(update.content));
        break;
      case "agent_thought_chunk":
        for (const l of textOf(update.content).split("\n")) lines.push(`> ${l}`);
        break;
      case "tool_call": {
        const tc = update as { title?: string; kind?: string; toolCallId?: string };
        lines.push(`\n### 🔧 ${tc.title ?? tc.kind ?? "tool"} (\`${tc.toolCallId}\`)`);
        break;
      }
      case "tool_call_update": {
        const tc = update as { status?: string; toolCallId?: string };
        if (tc.status) lines.push(`- status: **${tc.status}**`);
        break;
      }
      case "plan": {
        const entries = (update.entries ?? []) as Array<{ content: string; status: string }>;
        for (const e of entries) {
          lines.push(`- [${e.status === "completed" ? "x" : " "}] ${e.content} _(${e.status})_`);
        }
        break;
      }
      case "usage_update": {
        lines.push(`\n_context: ${update.used}/${update.size} tokens_`);
        break;
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function buildSessionZip(
  sessionLog: SessionLog,
  sessionId: string,
  meta: Record<string, unknown>,
): Uint8Array {
  const entries = sessionLog.get(sessionId);
  return zipSync({
    "meta.json": strToU8(
      JSON.stringify({ sessionId, exportedAt: new Date().toISOString(), ...meta }, null, 2),
    ),
    "updates.jsonl": strToU8(entries.map((e) => JSON.stringify(e.update)).join("\n") + "\n"),
    "transcript.md": strToU8(toMarkdown(sessionId, coalesceChunks(entries))),
  });
}
