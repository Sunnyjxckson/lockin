"use client";

import { useState } from "react";
import { PageHeader, Screen, SegmentedControl } from "@/components/ui";
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
      <PageHeader title="Body" />
      <SegmentedControl className="mt-2" label="Section" options={TABS} value={tab} onChange={setTab} />
      {tab === "food" ? <FoodTab /> : <WeightTab />}
      <WorkoutRow />
    </Screen>
  );
}
