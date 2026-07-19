import { memo } from "react";
import { diffLines } from "../utils";

interface DiffViewProps {
  path: string;
  oldText: string | null;
  newText: string;
}

const MAX_RENDERED_LINES = 800;

export default memo(function DiffView({ path, oldText, newText }: DiffViewProps) {
  const lines = diffLines(oldText ?? "", newText ?? "");
  const adds = lines.filter((l) => l.type === "add").length;
  const dels = lines.filter((l) => l.type === "del").length;
  const truncated = lines.length > MAX_RENDERED_LINES;
  const shown = truncated ? lines.slice(0, MAX_RENDERED_LINES) : lines;

  return (
    <div className="diff">
      <div className="diff-head">
        <span className="diff-path" title={path}>
          {path}
        </span>
        <span className="badge badge-green">+{adds}</span>
        <span className="badge badge-red">−{dels}</span>
      </div>
      <div className="diff-body">
        {shown.map((l, i) => (
          <div key={i} className={`dl ${l.type}`}>
            <span className="dl-sign">{l.type === "add" ? "+" : l.type === "del" ? "−" : " "}</span>
            <span className="dl-text">{l.text || " "}</span>
          </div>
        ))}
        {truncated && (
          <div className="dl">
            <span className="dl-sign" />
            <span className="dl-text">… {lines.length - shown.length} more lines truncated …</span>
          </div>
        )}
      </div>
    </div>
  );
});
