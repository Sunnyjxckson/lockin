"use client";

// Placeholder. The money work replaces this file.

import { DollarSign } from "lucide-react";
import { EmptyState, PageHeader, Screen } from "@/components/ui";

export default function MoneyPage() {
  return (
    <Screen>
      <PageHeader title="Money" />
      <EmptyState icon={<DollarSign size={24} aria-hidden />} title="No earnings yet" body="Quick add, the running total toward your target, and the daily floor land here." />
    </Screen>
  );
}
