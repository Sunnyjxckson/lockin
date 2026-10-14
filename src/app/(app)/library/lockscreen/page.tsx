"use client";

// The quote on your lock screen: preview, look, saving the wallpaper (PRD 28).

import { PageHeader, Screen } from "@/components/ui";
import { LockScreenPanel } from "@/features/library/lockscreen/LockScreenPanel";

export default function LockScreenPage() {
  return (
    <Screen>
      <PageHeader title="Lock screen" back="/library" />
      <LockScreenPanel />
    </Screen>
  );
}
