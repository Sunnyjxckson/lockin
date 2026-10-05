"use client";

// Dev only. Fills this device with three weeks of demo data that contain
// every coach pattern. In a production build /dev answers 404 (see ../layout.tsx)
// and the demo code is not bundled (the import sits behind a NODE_ENV check).

import dynamic from "next/dynamic";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Screen } from "@/components/ui";

const DemoData =
  process.env.NODE_ENV === "production" ? null : dynamic(() => import("@/features/coach/dev/DemoData"), { ssr: false });

export default function CoachDevPage() {
  return (
    <AppShell>
    <Screen>
      <PageHeader title="Coach demo data" back="/coach" subtitle={DemoData ? "Development only" : "Not available in this build"} />
      {DemoData ? <DemoData /> : null}
    </Screen>
    </AppShell>
  );
}
