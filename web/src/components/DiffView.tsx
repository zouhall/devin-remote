import { memo } from "react";
import { diffLines } from "../utils";
import { cn } from "@/lib/utils";

interface DiffViewProps {
  path: string;
  oldText: string | null;
  newText: string;
}

const MAX_RENDERED_LINES = 800;

export default memo(function DiffView({ path, oldText, newText }: DiffViewProps) {
  const lines = diffLines(oldText ?? "", newText ?? "");
  const adds = lines.filter((l) => l.type === "add").length;
  const dels = lines.filter((l) => l.type === "del").length;
  const truncated = lines.length > MAX_RENDERED_LINES;
  const shown = truncated ? lines.slice(0, MAX_RENDERED_LINES) : lines;

  return (
    <div className="overflow-hidden rounded-lg border border-border text-xs">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
        <span className="tnum min-w-0 flex-1 truncate font-mono text-muted-foreground" title={path}>
          {path}
        </span>
        <span className="tnum rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          +{adds}
        </span>
        <span className="tnum rounded bg-red-500/15 px-1.5 py-0.5 font-mono text-[11px] font-medium text-red-600 dark:text-red-400">
          −{dels}
        </span>
      </div>
      <div className="max-h-96 overflow-auto bg-background py-1 font-mono leading-relaxed">
        {shown.map((l, i) => (
          <div
            key={i}
            className={cn(
              "flex whitespace-pre-wrap break-all px-3",
              l.type === "add" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
              l.type === "del" && "bg-red-500/10 text-red-700 dark:text-red-300",
            )}
          >
            <span className="w-4 flex-none select-none opacity-60">
              {l.type === "add" ? "+" : l.type === "del" ? "−" : " "}
            </span>
            <span>{l.text || " "}</span>
          </div>
        ))}
        {truncated && (
          <div className="px-3 py-1 text-muted-foreground">
            … {lines.length - shown.length} more lines truncated …
          </div>
        )}
      </div>
    </div>
  );
});
