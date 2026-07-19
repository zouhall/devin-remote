import { useEffect } from "react";
import {
  refreshMeta,
  refreshSessions,
  setUi,
  useStore,
} from "./state";
import { startWs } from "./ws";
import Sidebar from "./components/Sidebar";
import ChatView from "./components/ChatView";
import TerminalPanel from "./components/TerminalPanel";
import AgentLogDrawer from "./components/AgentLogDrawer";
import SettingsModal from "./components/SettingsModal";
import UsagePanel from "./components/UsagePanel";
import CommandPalette from "./components/CommandPalette";

function applyTheme(theme: "dark" | "light" | "system"): void {
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : theme;
  document.documentElement.dataset.theme = resolved;
}

export default function App() {
  const state = useStore();

  useEffect(() => {
    void refreshMeta();
    void refreshSessions();
    startWs();
  }, []);

  useEffect(() => {
    applyTheme(state.settings.theme ?? "dark");
    if (state.settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [state.settings.theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setUi({ modal: state.ui.modal === "palette" ? null : "palette" });
      } else if (e.key === "Escape" && state.ui.modal) {
        setUi({ modal: null });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.ui.modal]);

  const active = state.activeSessionId ? state.sessions[state.activeSessionId] ?? null : null;

  return (
    <div className="app">
      {state.ui.sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="close sidebar"
          onClick={() => setUi({ sidebarOpen: false })}
        />
      )}
      <Sidebar />
      <div className="main">
        <ChatView session={active} />
        {state.ui.terminalOpen && <TerminalPanel />}
        {state.ui.logOpen && <AgentLogDrawer />}
      </div>
      {state.ui.modal === "settings" && <SettingsModal />}
      {state.ui.modal === "usage" && <UsagePanel />}
      {state.ui.modal === "palette" && <CommandPalette />}
      {state.notice && <div className="toast">{state.notice}</div>}
    </div>
  );
}
