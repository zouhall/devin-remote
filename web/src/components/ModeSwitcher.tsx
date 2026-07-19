import { memo } from "react";
import type { SessionState } from "../state";
import { setSessionConfig } from "../state";
import { IconAsk, IconCode, IconPlan, IconZap } from "../icons";

function modeIcon(value: string, metaIcon: unknown) {
  const key = `${value} ${typeof metaIcon === "string" ? metaIcon : ""}`.toLowerCase();
  if (key.includes("ask")) return <IconAsk size={13} />;
  if (key.includes("plan")) return <IconPlan size={13} />;
  if (key.includes("bypass")) return <IconZap size={13} />;
  return <IconCode size={13} />;
}

export default memo(function ModeSwitcher({ session }: { session: SessionState }) {
  const modeOpt = session.configOptions.find((o) => o.category === "mode");
  if (!modeOpt || !Array.isArray(modeOpt.options) || modeOpt.options.length === 0) return null;
  const current = session.currentModeId ?? modeOpt.currentValue;

  return (
    <div className="segmented" role="tablist" aria-label="session mode">
      {modeOpt.options.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={opt.value === current}
          className={opt.value === current ? "active" : ""}
          title={opt.description ?? opt.name}
          onClick={() => {
            if (opt.value !== current) void setSessionConfig(session.sessionId, "mode", opt.value);
          }}
        >
          {modeIcon(opt.value, opt._meta?.["cognition.ai/icon"])}
          {opt.name}
        </button>
      ))}
    </div>
  );
});
