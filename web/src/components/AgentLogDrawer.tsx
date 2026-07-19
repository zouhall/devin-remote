import { useEffect, useRef } from "react";
import { clearAgentLog, setUi, useStore } from "../state";
import { cx } from "../utils";
import { IconX } from "../icons";

export default function AgentLogDrawer() {
  const state = useStore();
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.agentLog.length]);

  return (
    <div className="drawer">
      <div className="drawer-head">
        <span>Agent log</span>
        <span className="badge">{state.agentLog.length}</span>
        <span className="spacer" />
        <button className="btn btn-sm btn-ghost" onClick={clearAgentLog}>
          Clear
        </button>
        <button className="icon-btn" aria-label="close log" onClick={() => setUi({ logOpen: false })}>
          <IconX size={15} />
        </button>
      </div>
      <div className="log-body" ref={bodyRef}>
        {state.agentLog.length === 0 && <div className="hint">No agent log events yet.</div>}
        {state.agentLog.map((e, i) => (
          <div key={i} className={cx("log-line", /warn/i.test(e.level) && "warn", /error|err/i.test(e.level) && "error")}>
            <span className="log-ts">
              {new Date(e.ts).toLocaleTimeString(undefined, { hour12: false })}
            </span>
            <span className="log-channel">[{e.channel || e.sessionId.slice(0, 6)}]</span>
            <span className="log-msg">{e.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
