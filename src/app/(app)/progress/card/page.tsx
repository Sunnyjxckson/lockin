"use client";

import dynamic from "next/dynamic";
import { GlassCard, PageHeader, Screen } from "@/components/ui";

// The canvas drawing code only loads on this screen, after the frame is up.
const ShareCard = dynamic(() => import("@/features/progress/card/ShareCard").then((m) => m.ShareCard), {
  ssr: false,
  loading: () => <GlassCard pad={false} className="mt-1 aspect-[4/5]" aria-busy="true" />,
});

export default function ProgressCardPage() {
  return (
    <Screen>
      <PageHeader title="Share card" back="/progress" />
      <ShareCard />
    </Screen>
  );
}
