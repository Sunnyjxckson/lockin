"use client";

import { Sheet } from "@/components/ui";
import { CoachSettings } from "./CoachSettings";

export function CoachSettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Coach" subtitle="How it talks, and when it reaches out.">
      <div className="pb-2">
        <CoachSettings />
      </div>
    </Sheet>
  );
}

export default CoachSettingsSheet;
