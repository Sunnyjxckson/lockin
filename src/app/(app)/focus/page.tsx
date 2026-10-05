"use client";

// Placeholder. The focus agent fills this in: the study timer, logging hours
// by hand, and feeding the study item on the checklist (feature 18). The data
// is ready: table focus_session, and app_settings.focus_goal_minutes.

import { Timer } from "lucide-react";
import { EmptyState, PageHeader, Screen } from "@/components/ui";

export default function FocusPage() {
  return (
    <Screen>
      <PageHeader title="Focus" back="/schedule" />
      <EmptyState
        icon={<Timer size={24} aria-hidden />}
        title="No focus sessions yet"
        body="The focus timer is coming: hit start and the clock runs, or log study hours after the fact."
      />
    </Screen>
  );
}
