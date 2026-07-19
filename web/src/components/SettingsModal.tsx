import { useState } from "react";
import { saveSettings, setUi, showNotice, useStore } from "../state";
import { ensureNotificationPermission, notifyDesktop, soundTest } from "../sound";
import type { ThemeName } from "../types";
import { IconCheck, IconX } from "../icons";

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="row">
      <label>{label}</label>
      <button
        className={`switch ${on ? "on" : ""}`}
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
      />
    </div>
  );
}

export default function SettingsModal() {
  const state = useStore();
  const s = state.settings;
  const meta = state.meta;
  const [testing, setTesting] = useState(false);

  const close = () => setUi({ modal: null });

  const testNotify = async () => {
    setTesting(true);
    soundTest();
    const perm = await ensureNotificationPermission();
    if (perm === "granted") {
      notifyDesktop("Devin Console", "Notifications are working.");
    } else if (perm === "unsupported") {
      showNotice("this browser does not support notifications");
    } else {
      showNotice("notification permission not granted");
    }
    setTimeout(() => setTesting(false), 400);
  };

  return (
    <div className="modal-overlay" onMouseDown={close}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          Settings
          <span className="spacer" />
          <button className="icon-btn" aria-label="close" onClick={close}>
            <IconX size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-section">
            <h4>Appearance</h4>
            <div className="row">
              <label>Theme</label>
              <div className="segmented">
                {(["dark", "light", "system"] as ThemeName[]).map((t) => (
                  <button
                    key={t}
                    className={s.theme === t ? "active" : ""}
                    onClick={() => void saveSettings({ theme: t })}
                  >
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="modal-section">
            <h4>Notifications</h4>
            <Toggle
              label="Sound when a turn completes"
              on={!!s.soundComplete}
              onChange={(v) => void saveSettings({ soundComplete: v })}
            />
            <Toggle
              label="Sound when permission is requested"
              on={!!s.soundNotify}
              onChange={(v) => void saveSettings({ soundNotify: v })}
            />
            <Toggle
              label="Desktop notification when tab is hidden"
              on={!!s.desktopNotify}
              onChange={(v) => {
                if (v) void ensureNotificationPermission();
                void saveSettings({ desktopNotify: v });
              }}
            />
            <div className="row">
              <label>Test sound &amp; notification</label>
              <button className="btn btn-sm" disabled={testing} onClick={() => void testNotify()}>
                Test
              </button>
            </div>
          </div>

          <div className="modal-section">
            <h4>Defaults for new sessions</h4>
            <div className="row">
              <label>Default model</label>
              <input
                className="text-input mono"
                style={{ maxWidth: 260 }}
                placeholder="(server default)"
                defaultValue={s.defaultModel ?? ""}
                onBlur={(e) => void saveSettings({ defaultModel: e.target.value.trim() || undefined })}
              />
            </div>
            <div className="row">
              <label>Default mode</label>
              <div className="segmented">
                {["", "accept-edits", "ask", "plan", "bypass"].map((m) => (
                  <button
                    key={m || "none"}
                    className={(s.defaultMode ?? "") === m ? "active" : ""}
                    onClick={() => void saveSettings({ defaultMode: m || undefined })}
                  >
                    {m === "" ? "—" : m === "accept-edits" ? "Code" : m[0].toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="hint">Model accepts any model id offered by the agent, e.g. from the model picker.</div>
          </div>

          <div className="modal-section">
            <h4>Devin CLI</h4>
            {meta ? (
              <>
                <div className="row">
                  <label>Status</label>
                  {meta.devin.installed ? (
                    <span className="badge badge-green">
                      <IconCheck size={11} /> installed {meta.devin.version ? `· ${meta.devin.version}` : ""}
                    </span>
                  ) : (
                    <span className="badge badge-red">
                      <IconX size={11} /> not found
                    </span>
                  )}
                  {meta.devin.authed ? (
                    <span className="badge badge-green">
                      <IconCheck size={11} /> authenticated
                    </span>
                  ) : (
                    <span className="badge badge-yellow">not logged in</span>
                  )}
                </div>
                {meta.devin.detail && <div className="hint mono">{meta.devin.detail}</div>}
                {!meta.devin.authed && (
                  <div className="hint">
                    Run <code>devin auth login</code> on this machine to authenticate.
                  </div>
                )}
              </>
            ) : (
              <div className="hint">Server meta not loaded yet.</div>
            )}
          </div>

          <div className="modal-section">
            <h4>About</h4>
            <div className="row">
              <label>App</label>
              <span className="mono">
                {meta?.app.name ?? "devin-console"} v{meta?.app.version ?? "…"}
              </span>
            </div>
            <div className="hint">
              Data (aliases, usage, settings, uploads) lives in <code>~/.devin-console</code> — override with{" "}
              <code>DEVIN_CONSOLE_HOME</code>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
