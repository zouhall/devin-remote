import { useState } from "react";
import { saveSettings, setUi, showNotice, useStore } from "../state";
import { ensureNotificationPermission, notifyDesktop, soundTest } from "../sound";
import type { ThemeName } from "../types";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckIcon, XIcon } from "lucide-react";

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm">{label}</span>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={cn(
          "relative h-5.5 w-10 flex-none rounded-full transition-colors duration-200",
          on ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4.5 rounded-full bg-white shadow transition-[left] duration-200",
            on ? "left-5" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-5 py-4 last:border-b-0">
      <h4 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  options,
  current,
  onPick,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  current: T;
  onPick: (v: T) => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            className={cn(
              "h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-all duration-150",
              "hover:text-foreground active:scale-[0.97]",
              current === o.value && "bg-background text-foreground shadow-sm",
            )}
            onClick={() => onPick(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
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
      notifyDesktop("Devin Remote", "Notifications are working.");
    } else if (perm === "unsupported") {
      showNotice("this browser does not support notifications");
    } else {
      showNotice("notification permission not granted");
    }
    setTimeout(() => setTesting(false), 400);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section title="Appearance">
            <Segmented
              label="Theme"
              options={[
                { value: "dark" as ThemeName, label: "Dark" },
                { value: "light" as ThemeName, label: "Light" },
                { value: "system" as ThemeName, label: "System" },
              ]}
              current={s.theme ?? "dark"}
              onPick={(t) => void saveSettings({ theme: t })}
            />
          </Section>

          <Section title="Notifications">
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
            <div className="flex items-center justify-between gap-4 py-1.5">
              <span className="text-sm">Test sound &amp; notification</span>
              <Button size="sm" variant="outline" disabled={testing} onClick={() => void testNotify()}>
                Test
              </Button>
            </div>
          </Section>

          <Section title="Defaults for new sessions">
            <div className="flex items-center justify-between gap-4 py-1.5">
              <span className="text-sm">Default model</span>
              <input
                className="tnum h-8 w-56 rounded-md border border-input bg-background px-2.5 font-mono text-xs outline-none transition-colors focus:border-ring/60"
                placeholder="(server default)"
                defaultValue={s.defaultModel ?? ""}
                onBlur={(e) => void saveSettings({ defaultModel: e.target.value.trim() || undefined })}
              />
            </div>
            <Segmented
              label="Default mode"
              options={[
                { value: "", label: "—" },
                { value: "accept-edits", label: "Code" },
                { value: "ask", label: "Ask" },
                { value: "plan", label: "Plan" },
                { value: "bypass", label: "Bypass" },
              ]}
              current={s.defaultMode ?? ""}
              onPick={(m) => void saveSettings({ defaultMode: m || undefined })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Model accepts any model id offered by the agent, e.g. from the model picker.
            </p>
          </Section>

          <Section title="Devin CLI">
            {meta ? (
              <>
                <div className="flex items-center justify-between gap-4 py-1.5">
                  <span className="text-sm">Status</span>
                  <span className="flex items-center gap-1.5">
                    {meta.devin.installed ? (
                      <span className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckIcon className="size-3" /> installed{" "}
                        {meta.devin.version ? `· ${meta.devin.version}` : ""}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                        <XIcon className="size-3" /> not found
                      </span>
                    )}
                    {meta.devin.authed ? (
                      <span className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckIcon className="size-3" /> authenticated
                      </span>
                    ) : (
                      <span className="rounded bg-yellow-500/15 px-1.5 py-0.5 text-[11px] font-medium text-yellow-700 dark:text-yellow-400">
                        not logged in
                      </span>
                    )}
                  </span>
                </div>
                {meta.devin.detail && (
                  <p className="tnum font-mono text-xs text-muted-foreground">{meta.devin.detail}</p>
                )}
                {!meta.devin.authed && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Run <code className="rounded bg-muted px-1 py-0.5 font-mono">devin auth login</code> on this
                    machine to authenticate.
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Server meta not loaded yet.</p>
            )}
          </Section>

          <Section title="About">
            <div className="flex items-center justify-between gap-4 py-1.5">
              <span className="text-sm">App</span>
              <span className="tnum font-mono text-xs text-muted-foreground">
                Devin Remote v{meta?.app.version ?? "…"}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Data (aliases, usage, settings, uploads) lives in{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">~/.devin-remote</code> — override with{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">DEVIN_REMOTE_HOME</code>.
            </p>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
