import { setUi, useStore } from "../state";
import type { SessionState } from "../state";
import { formatTokens } from "../utils";
import {
  IconAlert,
  IconChart,
  IconLogo,
  IconMenu,
  IconScroll,
  IconSettings,
  IconTerminal,
} from "../icons";
import MessageList from "./MessageList";
import Composer from "./Composer";
import ModeSwitcher from "./ModeSwitcher";
import ModelPicker from "./ModelPicker";

function Gauge({ usage }: { usage: { used: number; size: number } | null }) {
  if (!usage || !usage.size) return null;
  const pct = Math.min(100, Math.round((usage.used / usage.size) * 100));
  const cls = pct >= 90 ? "crit" : pct >= 70 ? "warn" : "";
  return (
    <span className={`gauge ${cls}`} title={`Context window: ${usage.used.toLocaleString()} / ${usage.size.toLocaleString()} tokens (${pct}%)`}>
      <span className="gauge-track">
        <span className="gauge-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="gauge-label">
        {formatTokens(usage.used)}/{formatTokens(usage.size)}
      </span>
    </span>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="logo">
        <IconLogo size={56} />
      </div>
      <h2>Devin Console</h2>
      <p>
        A browser console for the Devin CLI over the Agent Client Protocol. Create a session from the
        sidebar, or pick an existing one.
      </p>
      <div className="empty-tips">
        <div className="tip">
          <b>Slash commands</b>
          Press <kbd>Ctrl</kbd>+<kbd>K</kbd> to search sessions and insert agent commands like <kbd>/review</kbd>.
        </div>
        <div className="tip">
          <b>Attach images</b>
          Paste, drag &amp; drop, or use the paperclip — screenshots go straight into the prompt.
        </div>
        <div className="tip">
          <b>Reference files</b>
          Type <kbd>@path/to/file.ts</kbd> in your message to link a workspace file.
        </div>
        <div className="tip">
          <b>Modes &amp; models</b>
          Switch Code / Ask / Plan / Bypass and pick any model from the chat header.
        </div>
      </div>
    </div>
  );
}

function SetupBanner({ installed, authed, detail }: { installed: boolean; authed: boolean; detail: string }) {
  return (
    <div className="chat-scroll">
      <div className="setup-banner">
        <h3>
          <IconAlert size={17} />
          {!installed ? "Devin CLI not found" : "Devin CLI not logged in"}
        </h3>
        {!installed ? (
          <>
            <p>The devin CLI is not installed (or not on PATH). Install it, then restart this server.</p>
            <pre>{`# see https://docs.devin.ai/cli for installation\ndevin version`}</pre>
          </>
        ) : (
          <>
            <p>
              The devin CLI is installed but not authenticated. Log in on this machine, then reload the
              page.
            </p>
            <pre>{`devin auth login\ndevin auth status`}</pre>
          </>
        )}
        {detail && <p className="hint mono">{detail}</p>}
        <p className="hint">Sessions and chat become available once the CLI is ready.</p>
      </div>
    </div>
  );
}

export default function ChatView({ session }: { session: SessionState | null }) {
  const state = useStore();
  const meta = state.meta;
  const setupNeeded = !!meta && (!meta.devin.installed || !meta.devin.authed);
  const title = session ? session.alias || session.title || `session ${session.sessionId.slice(0, 8)}` : "Devin Console";

  return (
    <>
      <div className="chat-header">
        <button
          className="icon-btn hamburger"
          aria-label="open sidebar"
          onClick={() => setUi({ sidebarOpen: true })}
        >
          <IconMenu size={18} />
        </button>
        <div style={{ minWidth: 0 }}>
          <div className="ch-title" title={title}>
            {title}
          </div>
          {session && (
            <div className="ch-cwd mono" title={session.cwd}>
              {session.cwd}
            </div>
          )}
        </div>
        <div className="spacer" />
        {session && <ModeSwitcher session={session} />}
        {session && <ModelPicker session={session} />}
        {session && <Gauge usage={session.usage} />}
        <button
          className={`icon-btn ${state.ui.terminalOpen ? "active" : ""}`}
          title="Terminals"
          onClick={() => setUi({ terminalOpen: !state.ui.terminalOpen })}
        >
          <IconTerminal size={16} />
        </button>
        <button
          className={`icon-btn ${state.ui.logOpen ? "active" : ""}`}
          title="Agent log"
          onClick={() => setUi({ logOpen: !state.ui.logOpen })}
        >
          <IconScroll size={16} />
        </button>
        <button className="icon-btn" title="Usage" onClick={() => setUi({ modal: "usage" })}>
          <IconChart size={16} />
        </button>
        <button className="icon-btn" title="Settings" onClick={() => setUi({ modal: "settings" })}>
          <IconSettings size={16} />
        </button>
      </div>

      {setupNeeded ? (
        <SetupBanner
          installed={meta!.devin.installed}
          authed={meta!.devin.authed}
          detail={meta!.devin.detail}
        />
      ) : session ? (
        <>
          <MessageList session={session} />
          <Composer session={session} />
        </>
      ) : (
        <EmptyState />
      )}
    </>
  );
}
