"use client";

import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { IconLink, Screen, SegmentedControl, TopBar } from "@/components/ui";
import { CoachLink } from "@/features/coach/CoachLink";
import { FoodTab } from "@/features/body/FoodTab";
import { WorkoutRow } from "@/features/body/TodaySlot";
import { WeightTab } from "@/features/body/WeightTab";

type Tab = "food" | "weight";

const TABS = [
  { value: "food", label: "Food" },
  { value: "weight", label: "Weight" },
] as const;

export default function BodyPage() {
  const [tab, setTab] = useState<Tab>("food");
  return (
    <Screen>
      <TopBar
        title="Body"
        right={
          <>
            <CoachLink />
            <IconLink href="/meals" label="Meal plan">
              <UtensilsCrossed size={20} strokeWidth={1.75} aria-hidden />
            </IconLink>
          </>
        }
      />
      <SegmentedControl className="mt-1" label="Section" options={TABS} value={tab} onChange={setTab} />
      {tab === "food" ? <FoodTab /> : <WeightTab />}
      <WorkoutRow />
    </Screen>
  );
}
