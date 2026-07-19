import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { setUi, useStore } from "../state";
import type { UsageResponse } from "../types";
import { basename, formatTime, formatTokens } from "../utils";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

function DayChart({ byDay }: { byDay: UsageResponse["byDay"] }) {
  const days = useMemo(() => {
    const out: Array<{ date: string; total: number; turns: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000);
      const key = d.toISOString().slice(0, 10);
      out.push({ date: key, total: byDay[key]?.totalTokens ?? 0, turns: byDay[key]?.turns ?? 0 });
    }
    return out;
  }, [byDay]);

  const max = Math.max(1, ...days.map((d) => d.total));
  const W = 560;
  const H = 120;
  const barW = W / days.length;

  return (
    <svg className="w-full" viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label="tokens per day">
      {days.map((d, i) => {
        const h = (d.total / max) * H;
        return (
          <g key={d.date}>
            <rect
              className="fill-primary/80 transition-colors hover:fill-primary"
              x={i * barW + 3}
              y={H - h}
              width={barW - 6}
              height={Math.max(h, d.total > 0 ? 2 : 0)}
              rx={2}
            >
              <title>
                {d.date}: {d.total.toLocaleString()} tokens · {d.turns} turns
              </title>
            </rect>
            {(i === 0 || i === days.length - 1 || i % 3 === 0) && (
              <text className="fill-muted-foreground text-[10px]" x={i * barW + 3} y={H + 13}>
                {d.date.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-5 py-4 last:border-b-0">
      <h4 className="mb-2.5 text-[11px] font-medium tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

export default function UsagePanel() {
  const state = useStore();
  const [data, setData] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .usage()
      .then((u) => !cancelled && setData(u))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const active = state.activeSessionId ? state.sessions[state.activeSessionId] : null;
  const usage = active?.usage;
  const pct = usage && usage.size ? Math.min(100, Math.round((usage.used / usage.size) * 100)) : null;

  return (
    <Dialog open onOpenChange={(open) => !open && setUi({ modal: null })}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Usage</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {usage && pct !== null && (
            <Section title="Active session context">
              <div className="flex items-center gap-3">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn(
                      "block h-full rounded-full transition-[width] duration-300",
                      pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-primary" : "bg-emerald-500",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="tnum font-mono text-xs text-muted-foreground">
                  {usage.used.toLocaleString()} / {usage.size.toLocaleString()} ({pct}%)
                </span>
              </div>
            </Section>
          )}

          {error && <div className="px-5 py-4 text-sm text-muted-foreground">{error}</div>}
          {!data && !error && (
            <div className="flex flex-col gap-3 p-5">
              <Skeleton className="dc-shimmer h-16 rounded-lg" />
              <Skeleton className="dc-shimmer h-32 rounded-lg" />
              <Skeleton className="dc-shimmer h-40 rounded-lg" />
            </div>
          )}

          {data && (
            <>
              <Section title="All time">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(
                    [
                      [formatTokens(data.totals.totalTokens), "total tokens"],
                      [formatTokens(data.totals.inputTokens), "input"],
                      [formatTokens(data.totals.outputTokens), "output"],
                      [String(data.totals.turns), "turns"],
                    ] as const
                  ).map(([value, label]) => (
                    <div key={label} className="rounded-xl border border-border bg-card p-3">
                      <div className="tnum text-lg font-semibold tracking-[-0.02em]">{value}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Last 14 days">
                <DayChart byDay={data.byDay} />
              </Section>

              <Section title="Recent turns">
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                        <th className="px-3 py-2 font-medium">when</th>
                        <th className="px-3 py-2 font-medium">session</th>
                        <th className="px-3 py-2 font-medium">workspace</th>
                        <th className="px-3 py-2 text-right font-medium">input</th>
                        <th className="px-3 py-2 text-right font-medium">output</th>
                        <th className="px-3 py-2 text-right font-medium">total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.slice(0, 50).map((r, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-b-0 hover:bg-accent/40">
                          <td className="px-3 py-1.5 whitespace-nowrap">{formatTime(r.ts)}</td>
                          <td className="tnum px-3 py-1.5 font-mono">{r.sessionId.slice(0, 8)}</td>
                          <td className="tnum max-w-32 truncate px-3 py-1.5 font-mono" title={r.cwd}>
                            {basename(r.cwd)}
                          </td>
                          <td className="tnum px-3 py-1.5 text-right font-mono">{formatTokens(r.inputTokens)}</td>
                          <td className="tnum px-3 py-1.5 text-right font-mono">{formatTokens(r.outputTokens)}</td>
                          <td className="tnum px-3 py-1.5 text-right font-mono">{formatTokens(r.totalTokens)}</td>
                        </tr>
                      ))}
                      {data.recent.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                            No turns recorded yet — usage appears after the first completed prompt.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Section>
            </>
          )}

          <Section title="Cost tiers (reference)">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">tier</th>
                    <th className="px-3 py-2 font-medium">what it means</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="tnum px-3 py-1.5 font-mono">light</td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      short chats, small diffs — a few thousand tokens per turn
                    </td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="tnum px-3 py-1.5 font-mono">standard</td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      typical coding turns — tens of thousands of tokens
                    </td>
                  </tr>
                  <tr>
                    <td className="tnum px-3 py-1.5 font-mono">heavy</td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      large refactors / long agent runs — hundreds of thousands of tokens
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              approximate — see{" "}
              <a href="https://docs.devin.ai" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                docs.devin.ai
              </a>{" "}
              for current pricing.
            </p>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
