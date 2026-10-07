"use client";

// The chat, live: the messages, sending one, and what is unread.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui";
import { isSupabaseMode } from "@/lib/db";
import { useList, useSettings } from "@/lib/db/hooks";
import { checkinsOf, voiceOf } from "@/lib/logic/coachChat";
import type { CoachCheckins, CoachMessage, CoachVoice } from "@/lib/types";
import { markRead, sendMessage } from "./chat";

const THREAD = { orderBy: "sent_at", ascending: false, limit: 200 } as const;

export interface ChatState {
  loading: boolean;
  /** Oldest first. */
  messages: CoachMessage[];
  /** True from the moment a message is sent until the coach has answered. */
  thinking: boolean;
  /** The table could not be read. In Supabase mode that means migration 0014 has not run. */
  missing: boolean;
  send: (text: string) => void;
}

export function useChat(): ChatState {
  const toast = useToast();
  const list = useList("coach_message", THREAD);
  const [sending, setSending] = useState(false);
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

  return { loading: list.loading, messages, thinking: sending, missing: !!list.error, send };
}

export function useCoachSettings(): { voice: CoachVoice; checkins: CoachCheckins; loading: boolean } {
  const settings = useSettings();
  return useMemo(
    () => ({ voice: voiceOf(settings.data?.coach_voice), checkins: checkinsOf(settings.data?.coach_checkins), loading: settings.loading }),
    [settings.data, settings.loading],
  );
}
