"use client";

import { PageHeader, Screen } from "@/components/ui";
import { ShareCard } from "@/features/progress/card/ShareCard";

export default function ProgressCardPage() {
  return (
    <Screen>
      <PageHeader title="Share card" back="/progress" />
      <ShareCard />
    </Screen>
  );
}
