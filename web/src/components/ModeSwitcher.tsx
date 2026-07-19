import { memo } from "react";
import type { SessionState } from "../state";
import { setSessionConfig } from "../state";
import { cn } from "@/lib/utils";
import { CodeIcon, ListChecksIcon, MessageCircleQuestionIcon, ShieldOffIcon } from "lucide-react";

export function modeIcon(value: string, metaIcon?: unknown, cls = "size-3.5") {
  const key = `${value} ${typeof metaIcon === "string" ? metaIcon : ""}`.toLowerCase();
  if (key.includes("ask")) return <MessageCircleQuestionIcon className={cls} />;
  if (key.includes("plan")) return <ListChecksIcon className={cls} />;
  if (key.includes("bypass")) return <ShieldOffIcon className={cls} />;
  return <CodeIcon className={cls} />;
}

export default memo(function ModeSwitcher({ session }: { session: SessionState }) {
  const modeOpt = session.configOptions.find((o) => o.category === "mode");
  if (!modeOpt || !Array.isArray(modeOpt.options) || modeOpt.options.length === 0) return null;
  const current = session.currentModeId ?? modeOpt.currentValue;

  return (
    <div
      role="tablist"
      aria-label="session mode"
      className="hidden items-center gap-0.5 rounded-full bg-secondary p-0.5 sm:flex"
    >
      {modeOpt.options.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={opt.value === current}
          title={opt.description ?? opt.name}
          className={cn(
            "flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium text-muted-foreground transition-all duration-150",
            "hover:text-foreground active:scale-[0.97]",
            opt.value === current && "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
          )}
          onClick={() => {
            if (opt.value !== current) void setSessionConfig(session.sessionId, "mode", opt.value);
          }}
        >
          {modeIcon(opt.value, opt._meta?.["cognition.ai/icon"])}
          <span className="hidden lg:inline">{opt.name}</span>
        </button>
      ))}
    </div>
  );
});
