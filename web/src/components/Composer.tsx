import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Attachment, SessionState } from "../state";
import { cancelPrompt, sendPrompt, showNotice, useStore } from "../state";
import { formatTokens } from "../utils";
import { IconPaperclip, IconSend, IconStop } from "../icons";

export default function Composer({ session }: { session: SessionState }) {
  const state = useStore();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const busy = session.running;

  const autogrow = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }, []);

  useEffect(autogrow, [text, session.sessionId]);

  // Focus + consume palette injections.
  useEffect(() => {
    if (state.composerInject) {
      setText((t) => (t ? `${t.replace(/\s+$/, "")} ${state.composerInject!.text}` : state.composerInject!.text));
      taRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.composerInject?.seq]);

  useEffect(() => {
    taRef.current?.focus();
  }, [session.sessionId]);

  const addFiles = useCallback(
    async (files: Iterable<File>) => {
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          showNotice(`"${file.name}" skipped — only images can be attached`);
          continue;
        }
        setUploading((n) => n + 1);
        try {
          const meta = await api.upload(file, file.name || "image.png");
          setAttachments((prev) => [
            ...prev,
            { id: meta.id, name: meta.name, mime: meta.mime, url: meta.url },
          ]);
        } catch (err) {
          showNotice(err instanceof Error ? err.message : "upload failed");
        } finally {
          setUploading((n) => n - 1);
        }
      }
    },
    [],
  );

  // Window-level drag & drop.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const files = e.dataTransfer?.files;
      if (files?.length) void addFiles(files);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [addFiles]);

  const send = async () => {
    if (busy) return;
    const value = text;
    const atts = attachments;
    if (!value.trim() && atts.length === 0) return;
    setText("");
    setAttachments([]);
    requestAnimationFrame(autogrow);
    await sendPrompt(session.sessionId, value, atts);
  };

  const usage = session.usage;
  const pct = usage && usage.size ? Math.min(100, Math.round((usage.used / usage.size) * 100)) : null;

  return (
    <div className="composer-area">
      <div className="composer">
        {(attachments.length > 0 || uploading > 0) && (
          <div className="composer-chips">
            {attachments.map((a) => (
              <span key={a.id} className="attach-chip">
                {a.mime.startsWith("image/") && <img src={a.url} alt={a.name} />}
                {a.name}
                <button
                  className="x"
                  aria-label={`remove ${a.name}`}
                  onClick={() => setAttachments((prev) => prev.filter((p) => p.id !== a.id))}
                >
                  ✕
                </button>
              </span>
            ))}
            {uploading > 0 && (
              <span className="attach-chip">
                <span className="spinner" /> uploading…
              </span>
            )}
          </div>
        )}
        <div className={`composer-box ${dragging ? "dragging" : ""}`}>
          <textarea
            ref={taRef}
            rows={1}
            placeholder={dragging ? "Drop images to attach…" : `Message Devin… (Enter to send, Shift+Enter for newline, @path to link files)`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            onPaste={(e) => {
              const files = [...e.clipboardData.files];
              if (files.length > 0) {
                e.preventDefault();
                void addFiles(files);
              }
            }}
          />
          <div className="composer-actions">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button className="icon-btn" title="Attach images" onClick={() => fileRef.current?.click()}>
              <IconPaperclip size={17} />
            </button>
            {busy ? (
              <button
                className="send-btn stop"
                title="Stop"
                onClick={() => void cancelPrompt(session.sessionId)}
              >
                <IconStop size={15} />
              </button>
            ) : (
              <button
                className="send-btn"
                title="Send"
                disabled={!text.trim() && attachments.length === 0}
                onClick={() => void send()}
              >
                <IconSend size={15} />
              </button>
            )}
          </div>
        </div>
        <div className="composer-meta">
          <span className="cwd" title={session.cwd}>
            {session.cwd}
          </span>
          <span className="spacer" />
          {pct !== null && usage && (
            <span className="mono">
              ctx {formatTokens(usage.used)}/{formatTokens(usage.size)} ({pct}%)
            </span>
          )}
          {session.availableCommands.length > 0 && (
            <span>{session.availableCommands.length} /commands via Ctrl+K</span>
          )}
        </div>
      </div>
    </div>
  );
}
