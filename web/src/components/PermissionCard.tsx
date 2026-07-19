import { memo, useState } from "react";
import type { PendingPermission } from "../state";
import { resolvePermission } from "../state";
import { IconShield } from "../icons";

function summarize(raw: unknown): string {
  if (raw == null) return "";
  try {
    const s = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
    return s.length > 1500 ? s.slice(0, 1500) + "\n…" : s;
  } catch {
    return String(raw);
  }
}

export default memo(function PermissionCard({ perm }: { perm: PendingPermission }) {
  const [busy, setBusy] = useState(false);
  const detail = summarize(perm.toolCall?.rawInput);

  const choose = async (optionId: string | null) => {
    if (busy) return;
    setBusy(true);
    await resolvePermission(perm.requestId, optionId);
  };

  return (
    <div className="perm-card">
      <div className="perm-title">
        <IconShield size={15} />
        Permission requested — {String(perm.toolCall?.title ?? perm.toolCall?.kind ?? "tool call")}
      </div>
      {detail && <pre className="perm-detail">{detail}</pre>}
      <div className="perm-actions">
        {perm.options.map((o) => (
          <button
            key={o.optionId}
            className={`btn ${o.kind}`}
            disabled={busy}
            onClick={() => void choose(o.optionId)}
          >
            {o.name}
          </button>
        ))}
        <button className="btn btn-danger" disabled={busy} onClick={() => void choose(null)}>
          Dismiss
        </button>
      </div>
    </div>
  );
});
