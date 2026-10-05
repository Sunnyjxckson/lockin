"use client";

// Placeholder. The vices work replaces this file.

import { ShieldBan } from "lucide-react";
import { EmptyState, PageHeader, Screen } from "@/components/ui";

export default function VicesPage() {
  return (
    <Screen>
      <PageHeader title="Vices" back="/today" />
      <EmptyState icon={<ShieldBan size={24} aria-hidden />} title="Vice library" body="Pick what you are quitting or capping, and log slips here." />
    </Screen>
  );
}
