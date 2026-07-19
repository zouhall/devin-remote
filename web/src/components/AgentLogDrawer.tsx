import { useEffect, useRef } from "react";
import { clearAgentLog, setUi, useStore } from "../state";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { XIcon } from "lucide-react";

export default function AgentLogDrawer() {
  const state = useStore();
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.agentLog.length]);

  return (
    <div className="flex h-56 flex-none flex-col border-t border-border bg-card/40">
      <div className="flex h-10 flex-none items-center gap-2 border-b border-border px-3">
        <span className="text-[13px] font-medium">Agent log</span>
        <span className="tnum rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {state.agentLog.length}
        </span>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearAgentLog}>
          Clear
        </Button>
        <TooltipIconButton
          tooltip="Close log"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="close log"
          onClick={() => setUi({ logOpen: false })}
        >
          <XIcon className="size-3.5" />
        </TooltipIconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-1.5 font-mono text-[11px] leading-relaxed" ref={bodyRef}>
        {state.agentLog.length === 0 && (
          <div className="py-4 text-center font-sans text-xs text-muted-foreground">No agent log events yet.</div>
        )}
        {state.agentLog.map((e, i) => (
          <div
            key={i}
            className={cn(
              "flex gap-2 whitespace-pre-wrap break-all text-muted-foreground",
              /warn/i.test(e.level) && "text-amber-600 dark:text-amber-400",
              /error|err/i.test(e.level) && "text-red-600 dark:text-red-400",
            )}
          >
            <span className="tnum flex-none opacity-60">
              {new Date(e.ts).toLocaleTimeString(undefined, { hour12: false })}
            </span>
            <span className="flex-none opacity-80">[{e.channel || e.sessionId.slice(0, 6)}]</span>
            <span className="min-w-0">{e.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
