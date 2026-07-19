// Lazy boundary: pulls the assistant-ui runtime + thread out of the entry
// chunk so the shell paints before any session is opened.

import type { SessionState } from "../state";
import { SessionRuntime } from "../session-runtime";
import { Thread } from "@/components/assistant-ui/thread";

export default function SessionChat({ session }: { session: SessionState }) {
  return (
    <SessionRuntime key={session.sessionId} session={session}>
      <Thread />
    </SessionRuntime>
  );
}
