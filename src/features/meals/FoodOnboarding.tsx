"use client";

import { useState } from "react";
import { Button, NumberField, SegmentedControl, Sheet, useToast } from "@/components/ui";
import { useList, useSettings } from "@/lib/db/hooks";
import { haptics } from "@/lib/haptics";
import { COOK_OPTIONS, cleanCookMinutes, cookLabel, PANTRY_IDEAS } from "@/lib/logic/mealsOnboarding";
import { foodKey } from "@/lib/logic/meals";
import { pantryChips, saveOnboarding } from "./foodSetup";
import { DISLIKE_IDEAS, LIKE_IDEAS, TermChips } from "./parts";

const STEPS = 3;

/** The food questions: likes and dislikes, budget and cooking time, and what is at home. */
export function FoodOnboarding({ onClose }: { onClose: () => void }) {
  const settings = useSettings();
  const pantryRows = useList("pantry_item", { orderBy: "name" });
  if (settings.loading || pantryRows.loading || !settings.data) return null;
  return <Steps onClose={onClose} settings={settings.data} atHome={pantryChips(pantryRows.data.map((p) => foodKey(p.name)))} />;
}

function Steps({
  onClose,
  settings,
  atHome,
}: {
  onClose: () => void;
  settings: { food_likes: string[]; food_dislikes: string[]; weekly_food_budget: number | null; cook_minutes: number; food_onboarded: boolean };
  atHome: string[];
}) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [likes, setLikes] = useState<string[]>(settings.food_likes ?? []);
  const [dislikes, setDislikes] = useState<string[]>(settings.food_dislikes ?? []);
  const [budget, setBudget] = useState<number | null>(settings.weekly_food_budget && settings.weekly_food_budget > 0 ? settings.weekly_food_budget : null);
  const [cook, setCook] = useState(cleanCookMinutes(settings.cook_minutes));
  const [pantry, setPantry] = useState<string[]>(atHome);
  const [busy, setBusy] = useState(false);
  const last = step === STEPS - 1;

  const save = async () => {
    setBusy(true);
    try {
      await saveOnboarding({ likes, dislikes, budget, cookMinutes: cook, pantry }, atHome);
      haptics.done();
      toast("Saved", { kind: "done" });
      onClose();
    } catch (e) {
      haptics.error();
      toast(e instanceof Error ? e.message : "Could not save", { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={() => (busy ? undefined : onClose())}
      title={["What you eat", "Money and time", "What is at home"][step]}
      subtitle={`${step + 1} of ${STEPS}`}
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" full disabled={busy} onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            {step === 0 ? "Not now" : "Back"}
          </Button>
          <Button full loading={busy} onClick={() => (last ? void save() : setStep(step + 1))}>
            {last ? "Save" : "Next"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {step === 0 ? (
          <>
            <TermChips label="Foods you like" terms={likes} onChange={setLikes} suggestions={LIKE_IDEAS} placeholder="Add a food" />
            <TermChips label="Foods you won't eat" terms={dislikes} onChange={setDislikes} suggestions={DISLIKE_IDEAS} placeholder="Add a food" />
          </>
        ) : null}
        {step === 1 ? (
          <>
            <NumberField label="Weekly food budget" prefix="$" value={budget} onChange={setBudget} live placeholder="60" max={2000} />
            <div className="flex flex-col gap-2">
              <p className="text-[13px] text-ink-2">Time to cook on a weeknight</p>
              <SegmentedControl
                label="Time to cook on a weeknight"
                value={cook}
                onChange={setCook}
                options={COOK_OPTIONS.map((m) => ({ value: m, label: cookLabel(m) }))}
              />
            </div>
          </>
        ) : null}
        {step === 2 ? (
          <TermChips
            label="What is already at home"
            hint="Left off the grocery list. Salt, oil and spices are already counted."
            terms={pantry}
            onChange={setPantry}
            suggestions={PANTRY_IDEAS}
            placeholder="Add a food"
          />
        ) : null}
      </div>
    </Sheet>
  );
}
