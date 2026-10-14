"use client";

import { useState } from "react";
import { Button, SegmentedControl, Sheet, useToast } from "@/components/ui";
import { useList, useSettings } from "@/lib/db/hooks";
import { haptics } from "@/lib/haptics";
import { describeChange, FOOD_GOALS, GOAL_LABEL, isFoodGoal, lbOf, planGoal, sameNumbers, type FoodGoal, type GoalNumbers, type GoalPlan } from "@/lib/logic/goal";
import { applyGoal } from "./foodSetup";
import { useMeals } from "./useMeals";

/**
 * Cut, maintain or bulk. Picking one shows old against new numbers in a
 * sheet. Confirming saves the new targets from today on and re-portions the
 * meals still to come.
 */
export function GoalSwitch() {
  const toast = useToast();
  const settings = useSettings();
  const m = useMeals("this");
  const plans = useList("meal_plan");
  const weights = useList("body_log", { orderBy: "date", ascending: false, limit: 30 });
  const [pending, setPending] = useState<GoalPlan | null>(null);
  const [busy, setBusy] = useState(false);

  const s = settings.data;
  const unit = s?.weight_unit ?? "lb";
  const latest = weights.data.find((r) => r.weight !== null && r.weight > 0)?.weight ?? null;
  const goal = isFoodGoal(s?.goal) ? s.goal : null;
  const now: GoalNumbers = { calMin: m.targets.calMin, calMax: m.targets.calMax, protein: m.targets.proteinMin, carbs: s?.carbs_target ?? 0, fat: s?.fat_target ?? 0 };

  if (!s || m.loading || weights.loading) return <div className="tile h-11 rounded-full" aria-busy="true" />;

  const pick = (g: FoodGoal) => {
    const plan = planGoal(latest === null ? null : lbOf(latest, unit), g);
    if (!plan) {
      haptics.error();
      toast("Log your weight on Body first", { kind: "error" });
      return;
    }
    if (sameNumbers(plan.next, now)) {
      toast("Those are your numbers already", { kind: "info" });
      return;
    }
    setPending(plan);
  };

  const confirm = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const next = pending.next;
      await applyGoal({
        goal: pending.goal,
        next,
        today: m.today,
        plans: plans.data.filter((p) => p.week_start >= m.dates[0]),
        contextFor: (_plan, t) => ({ ...m.ctx, targets: { calMin: t.calMin, calMax: t.calMax, proteinMin: t.protein }, targetsByDate: undefined }),
        saveContext: { recipes: m.recipes, book: m.book },
      });
      haptics.done();
      toast(`${GOAL_LABEL[pending.goal]} from today`, { kind: "done" });
      setPending(null);
    } catch (e) {
      haptics.error();
      toast(e instanceof Error ? e.message : "Could not change the goal", { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const rows = pending ? describeChange(now, pending.next) : [];

  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        label="Food goal"
        value={goal ?? "none"}
        onChange={(v) => (isFoodGoal(v) ? pick(v) : undefined)}
        options={FOOD_GOALS.map((g) => ({ value: g as string, label: GOAL_LABEL[g] }))}
      />
      {latest === null ? <p className="t-sub px-1">Log your weight on Body and the numbers follow it.</p> : null}

      {pending ? (
        <Sheet
          open
          onClose={() => (busy ? undefined : setPending(null))}
          title={`Switch to ${GOAL_LABEL[pending.goal]}?`}
          subtitle="From today on. Past days keep their targets."
          footer={
            <div className="flex gap-3">
              <Button variant="secondary" full disabled={busy} onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button full loading={busy} onClick={() => void confirm()}>
                Switch
              </Button>
            </div>
          }
        >
          <div className="grid grid-cols-[84px_1fr_1fr] gap-x-3 gap-y-3.5" data-goal-change>
            <span />
            <span className="t-label">Now</span>
            <span className="t-label">New</span>
            {rows.map((r) => (
              <Row key={r.label} label={r.label} from={r.from} to={r.to} changed={r.changed} />
            ))}
          </div>
          <p className="t-sub mt-5">
            Based on {Math.round(latest === null ? 0 : lbOf(latest, unit))} lb, about {pending.maintenance.toLocaleString("en-US")} kcal to hold your weight. The meals still to come this week are re-portioned.
          </p>
        </Sheet>
      ) : null}
    </div>
  );
}

function Row({ label, from, to, changed }: { label: string; from: string; to: string; changed: boolean }) {
  return (
    <>
      <span className="t-caption text-ink-2">{label}</span>
      <span className="text-[15px] text-ink-2">{from}</span>
      <span className={changed ? "text-[15px] text-ink" : "text-[15px] text-ink-2"}>{to}</span>
    </>
  );
}
