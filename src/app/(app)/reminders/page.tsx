"use client";

// Placeholder. The reminders work replaces this file.

import { BellRing } from "lucide-react";
import { EmptyState, PageHeader, Screen } from "@/components/ui";

export default function RemindersPage() {
  return (
    <Screen>
      <PageHeader title="Reminders" back="/settings" />
      <EmptyState icon={<BellRing size={24} aria-hidden />} title="Notifications are not connected" body="Push reminders land here. Times and on/off switches are already in Settings." />
    </Screen>
  );
}
