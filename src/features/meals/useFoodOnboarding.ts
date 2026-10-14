"use client";

import { useState } from "react";
import { useList, useSettings } from "@/lib/db/hooks";
import { needsFoodOnboarding } from "@/lib/logic/mealsOnboarding";
import { skipOnboarding } from "./foodSetup";

/**
 * Whether the food questions are open. They open by themselves the first time
 * Meals opens with no plan and the questions never answered. Closing them
 * without answering counts as done, so they are not asked again. `show` opens
 * them again at any time.
 */
export function useFoodOnboarding(): { open: boolean; show: () => void; close: () => void } {
  const settings = useSettings();
  const plans = useList("meal_plan");
  const [manual, setManual] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const ready = !settings.loading && !plans.loading && !!settings.data;
  const first = ready && !dismissed && needsFoodOnboarding(settings.data?.food_onboarded, plans.data.length > 0);
  return {
    open: manual || first,
    show: () => setManual(true),
    close: () => {
      setManual(false);
      setDismissed(true);
      if (first) void skipOnboarding().catch(() => undefined);
    },
  };
}
