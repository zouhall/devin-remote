import { memo, useMemo, useState } from "react";
import type { SessionState } from "../state";
import { setSessionConfig } from "../state";
import type { ConfigOptionValue } from "../types";
import { fuzzyScore } from "../utils";
import { IconCheck, IconChevron, IconImage } from "../icons";

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
  const [open, setOpen] = useState(false);
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
      <button className="btn btn-sm" onClick={() => setOpen(true)} title="Pick a model">
        <span className="mono" style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
          {currentModel?.name ?? current ?? "model"}
        </span>
        <IconChevron size={13} style={{ transform: "rotate(90deg)" }} />
      </button>
      {open && (
        <div className="modal-overlay" onMouseDown={() => setOpen(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              Model
              <span className="spacer" />
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="close">
                ✕
              </button>
            </div>
            <div className="model-search">
              <input
                className="text-input"
                autoFocus
                placeholder="Filter models…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="model-list">
              {groups.map((g) => (
                <div key={g.family}>
                  <div className="model-family">{g.label}</div>
                  {g.models.map((m) => (
                    <button
                      key={m.opt.value}
                      className={`model-item ${m.opt.value === current ? "current" : ""}`}
                      title={m.opt.description ?? m.opt.value}
                      onClick={() => {
                        setOpen(false);
                        if (m.opt.value !== current) void setSessionConfig(session.sessionId, "model", m.opt.value);
                      }}
                    >
                      <span style={{ width: 16, flex: "none", display: "inline-flex" }}>
                        {m.opt.value === current && <IconCheck size={14} />}
                      </span>
                      <span className="mi-name">{m.opt.name}</span>
                      <span className="mi-badges">
                        {m.adaptive && <span className="badge badge-accent">adaptive · recommended</span>}
                        {m.thinking && <span className="badge">think {m.thinking}</span>}
                        {m.speed && <span className="badge badge-yellow">{m.speed}</span>}
                        {m.supportsImages && (
                          <span className="badge badge-green" title="supports image input">
                            <IconImage size={11} />
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
              {groups.length === 0 && <div className="palette-empty">No models match</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
});
