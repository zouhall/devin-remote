// Collapsible plan checklist — session-level panel above the composer.

import { memo, useState, type FC } from "react";
import {
  CheckIcon,
  ChevronRightIcon,
  CircleIcon,
  ListTodoIcon,
  Loader2Icon,
} from "lucide-react";
import { useStore } from "../state";
import { cn } from "@/lib/utils";

export const PlanPanel: FC = memo(function PlanPanel() {
  const state = useStore();
  const session = state.activeSessionId ? state.sessions[state.activeSessionId] : null;
  const plan = session?.plan;
  const [open, setOpen] = useState(true);

  if (!plan || plan.length === 0) return null;
  const done = plan.filter((e) => e.status === "completed").length;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/70">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-accent/50"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ListTodoIcon className="size-3.5 text-primary" />
        Plan
        <span className="tnum text-xs text-muted-foreground">
          {done}/{plan.length} done
        </span>
        <span className="flex-1" />
        <ChevronRightIcon
          className={cn("size-3.5 text-muted-foreground transition-transform duration-150", open && "rotate-90")}
        />
      </button>
      {open && (
        <ul className="flex flex-col gap-1 border-t border-border px-3 py-2">
          {plan.map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px]">
              <span className="mt-0.5 flex-none">
                {e.status === "completed" ? (
                  <CheckIcon className="size-3.5 text-emerald-500" />
                ) : e.status === "in_progress" ? (
                  <Loader2Icon className="size-3.5 animate-spin text-primary" />
                ) : (
                  <CircleIcon className="size-3 text-muted-foreground/60" />
                )}
              </span>
              <span className={cn(e.status === "completed" && "text-muted-foreground line-through")}>
                {e.content}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
