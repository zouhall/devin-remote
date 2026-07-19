import { memo, useEffect, useRef, useState } from "react";
import type { SessionState } from "../state";
import { cx } from "../utils";
import { IconCheck, IconCircle, IconDot, IconPlan, IconScroll, IconThink } from "../icons";
import Markdown from "./Markdown";
import ToolCallCard from "./ToolCallCard";
import PermissionCard from "./PermissionCard";

function AttachmentChips({ attachments }: { attachments: SessionState["messages"][string]["attachments"] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="attach-chips">
      {attachments.map((a) => (
        <span key={a.id} className="attach-chip" title={a.name}>
          {a.mime.startsWith("image/") ? <img src={a.url} alt={a.name} /> : null}
          {a.name}
        </span>
      ))}
    </div>
  );
}

function ThoughtBlock({ text, streaming }: { text: string; streaming: boolean }) {
  // Thoughts start collapsed; user can expand while they stream.
  return (
    <details className="thought">
      <summary>
        <IconThink size={13} /> Thinking…
      </summary>
      <div className="thought-body">
        <Markdown text={text} streaming={streaming} />
      </div>
    </details>
  );
}

function PlanPanel({ plan }: { plan: NonNullable<SessionState["plan"]> }) {
  const done = plan.filter((e) => e.status === "completed").length;
  return (
    <div className="plan-panel">
      <div className="plan-head">
        <IconPlan size={14} /> Plan · {done}/{plan.length} done
      </div>
      <ul>
        {plan.map((e, i) => (
          <li key={i} className={cx(e.status === "completed" && "done")}>
            <span className="plan-icon">
              {e.status === "completed" ? (
                <IconCheck size={13} />
              ) : e.status === "in_progress" ? (
                <span className="spinner" style={{ width: 10, height: 10 }} />
              ) : (
                <IconCircle size={12} />
              )}
            </span>
            <span>{e.content}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const MessageList = memo(function MessageList({ session }: { session: SessionState }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [showJump, setShowJump] = useState(false);

  // Track the rendered content height signal cheaply.
  const lastItem = session.timeline[session.timeline.length - 1];
  const lastMsg = lastItem?.kind === "message" ? session.messages[lastItem.id] : null;
  const contentSig = `${session.timeline.length}:${lastMsg?.text.length ?? 0}:${session.permissions.length}`;

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [contentSig, session.sessionId]);

  // Jump to bottom on session switch.
  useEffect(() => {
    pinned.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.sessionId]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    pinned.current = atBottom;
    setShowJump(!atBottom);
  };

  return (
    <>
      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="chat-inner">
          {session.timeline.length === 0 && (
            <div className="loading-row">
              {session.synced ? (
                "No messages yet — say something below."
              ) : (
                <>
                  <span className="spinner" /> Loading history…
                </>
              )}
            </div>
          )}
          {session.timeline.map((item) => {
            if (item.kind === "tool") {
              const tc = session.toolCalls[item.id];
              return tc ? <ToolCallCard key={item.id} call={tc} /> : null;
            }
            const msg = session.messages[item.id];
            if (!msg) return null;
            if (msg.role === "user") {
              return (
                <div key={item.id} className="msg msg-user">
                  <div className="bubble">
                    {msg.text}
                    <AttachmentChips attachments={msg.attachments} />
                  </div>
                </div>
              );
            }
            if (msg.role === "thought") {
              return (
                <div key={item.id} className="msg msg-thought">
                  <ThoughtBlock text={msg.text} streaming={msg.streaming} />
                </div>
              );
            }
            return (
              <div key={item.id} className="msg msg-agent">
                <div className={cx("bubble", msg.streaming && "caret")}>
                  <Markdown text={msg.text} streaming={msg.streaming} />
                </div>
              </div>
            );
          })}
          {session.plan && session.plan.length > 0 && <PlanPanel plan={session.plan} />}
          {session.permissions.map((p) => (
            <PermissionCard key={p.requestId} perm={p} />
          ))}
          {session.running && (
            <div className="msg-label">
              <IconDot size={10} /> Devin is working…
            </div>
          )}
        </div>
      </div>
      {showJump && (
        <button
          className="icon-btn scroll-bottom-btn"
          title="Scroll to bottom"
          onClick={() => {
            pinned.current = true;
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
            setShowJump(false);
          }}
        >
          <IconScroll size={16} />
        </button>
      )}
    </>
  );
});

export default MessageList;
