"use client";

import dynamic from "next/dynamic";
import { Card, PageHeader, Screen } from "@/components/ui";

// The canvas drawing code only loads on this screen, after the frame is up.
const ShareCard = dynamic(() => import("@/features/progress/card/ShareCard").then((m) => m.ShareCard), {
  ssr: false,
  loading: () => <Card className="mt-2 aspect-[4/5]" aria-busy="true" />,
});

export default function ProgressCardPage() {
  return (
    <Screen>
      <PageHeader title="Share card" back="/progress" />
      <ShareCard />
    </Screen>
  );
}
