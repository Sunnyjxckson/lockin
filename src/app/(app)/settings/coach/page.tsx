"use client";

import { PageHeader, Screen } from "@/components/ui";
import { CoachSettings } from "@/features/coach/CoachSettings";

export default function CoachSettingsPage() {
  return (
    <Screen>
      <PageHeader title="Coach" back="/settings" subtitle="How it talks, and when it reaches out." />
      <div className="mt-4">
        <CoachSettings />
      </div>
    </Screen>
  );
}
