"use client";

// The chat, live: the messages, sending one, and what is unread.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui";
import { isSupabaseMode } from "@/lib/db";
import { useList, useSettings } from "@/lib/db/hooks";
import { checkinsOf, voiceOf } from "@/lib/logic/coachChat";
import type { CoachCheckins, CoachCommitment, CoachMessage, CoachVoice } from "@/lib/types";
import { markRead, sendMessage } from "./chat";
import { answerCommitment } from "./memory";

const THREAD = { orderBy: "sent_at", ascending: false, limit: 200 } as const;
const COMMITMENTS = { orderBy: "due_at", ascending: false, limit: 60 } as const;

export interface ChatState {
  loading: boolean;
  /** Oldest first. */
  messages: CoachMessage[];
  /** True from the moment a message is sent until the coach has answered. */
  thinking: boolean;
  /** The table could not be read. In Supabase mode that means migration 0014 has not run. */
  missing: boolean;
  send: (text: string) => void;
  /** Commitments by id, for the two taps under a "you said you would" check-in. Empty when the table cannot be read. */
  commitments: ReadonlyMap<string, CoachCommitment>;
  /** Tap: it happened, or it did not. */
  answer: (id: string, status: "done" | "missed") => void;
}

export function useChat(): ChatState {
  const toast = useToast();
  const list = useList("coach_message", THREAD);
  const commits = useList("coach_commitment", COMMITMENTS);
  const { voice } = useCoachSettings();
  const [sending, setSending] = useState(false);
  const commitments = useMemo(() => new Map(commits.data.map((c) => [c.id, c])), [commits.data]);
  const messages = useMemo(() => [...list.data].reverse(), [list.data]);

  // Opening the chat reads everything in it.
  const unread = useMemo(() => messages.filter((m) => !m.read).map((m) => m.id), [messages]);
  const unreadKey = unread.join(",");
  useEffect(() => {
    if (unreadKey) void markRead(unreadKey.split(","));
  }, [unreadKey]);

  const send = useCallback(
    (text: string) => {
      if (sending || !text.trim()) return;
      setSending(true);
      sendMessage(text)
        .catch(() => toast(isSupabaseMode() ? "Could not send. Check the connection." : "Could not send", { kind: "error" }))
        .finally(() => setSending(false));
    },
    [sending, toast],
  );

  const answer = useCallback(
    (id: string, status: "done" | "missed") => {
      answerCommitment(id, status, voice).catch(() => toast("Could not save that", { kind: "error" }));
    },
    [voice, toast],
  );

  return { loading: list.loading, messages, thinking: sending, missing: !!list.error, send, commitments, answer };
}

export function useCoachSettings(): { voice: CoachVoice; checkins: Required<CoachCheckins>; loading: boolean } {
  const settings = useSettings();
  return useMemo(
    () => ({ voice: voiceOf(settings.data?.coach_voice), checkins: checkinsOf(settings.data?.coach_checkins), loading: settings.loading }),
    [settings.data, settings.loading],
  );
}
