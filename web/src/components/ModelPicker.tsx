import { memo, useMemo, useState } from "react";
import type { SessionState } from "../state";
import { setSessionConfig, setUi, useStore } from "../state";
import type { ConfigOptionValue } from "../types";
import { fuzzyScore } from "../utils";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CheckIcon, ChevronDownIcon, ImageIcon, SearchIcon } from "lucide-react";

interface ParsedModel {
  opt: ConfigOptionValue;
  family: string;
  thinking: string | null;
  speed: string | null;
  supportsImages: boolean;
  adaptive: boolean;
}

const THINK_LEVELS = ["none", "low", "medium", "high", "xhigh", "max"] as const;

/** Split a model value into family + thinking-level + speed variant. */
export function parseModel(opt: ConfigOptionValue): ParsedModel {
  let rest = opt.value;
  let speed: string | null = null;
  let thinking: string | null = null;

  const speedMatch = rest.match(/-(fast|priority)$/);
  if (speedMatch) {
    speed = speedMatch[1];
    rest = rest.slice(0, -speedMatch[0].length);
  }
  // e.g. "claude-opus-4-5-think-high", "gpt-5.1-codex-max", "…-think-none"
  const thinkMatch = rest.match(/-(?:think-)?(none|low|medium|high|xhigh|max)$/i);
  if (thinkMatch && THINK_LEVELS.includes(thinkMatch[1].toLowerCase() as (typeof THINK_LEVELS)[number])) {
    thinking = thinkMatch[1].toLowerCase();
    rest = rest.slice(0, -thinkMatch[0].length);
  }
  const meta = opt._meta ?? {};
  return {
    opt,
    family: rest || opt.value,
    thinking,
    speed,
    supportsImages: meta["cognition.ai/supportsImages"] === true,
    adaptive: /adaptive/i.test(opt.value) || /adaptive/i.test(opt.name),
  };
}

function familyLabel(family: string, models: ParsedModel[]): string {
  // Prefer the shared prefix of display names; fall back to the raw family token.
  const names = models.map((m) => m.opt.name.replace(/\s*[(-].*$/, "").trim());
  const first = names[0];
  if (first && names.every((n) => n === first)) return first;
  return family
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export default memo(function ModelPicker({ session }: { session: SessionState }) {
  const open = useStore().ui.modelPickerOpen;
  const setOpen = (v: boolean) => setUi({ modelPickerOpen: v });
  const [query, setQuery] = useState("");
  const modelOpt = session.configOptions.find((o) => o.category === "model");
  const current = modelOpt?.currentValue ?? "";

  const groups = useMemo(() => {
    if (!modelOpt?.options) return [];
    const parsed = modelOpt.options.map(parseModel);
    const filtered = query.trim()
      ? parsed.filter(
          (m) =>
            fuzzyScore(query, m.opt.name) !== null ||
            fuzzyScore(query, m.opt.value) !== null ||
            fuzzyScore(query, m.family) !== null,
        )
      : parsed;
    const byFamily = new Map<string, ParsedModel[]>();
    for (const m of filtered) {
      if (!byFamily.has(m.family)) byFamily.set(m.family, []);
      byFamily.get(m.family)!.push(m);
    }
    return [...byFamily.entries()].map(([family, models]) => ({
      family,
      label: familyLabel(family, models),
      models,
    }));
  }, [modelOpt, query]);

  if (!modelOpt || !modelOpt.options?.length) return null;

  const currentModel = modelOpt.options.find((o) => o.value === current);

  return (
    <>
      <button
        className="flex h-8 max-w-44 items-center gap-1 rounded-md px-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-[0.98]"
        onClick={() => setOpen(true)}
        title="Pick a model"
      >
        <span className="truncate">{currentModel?.name ?? current ?? "model"}</span>
        <ChevronDownIcon className="size-3 flex-none opacity-60" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl p-0" hideClose={false}>
          <DialogHeader>
            <DialogTitle>Model</DialogTitle>
          </DialogHeader>
          <div className="border-b border-border p-3">
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                className="h-9 bg-background pl-8 text-sm"
                placeholder="Filter models…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-[55vh] overflow-y-auto p-1.5">
            {groups.map((g) => (
              <div key={g.family} className="mb-1">
                <div className="px-2.5 pb-1 pt-2 text-[11px] font-medium tracking-wide text-muted-foreground">
                  {g.label}
                </div>
                {g.models.map((m) => (
                  <button
                    key={m.opt.value}
                    title={m.opt.description ?? m.opt.value}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-100",
                      "hover:bg-accent active:scale-[0.99]",
                      m.opt.value === current && "bg-accent/60",
                    )}
                    onClick={() => {
                      setOpen(false);
                      if (m.opt.value !== current) void setSessionConfig(session.sessionId, "model", m.opt.value);
                    }}
                  >
                    <span className="flex w-4 flex-none justify-center">
                      {m.opt.value === current && <CheckIcon className="size-3.5 text-primary" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{m.opt.name}</span>
                    <span className="flex flex-none items-center gap-1">
                      {m.adaptive && (
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          adaptive · recommended
                        </span>
                      )}
                      {m.thinking && (
                        <span className="tnum rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          think {m.thinking}
                        </span>
                      )}
                      {m.speed && (
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {m.speed}
                        </span>
                      )}
                      {m.supportsImages && (
                        <span
                          className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400"
                          title="supports image input"
                        >
                          <ImageIcon className="size-3" />
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {groups.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">No models match</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});
