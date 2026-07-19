import { memo, useState } from "react";
import type { ToolCallState } from "../state";
import { setUi } from "../state";
import type { ToolCallContent } from "../types";
import { cx } from "../utils";
import {
  IconCheck,
  IconChevron,
  IconCircle,
  IconEdit,
  IconFetch,
  IconPlay,
  IconRead,
  IconSearch,
  IconTerminal,
  IconThink,
  IconWrench,
  IconX,
} from "../icons";
import DiffView from "./DiffView";

function KindIcon({ kind }: { kind: string }) {
  const k = (kind || "").toLowerCase();
  if (k.includes("edit") || k.includes("write")) return <IconEdit size={14} />;
  if (k.includes("exec") || k.includes("bash") || k.includes("shell") || k.includes("command")) return <IconPlay size={14} />;
  if (k.includes("read")) return <IconRead size={14} />;
  if (k.includes("search") || k.includes("grep") || k.includes("glob")) return <IconSearch size={14} />;
  if (k.includes("fetch") || k.includes("web") || k.includes("http")) return <IconFetch size={14} />;
  if (k.includes("think") || k.includes("plan")) return <IconThink size={14} />;
  return <IconWrench size={14} />;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <span className="status-icon completed"><IconCheck size={14} /></span>;
  if (status === "failed") return <span className="status-icon failed"><IconX size={14} /></span>;
  if (status === "in_progress") return <span className="spinner" />;
  return <span className="status-icon pending"><IconCircle size={12} /></span>;
}

function summarizeRaw(raw: unknown): string {
  if (raw == null) return "";
  try {
    const s = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
    return s.length > 4000 ? s.slice(0, 4000) + "\n… (truncated)" : s;
  } catch {
    return String(raw);
  }
}

function ContentItem({ item }: { item: ToolCallContent }) {
  if (item.type === "content") {
    const text = (item as { content?: { text?: string } }).content?.text;
    if (!text) return null;
    return <pre className="tc-text">{text}</pre>;
  }
  if (item.type === "diff") {
    const d = item as { path: string; oldText: string | null; newText: string };
    return <DiffView path={d.path} oldText={d.oldText} newText={d.newText} />;
  }
  if (item.type === "terminal") {
    const tid = (item as { terminalId: string }).terminalId;
    return (
      <button
        className="tc-term-link"
        onClick={() => setUi({ terminalOpen: true, activeTerminalId: tid })}
      >
        <IconTerminal size={13} /> terminal {tid.slice(0, 8)} — view output
      </button>
    );
  }
  return <pre className="tc-text tc-json">{summarizeRaw(item)}</pre>;
}

export default memo(function ToolCallCard({ call }: { call: ToolCallState }) {
  const [open, setOpen] = useState(false);
  const inProgress = call.status === "in_progress" || call.status === "pending";
  const expanded = open || inProgress;
  const hasBody = call.content.length > 0 || call.rawInput != null || call.rawOutput != null;

  return (
    <div className={cx("tool-card", call.status === "failed" && "failed")}>
      <button className="tc-head" onClick={() => setOpen((o) => !o)} disabled={!hasBody && !inProgress}>
        <span className="tc-kind">
          <KindIcon kind={call.kind} />
        </span>
        <StatusIcon status={call.status} />
        <span className="tc-title" title={call.title}>
          {call.title}
        </span>
        {call.locations && call.locations.length > 0 && (
          <span className="badge mono">{call.locations[0].path}</span>
        )}
        <span className="badge">{call.status}</span>
        {hasBody && (
          <IconChevron
            size={14}
            style={{ transform: expanded ? "rotate(90deg)" : undefined, transition: "transform 0.12s" }}
          />
        )}
      </button>
      {expanded && hasBody && (
        <div className="tc-body">
          {call.content.map((item, i) => (
            <ContentItem key={i} item={item} />
          ))}
          {call.rawInput != null && (
            <details>
              <summary className="hint" style={{ cursor: "pointer", color: "var(--text-2)", fontSize: 12 }}>
                input
              </summary>
              <pre className="tc-text tc-json">{summarizeRaw(call.rawInput)}</pre>
            </details>
          )}
          {call.rawOutput != null && (
            <details>
              <summary style={{ cursor: "pointer", color: "var(--text-2)", fontSize: 12 }}>output</summary>
              <pre className="tc-text tc-json">{summarizeRaw(call.rawOutput)}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
});
