import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { getTerminalOutput, setUi, useStore } from "../state";
import { IconTerminal, IconX } from "../icons";

const XTERM_THEME = {
  background: "#0b0b0f",
  foreground: "#d6d6de",
  cursor: "#6ea8fe",
  selectionBackground: "#2a3a55",
  black: "#1c1c24",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#facc15",
  blue: "#6ea8fe",
  magenta: "#a78bfa",
  cyan: "#22d3ee",
  white: "#e8e8ee",
  brightBlack: "#55555f",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fde047",
  brightBlue: "#93c5fd",
  brightMagenta: "#c4b5fd",
  brightCyan: "#67e8f9",
  brightWhite: "#ffffff",
};

function XTermView({ id, version, resetSeq }: { id: string; version: number; resetSeq: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const writtenRef = useRef(0);
  const resetRef = useRef(resetSeq);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const term = new Terminal({
      fontSize: 12,
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      theme: XTERM_THEME,
      scrollback: 10000,
      disableStdin: true,
      convertEol: false, // output already contains \r\n / ANSI — pass through
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    termRef.current = term;
    writtenRef.current = 0;
    const existing = getTerminalOutput(id);
    if (existing) {
      term.write(existing);
      writtenRef.current = existing.length;
    }
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* disposed */
      }
    });
    ro.observe(host);
    return () => {
      ro.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, [id]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    if (resetRef.current !== resetSeq) {
      // Server-side buffer was trimmed — restart from the trimmed snapshot.
      resetRef.current = resetSeq;
      term.reset();
      writtenRef.current = 0;
    }
    const data = getTerminalOutput(id);
    if (data.length > writtenRef.current) {
      term.write(data.slice(writtenRef.current));
      writtenRef.current = data.length;
      term.scrollToBottom();
    }
  }, [id, version, resetSeq]);

  return <div className="xterm-host" ref={hostRef} />;
}

export default function TerminalPanel() {
  const state = useStore();
  const activeId = state.activeSessionId;
  const all = Object.values(state.terminals);
  const forSession = activeId ? all.filter((t) => t.sessionId === activeId) : all;
  const shown = forSession.length > 0 ? forSession : all;

  const selected =
    (state.ui.activeTerminalId && state.terminals[state.ui.activeTerminalId]) ||
    shown[shown.length - 1] ||
    null;

  return (
    <div className="drawer">
      <div className="drawer-head">
        <IconTerminal size={14} />
        <div className="term-tabs">
          {shown.map((t) => (
            <button
              key={t.id}
              className={`term-tab ${selected?.id === t.id ? "active" : ""}`}
              onClick={() => setUi({ activeTerminalId: t.id })}
            >
              {t.id.slice(0, 8)}
              {t.exitCode !== null && (
                <span className={`badge ${t.exitCode === 0 ? "badge-green" : "badge-red"}`}>
                  exit {t.exitCode}
                </span>
              )}
            </button>
          ))}
          {shown.length === 0 && <span className="hint">No terminals yet — they appear when Devin runs commands.</span>}
        </div>
        <span className="spacer" />
        <button className="icon-btn" aria-label="close terminals" onClick={() => setUi({ terminalOpen: false })}>
          <IconX size={15} />
        </button>
      </div>
      <div className="drawer-body">
        {selected && <XTermView id={selected.id} version={selected.version} resetSeq={selected.resetSeq} />}
      </div>
    </div>
  );
}
