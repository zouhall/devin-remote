// Rich tool-call card: the assistant-ui part carries ids/args, the rich state
// (status, diffs, locations, terminals, timing) comes from our store.

import { memo, useState, type FC } from "react";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import {
  BookOpenIcon,
  BrainIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleIcon,
  FileEditIcon,
  GlobeIcon,
  Loader2Icon,
  PlayIcon,
  SearchIcon,
  SquareTerminalIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import type { ToolCallState } from "../state";
import { setUi, useStore } from "../state";
import type { ToolCallContent } from "../types";
import DiffView from "./DiffView";
import { cn } from "@/lib/utils";

function KindIcon({ kind }: { kind: string }) {
  const k = (kind || "").toLowerCase();
  const cls = "size-3.5";
  if (k.includes("edit") || k.includes("write")) return <FileEditIcon className={cls} />;
  if (k.includes("exec") || k.includes("bash") || k.includes("shell") || k.includes("command"))
    return <PlayIcon className={cls} />;
  if (k.includes("read")) return <BookOpenIcon className={cls} />;
  if (k.includes("search") || k.includes("grep") || k.includes("glob")) return <SearchIcon className={cls} />;
  if (k.includes("fetch") || k.includes("web") || k.includes("http")) return <GlobeIcon className={cls} />;
  if (k.includes("think") || k.includes("plan")) return <BrainIcon className={cls} />;
  return <WrenchIcon className={cls} />;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckIcon className="size-3.5 text-emerald-500" />;
  if (status === "failed") return <XIcon className="size-3.5 text-red-500" />;
  if (status === "in_progress" || status === "pending")
    return <Loader2Icon className="size-3.5 animate-spin text-primary" />;
  return <CircleIcon className="size-3 text-muted-foreground" />;
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

function durationLabel(call: ToolCallState): string | null {
  if (call.finishedAt == null) return null;
  const ms = call.finishedAt - call.startedAt;
  if (ms < 400) return null;
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;
}

function RawDetails({ label, raw }: { label: string; raw: unknown }) {
  if (raw == null) return null;
  return (
    <details className="group/raw">
      <summary className="cursor-pointer select-none text-[11px] text-muted-foreground transition-colors hover:text-foreground">
        {label}
      </summary>
      <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {summarizeRaw(raw)}
      </pre>
    </details>
  );
}

function ContentItem({ item }: { item: ToolCallContent }) {
  if (item.type === "content") {
    const text = (item as { content?: { text?: string } }).content?.text;
    if (!text) return null;
    return (
      <pre className="max-h-64 overflow-auto rounded-md bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-foreground/90">
        {text}
      </pre>
    );
  }
  if (item.type === "diff") {
    const d = item as { path: string; oldText: string | null; newText: string };
    return <DiffView path={d.path} oldText={d.oldText} newText={d.newText} />;
  }
  if (item.type === "terminal") {
    const tid = (item as { terminalId: string }).terminalId;
    return (
      <button
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.98]"
        onClick={() => setUi({ terminalOpen: true, activeTerminalId: tid })}
      >
        <SquareTerminalIcon className="size-3.5" />
        terminal {tid.slice(0, 8)} — view output
      </button>
    );
  }
  return (
    <pre className="max-h-64 overflow-auto rounded-md bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
      {summarizeRaw(item)}
    </pre>
  );
}

const ToolCard: FC<{ call: ToolCallState }> = ({ call }) => {
  const [open, setOpen] = useState(false);
  const inProgress = call.status === "in_progress" || call.status === "pending";
  const expanded = open || inProgress;
  const hasBody = call.content.length > 0 || call.rawInput != null || call.rawOutput != null;
  const duration = durationLabel(call);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card/60 transition-colors",
        call.status === "failed" && "border-red-500/40",
      )}
    >
      <button
        className={cn(
          "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] transition-colors",
          hasBody && "hover:bg-accent/50 cursor-pointer",
        )}
        onClick={() => hasBody && setOpen((o) => !o)}
        disabled={!hasBody && !inProgress}
      >
        <span className="text-muted-foreground">
          <KindIcon kind={call.kind} />
        </span>
        <StatusIcon status={call.status} />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground/90" title={call.title}>
          {call.title}
        </span>
        {call.locations && call.locations.length > 0 && (
          <span className="tnum hidden max-w-40 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline">
            {call.locations[0].path}
          </span>
        )}
        {duration && <span className="tnum font-mono text-[11px] text-muted-foreground">{duration}</span>}
        {hasBody && (
          <ChevronRightIcon
            className={cn(
              "size-3.5 text-muted-foreground transition-transform duration-150",
              expanded && "rotate-90",
            )}
          />
        )}
      </button>
      {expanded && hasBody && (
        <div className="flex flex-col gap-2 border-t border-border px-2.5 py-2">
          {call.locations && call.locations.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {call.locations.map((loc, i) => (
                <span
                  key={i}
                  className="tnum rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                >
                  {loc.path}
                  {loc.line != null ? `:${loc.line}` : ""}
                </span>
              ))}
            </div>
          )}
          {call.content.map((item, i) => (
            <ContentItem key={i} item={item} />
          ))}
          <RawDetails label="input" raw={call.rawInput} />
          <RawDetails label="output" raw={call.rawOutput} />
        </div>
      )}
    </div>
  );
};

/** assistant-ui tool-call renderer — pulls rich state from our store by id. */
export const DevinToolFallback = memo(function DevinToolFallback(props: ToolCallMessagePartProps) {
  const state = useStore();
  const active = state.activeSessionId ? state.sessions[state.activeSessionId] : null;
  const call = active?.toolCalls[props.toolCallId] ?? null;

  if (!call) {
    // Store lost the call (shouldn't happen) — render a minimal card from props.
    return (
      <div className="rounded-lg border border-border bg-card/60 px-2.5 py-1.5 text-[13px] text-muted-foreground">
        {props.toolName}
      </div>
    );
  }
  return <ToolCard call={call} />;
});
