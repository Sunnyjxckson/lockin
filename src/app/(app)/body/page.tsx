"use client";

// Placeholder. The body work replaces this file.

import { Activity } from "lucide-react";
import { EmptyState, PageHeader, Screen } from "@/components/ui";

export default function BodyPage() {
  return (
    <Screen>
      <PageHeader title="Body" />
      <EmptyState icon={<Activity size={24} aria-hidden />} title="Nothing logged yet" body="Weight, meals, macros and progress photos land here." />
    </Screen>
  );
}
