"use client";

// Placeholder. The coach work replaces this file.

import { MessageSquareText } from "lucide-react";
import { EmptyState, PageHeader, Screen } from "@/components/ui";

export default function CoachPage() {
  return (
    <Screen>
      <PageHeader title="Coach" back="/today" />
      <EmptyState icon={<MessageSquareText size={24} aria-hidden />} title="No notes yet" body="The morning brief, the Sunday review and pattern flags land here." />
    </Screen>
  );
}
