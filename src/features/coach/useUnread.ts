"use client";

// On its own, apart from the chat, so the dot in a tab's top bar does not pull
// the whole coach into that tab's first load.

import { useList } from "@/lib/db/hooks";

const UNREAD = { eq: { read: false } } as const;

/** How many check-ins have not been read. For the dot on the way in. */
export function useCoachUnread(): number {
  return useList("coach_message", UNREAD).data.length;
}
