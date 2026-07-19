import { memo, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
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

/** Render a fenced ```mermaid block; debounced while the parent is streaming. */
function MermaidBlock({ code, streaming }: { code: string; streaming?: boolean }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      () => {
        void loadMermaid().then((mermaid) => {
          if (cancelled) return;
          const id = `mmd-${++mermaidSeq}`;
          mermaid
            .render(id, code)
            .then(({ svg }) => {
              if (!cancelled) {
                setSvg(svg);
                setError(null);
              }
            })
            .catch((err) => {
              document.getElementById(id)?.remove();
              if (!cancelled) {
                setSvg(null);
                setError(err instanceof Error ? err.message : String(err));
              }
            });
        });
      },
      streaming ? 600 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, streaming]);

  if (error) {
    return (
      <div className="mermaid-block">
        <div className="mermaid-error">mermaid: {error}</div>
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    );
  }
  if (!svg) {
    return (
      <div className="mermaid-block">
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    );
  }
  return <div className="mermaid-block" dangerouslySetInnerHTML={{ __html: svg }} />;
}

interface MdProps {
  text: string;
  streaming?: boolean;
}

function Md({ text, streaming }: MdProps) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          code({ className, children, ...props }) {
            const raw = String(children ?? "");
            if (/language-mermaid/.test(className ?? "")) {
              return <MermaidBlock code={raw.replace(/\n$/, "")} streaming={streaming} />;
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default memo(Md);
