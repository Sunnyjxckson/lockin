"use client";

// Placeholder. The schedule work replaces this file.

import { CalendarClock } from "lucide-react";
import { EmptyState, PageHeader, Screen } from "@/components/ui";

export default function SchedulePage() {
  return (
    <Screen>
      <PageHeader title="Schedule" />
      <EmptyState icon={<CalendarClock size={24} aria-hidden />} title="No schedule view yet" body="Your day in time blocks, built from the weekday template, lands here." />
    </Screen>
  );
}
