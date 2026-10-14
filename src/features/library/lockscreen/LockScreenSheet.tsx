"use client";

import { Sheet } from "@/components/ui";
import { LockScreenPanel } from "./LockScreenPanel";

/** The lock screen in a sheet, for Today. */
export function LockScreenSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet open onClose={onClose} title="Lock screen">
      <LockScreenPanel />
    </Sheet>
  );
}
