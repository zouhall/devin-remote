// Tiny Web Audio beeps + desktop notifications. No assets required.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function beep(freq = 880, duration = 0.12, type: OscillatorType = "sine", gain = 0.05): void {
  const ac = audio();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
    osc.connect(g).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + duration + 0.02);
  } catch {
    /* audio not available */
  }
}

export const soundComplete = (): void => {
  beep(660, 0.1);
  setTimeout(() => beep(990, 0.14), 110);
};

export const soundNotify = (): void => {
  beep(440, 0.12, "triangle", 0.07);
  setTimeout(() => beep(440, 0.1, "triangle", 0.05), 160);
};

/** Test chime used by the settings modal. */
export const soundTest = soundComplete;

export function notifyDesktop(title: string, body: string): void {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/favicon.ico" });
  } catch {
    /* some platforms need a ServiceWorker — ignore */
  }
}

export async function ensureNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "default") {
    try {
      return await Notification.requestPermission();
    } catch {
      return Notification.permission;
    }
  }
  return Notification.permission;
}
