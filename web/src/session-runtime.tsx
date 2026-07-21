// Bridge between our ACP session store and assistant-ui's ExternalStoreRuntime.
//
// The store stays the source of truth: every timeline entry is mapped to a
// ThreadMessageLike (user bubbles, assistant markdown, reasoning parts for
// thought chunks, tool-call parts for ACP tool calls). assistant-ui only
// renders; sending/cancelling goes back through the store's actions.

import { useMemo, type FC, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import type { ReadonlyJSONObject } from "assistant-stream/utils";
import type { Attachment, ChatMessage, SessionState, ToolCallState } from "./state";
import { cancelPrompt, sendPrompt } from "./state";

function safeArgs(raw: unknown): ReadonlyJSONObject {
  if (raw != null && typeof raw === "object") return raw as ReadonlyJSONObject;
  return {};
}

function safeArgsText(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  try {
    return typeof raw === "string" ? raw : JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

// Conversion caches, keyed by store-object identity. The store is immutable:
// a changed message/tool call is a NEW object, so a cache hit means "content
// unchanged" and assistant-ui gets the exact same ThreadMessageLike reference
// back. Without this, every streamed chunk rebuilt every message object and
// re-rendered the whole thread (the mobile "render storm").
const userMsgCache = new WeakMap<ChatMessage, ThreadMessageLike>();
const assistantMsgCache = new WeakMap<ChatMessage, ThreadMessageLike>();
const toolMsgCache = new WeakMap<ToolCallState, ThreadMessageLike>();

function cached<K extends object>(cache: WeakMap<K, ThreadMessageLike>, key: K, build: (k: K) => ThreadMessageLike): ThreadMessageLike {
  let v = cache.get(key);
  if (!v) {
    v = build(key);
    cache.set(key, v);
  }
  return v;
}

function userMessage(m: ChatMessage): ThreadMessageLike {
  return {
    id: m.id,
    role: "user",
    createdAt: new Date(m.ts),
    content: [{ type: "text", text: m.text }],
    attachments: m.attachments.map((a) => ({
      id: a.id,
      name: a.name,
      type: "image",
      contentType: a.mime,
      status: { type: "complete" as const },
      content: [{ type: "image" as const, image: a.url }],
    })),
  };
}

function assistantMessage(m: ChatMessage): ThreadMessageLike {
  return {
    id: m.id,
    role: "assistant",
    createdAt: new Date(m.ts),
    content:
      m.role === "thought"
        ? [{ type: "reasoning", text: m.text }]
        : [{ type: "text", text: m.text }],
  };
}

function toolCallMessage(t: ToolCallState): ThreadMessageLike {
  return {
    id: `tc-${t.id}`,
    role: "assistant",
    createdAt: new Date(t.startedAt),
    content: [
      {
        type: "tool-call",
        toolCallId: t.id,
        toolName: t.kind || t.title || "tool",
        args: safeArgs(t.rawInput),
        argsText: safeArgsText(t.rawInput),
        result: t.rawOutput,
        isError: t.status === "failed",
      },
    ],
  };
}

export function sessionToMessages(s: SessionState): ThreadMessageLike[] {
  const out: ThreadMessageLike[] = [];
  for (const item of s.timeline) {
    if (item.kind === "message") {
      const m = s.messages[item.id];
      if (!m) continue;
      out.push(
        m.role === "user"
          ? cached(userMsgCache, m, userMessage)
          : cached(assistantMsgCache, m, assistantMessage),
      );
    } else {
      const t = s.toolCalls[item.id];
      if (t) out.push(cached(toolMsgCache, t, toolCallMessage));
    }
  }
  return out;
}

function attachmentImageUrl(
  a: NonNullable<AppendMessage["attachments"]>[number],
): string {
  for (const part of a.content ?? []) {
    if (part.type === "image") return part.image;
  }
  return "";
}

/**
 * Creates one ExternalStoreRuntime per session. Remounted via `key` on
 * session switch by the caller, so the runtime never spans two sessions.
 */
export function SessionRuntime({
  session,
  children,
}: {
  session: SessionState;
  children: ReactNode;
}) {
  const sessionId = session.sessionId;
  const messages = useMemo(() => sessionToMessages(session), [session]);

  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages,
    convertMessage: (m) => m,
    isRunning: session.running,
    isLoading: !session.synced,
    onNew: async (msg) => {
      const text = msg.content
        .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
        .map((p) => p.text)
        .join("\n");
      const attachments: Attachment[] = (msg.attachments ?? []).map((a) => ({
        id: a.id,
        name: a.name ?? "image",
        mime: a.contentType ?? "image/png",
        url: attachmentImageUrl(a),
      }));
      await sendPrompt(sessionId, text, attachments);
    },
    onCancel: async () => {
      await cancelPrompt(sessionId);
    },
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}

export const SessionRuntimeProvider: FC<{
  session: SessionState;
  children: ReactNode;
}> = SessionRuntime;
