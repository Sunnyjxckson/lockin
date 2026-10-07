"use client";

// The coach's voice and its check-ins. Used in the sheet on the chat screen
// and on its own page under Settings.

import { Card, ListRow, SegmentedControl, Toggle, useToast } from "@/components/ui";
import { VOICE_LABEL, VOICE_SUB } from "@/lib/logic/coachChat";
import { COACH_VOICES, type CoachCheckins, type CoachVoice } from "@/lib/types";
import { setCheckin, setVoice } from "./chat";
import { useCoachSettings } from "./useChat";

const VOICES = COACH_VOICES.map((v) => ({ value: v, label: VOICE_LABEL[v] }));

const CHECKINS: { key: keyof CoachCheckins; title: string; sub: string }[] = [
  { key: "post_workout", title: "After the workout", sub: "How it went" },
  { key: "slip", title: "After a slip", sub: "What set it off" },
  { key: "missed_item", title: "After a missed item", sub: "What got in the way" },
];

export function CoachSettings() {
  const toast = useToast();
  const { voice, checkins } = useCoachSettings();
  const failed = () => toast("Could not save", { kind: "error" });

  return (
    <div>
      <p className="t-label px-1">Voice</p>
      <SegmentedControl className="mt-3" label="Voice" options={VOICES} value={voice} onChange={(v: CoachVoice) => void setVoice(v).catch(failed)} />
      <p className="t-sub mt-2.5 px-1" aria-live="polite">
        {VOICE_SUB[voice]}
      </p>

      <p className="t-label mt-7 px-1">Check-ins</p>
      <Card raised padded={false} className="mt-3 overflow-hidden">
        <div className="divide-y divide-hair">
          {CHECKINS.map((c) => (
            <ListRow
              key={c.key}
              title={c.title}
              sub={c.sub}
              right={<Toggle label={c.title} checked={checkins[c.key]} onChange={(on) => void setCheckin(checkins, c.key, on).catch(failed)} />}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

export default CoachSettings;
