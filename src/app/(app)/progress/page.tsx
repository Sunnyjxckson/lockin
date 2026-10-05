"use client";

// Placeholder. The progress work replaces this file.

import { LayoutGrid } from "lucide-react";
import { EmptyState, PageHeader, Screen } from "@/components/ui";

export default function ProgressPage() {
  return (
    <Screen>
      <PageHeader title="Progress" />
      <EmptyState icon={<LayoutGrid size={24} aria-hidden />} title="No history yet" body="The 30 day grid and your streaks land here." />
    </Screen>
  );
}
