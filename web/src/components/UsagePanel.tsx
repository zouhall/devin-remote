import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { setUi, useStore } from "../state";
import type { UsageResponse } from "../types";
import { basename, formatTime, formatTokens } from "../utils";
import { IconX } from "../icons";

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
    <svg className="usage-chart" viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label="tokens per day">
      {days.map((d, i) => {
        const h = (d.total / max) * H;
        return (
          <g key={d.date}>
            <rect
              className="bar"
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
              <text className="bar-label" x={i * barW + 3} y={H + 13}>
                {d.date.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
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
    <div className="modal-overlay" onMouseDown={() => setUi({ modal: null })}>
      <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          Usage
          <span className="spacer" />
          <button className="icon-btn" aria-label="close" onClick={() => setUi({ modal: null })}>
            <IconX size={16} />
          </button>
        </div>
        <div className="modal-body">
          {usage && pct !== null && (
            <div className="modal-section">
              <h4>Active session context</h4>
              <div className="row">
                <span className={`gauge ${pct >= 90 ? "crit" : pct >= 70 ? "warn" : ""}`} style={{ flex: 1 }}>
                  <span className="gauge-track" style={{ flex: 1 }}>
                    <span className="gauge-fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="gauge-label">
                    {usage.used.toLocaleString()} / {usage.size.toLocaleString()} ({pct}%)
                  </span>
                </span>
              </div>
            </div>
          )}

          {error && <div className="hint">{error}</div>}
          {!data && !error && (
            <div className="loading-row">
              <span className="spinner" /> Loading usage…
            </div>
          )}

          {data && (
            <>
              <div className="modal-section">
                <h4>All time</h4>
                <div className="usage-cards">
                  <div className="usage-card">
                    <div className="uc-value">{formatTokens(data.totals.totalTokens)}</div>
                    <div className="uc-label">total tokens</div>
                  </div>
                  <div className="usage-card">
                    <div className="uc-value">{formatTokens(data.totals.inputTokens)}</div>
                    <div className="uc-label">input</div>
                  </div>
                  <div className="usage-card">
                    <div className="uc-value">{formatTokens(data.totals.outputTokens)}</div>
                    <div className="uc-label">output</div>
                  </div>
                  <div className="usage-card">
                    <div className="uc-value">{data.totals.turns}</div>
                    <div className="uc-label">turns</div>
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <h4>Last 14 days</h4>
                <DayChart byDay={data.byDay} />
              </div>

              <div className="modal-section">
                <h4>Recent turns</h4>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>when</th>
                        <th>session</th>
                        <th>workspace</th>
                        <th>input</th>
                        <th>output</th>
                        <th>total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.slice(0, 50).map((r, i) => (
                        <tr key={i}>
                          <td>{formatTime(r.ts)}</td>
                          <td className="mono">{r.sessionId.slice(0, 8)}</td>
                          <td className="mono" title={r.cwd}>
                            {basename(r.cwd)}
                          </td>
                          <td className="mono">{formatTokens(r.inputTokens)}</td>
                          <td className="mono">{formatTokens(r.outputTokens)}</td>
                          <td className="mono">{formatTokens(r.totalTokens)}</td>
                        </tr>
                      ))}
                      {data.recent.length === 0 && (
                        <tr>
                          <td colSpan={6} className="hint">
                            No turns recorded yet — usage appears after the first completed prompt.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          <div className="modal-section">
            <h4>Cost tiers (reference)</h4>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>tier</th>
                    <th>what it means</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="mono">light</td>
                    <td>short chats, small diffs — a few thousand tokens per turn</td>
                  </tr>
                  <tr>
                    <td className="mono">standard</td>
                    <td>typical coding turns — tens of thousands of tokens</td>
                  </tr>
                  <tr>
                    <td className="mono">heavy</td>
                    <td>large refactors / long agent runs — hundreds of thousands of tokens</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="hint">
              approximate — see{" "}
              <a href="https://docs.devin.ai" target="_blank" rel="noreferrer">
                docs.devin.ai
              </a>{" "}
              for current pricing.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
