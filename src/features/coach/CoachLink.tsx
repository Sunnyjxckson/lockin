"use client";

// The way in to the coach chat from a tab's top bar: one icon, with a dot
// when the coach has sent a check-in that has not been read.

import { MessageSquareText } from "lucide-react";
import { IconLink } from "@/components/ui";
import { useCoachUnread } from "./useUnread";

export function CoachLink() {
  const unread = useCoachUnread();
  return (
    <IconLink href="/coach" label={unread > 0 ? `Coach, ${unread} new` : "Coach"} className="relative">
      <MessageSquareText size={20} strokeWidth={1.75} aria-hidden />
      {unread > 0 ? <span className="grad-line absolute top-2 right-2 size-2 rounded-full" data-coach-unread aria-hidden /> : null}
    </IconLink>
  );
}

export default CoachLink;
