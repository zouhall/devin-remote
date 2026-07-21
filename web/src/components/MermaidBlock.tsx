import { memo, useEffect, useState } from "react";
import type { SyntaxHighlighterProps } from "@assistant-ui/react-markdown";
import type mermaidType from "mermaid";

// Mermaid is heavy — load it on demand the first time a diagram appears.
let mermaidPromise: Promise<typeof mermaidType> | null = null;

function loadMermaid(): Promise<typeof mermaidType> {
  mermaidPromise ??= import("mermaid").then((m) => {
    m.default.initialize({
      startOnLoad: false,
      theme: "neutral",
      securityLevel: "strict",
      suppressErrorRendering: true,
      fontFamily: "inherit",
    });
    return m.default;
  });
  return mermaidPromise;
}

let mermaidSeq = 0;

/** Renders a fenced ```mermaid block as an inline SVG diagram. */
export const MermaidBlock = memo(function MermaidBlock({ code }: SyntaxHighlighterProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void loadMermaid().then((mermaid) => {
        if (cancelled) return;
        const id = `mmd-${++mermaidSeq}`;
        // mermaid.render can leave scratch nodes (#id / #d{id}) in the DOM on
        // failure. Clean them up ONLY when the render didn't complete: the
        // returned svg's root carries id={id}, so removing #id after setSvg
        // would delete the diagram we just displayed.
        const removeScratch = () => {
          document.getElementById(id)?.remove();
          document.getElementById(`d${id}`)?.remove();
        };
        mermaid
          .render(id, code.replace(/\n$/, ""))
          .then(({ svg }) => {
            if (cancelled) {
              removeScratch();
              return;
            }
            setSvg(svg);
            setError(null);
          })
          .catch((err) => {
            removeScratch();
            if (!cancelled) {
              setSvg(null);
              setError(err instanceof Error ? err.message : String(err));
            }
          });
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code]);

  if (error) {
    return (
      <div className="my-3 overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          mermaid: {error}
        </div>
        <pre className="overflow-x-auto bg-muted/40 p-3 text-xs text-muted-foreground">
          <code>{code}</code>
        </pre>
      </div>
    );
  }
  if (!svg) {
    return (
      <div className="my-3 overflow-hidden rounded-lg border border-border bg-muted/40 p-3">
        <pre className="overflow-x-auto text-xs text-muted-foreground">
          <code>{code}</code>
        </pre>
      </div>
    );
  }
  return (
    <div
      className="my-3 flex justify-center overflow-x-auto rounded-lg border border-border bg-card p-4 [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});
