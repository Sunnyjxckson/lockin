"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Check, ChefHat } from "lucide-react";
import { Button, SegmentedControl, Sheet, cn, useToast } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { formatDateLong } from "@/lib/logic/dates";
import { amountLabel, dollars, round, servingsLabel, SLOT_LABEL } from "@/lib/logic/meals";
import { displayName } from "@/lib/logic/mealsGrocery";
import { applySwap, swapOptions, type SwapOption, type SwapScope } from "@/lib/logic/mealsPlanner";
import type { DateStr, MealSlot, Recipe } from "@/lib/types";
import { logCooked, savePlan, type Planned } from "./data";
import { Est, fmt, macroLine } from "./parts";
import type { MealsState } from "./useMeals";

function signedMoney(n: number): string {
  if (Math.abs(n) < 0.005) return "no change";
  return `${n > 0 ? "+" : "-"}${dollars(Math.abs(n))}`;
}

/** One planned meal: the recipe scaled to the planned portion, "Cooked, log it", and swap. */
export function PlannedMealSheet({ m, date, slot, onClose }: { m: MealsState; date: DateStr; slot: MealSlot; onClose: () => void }) {
  const toast = useToast();
  const [view, setView] = useState<"cook" | "swap">("cook");
  const [amount, setAmount] = useState<"portion" | "batch">("portion");
  const [scope, setScope] = useState<SwapScope>("day");
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const meal = m.meals.find((x) => x.date === date && x.slot === slot) ?? null;
  const recipe: Recipe | null = meal ? (m.recipeById.get(meal.recipe_id) ?? null) : null;
  const repeats = meal ? m.meals.filter((x) => x.slot === slot && x.recipe_id === meal.recipe_id) : [];
  const weekServings = repeats.reduce((a, x) => a + x.servings, 0);
  const day = m.summary?.days.find((d) => d.date === date) ?? null;

  const options: SwapOption[] = useMemo(
    () => (view === "swap" ? swapOptions(m.meals, date, slot, scope, m.ctx) : []),
    [view, m.meals, m.ctx, date, slot, scope],
  );
  const choice = options.find((o) => o.recipe.id === picked) ?? null;

  if (!meal || !m.plan) return null;

  if (!recipe) {
    return (
      <Sheet open onClose={onClose} title="Recipe removed" subtitle="This meal's recipe is no longer in your library.">
        <p className="t-sub">Rebuild the week to replace it.</p>
      </Sheet>
    );
  }

  const logged = !!meal.logged;
  const canLog = date <= m.today && !logged;
  const scale = (amount === "batch" ? weekServings : meal.servings) / (recipe.servings > 0 ? recipe.servings : 1);

  const log = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await logCooked(m.plan!, date, slot, recipe);
      haptics.done();
      toast(`Logged ${fmt(recipe.calories * meal.servings)} kcal and ${fmt(recipe.protein * meal.servings)}g protein`, { kind: "done" });
      onClose();
    } catch (e) {
      haptics.error();
      toast(e instanceof Error ? e.message : "Could not log the meal", { kind: "error" });
      setBusy(false);
    }
  };

  const confirmSwap = async () => {
    if (!choice || busy) return;
    setBusy(true);
    try {
      const next = applySwap(m.meals, date, slot, choice.recipe.id, scope, m.ctx) as Planned[];
      await savePlan(m.weekStart, next, m.plan!.budget, m.store, { recipes: m.recipes, book: m.book });
      haptics.done();
      toast(`Swapped to ${choice.recipe.name}. The day is re-portioned.`, { kind: "done" });
      onClose();
    } catch (e) {
      haptics.error();
      toast(e instanceof Error ? e.message : "Could not swap the meal", { kind: "error" });
      setBusy(false);
    }
  };

  if (view === "swap") {
    return (
      <Sheet
        open
        onClose={onClose}
        title={`Swap ${SLOT_LABEL[slot].toLowerCase()}`}
        subtitle={`Instead of ${recipe.name}. Best fit first.`}
        footer={
          <div className="flex flex-col gap-2.5">
            {choice ? (
              <div className="rounded-[14px] bg-surface-2 px-4 py-3 text-[14px] leading-snug" role="status" data-swap-effect>
                <p className="text-ink">
                  <span className="text-ink-3">Day: </span>
                  <span className={cn("tnum", !choice.day.ok && "text-warn")}>{macroLine(choice.day.calories, choice.day.protein)}</span>
                  {choice.day.ok ? null : <span className="text-warn"> (off target)</span>}
                </p>
                <p className="mt-0.5 text-ink">
                  <span className="text-ink-3">Week: </span>
                  <Est>{dollars(choice.weekCost)}</Est>
                  <span className={cn("tnum", choice.overBudget ? "text-warn" : "text-ink-2")}>
                    {" "}
                    ({signedMoney(choice.costDelta)}
                    {choice.overBudget ? ", over budget" : ""})
                  </span>
                </p>
              </div>
            ) : null}
            <div className="flex gap-2.5">
              <Button variant="secondary" onClick={() => setView("cook")} disabled={busy}>
                Back
              </Button>
              <Button full onClick={confirmSwap} disabled={!choice} loading={busy}>
                {choice ? "Confirm swap" : "Pick a meal"}
              </Button>
            </div>
          </div>
        }
      >
        {repeats.length > 1 ? (
          <SegmentedControl
            label="How much to swap"
            size="sm"
            value={scope}
            onChange={(v) => {
              setScope(v);
              setPicked(null);
            }}
            options={[
              { value: "day", label: "Just this day" },
              { value: "week", label: `All ${repeats.length} days` },
            ]}
          />
        ) : null}
        <ul className="mt-3 flex flex-col gap-2" aria-label="Alternatives">
          {options.map((o) => {
            const on = o.recipe.id === picked;
            return (
              <li key={o.recipe.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    haptics.tap();
                    setPicked(o.recipe.id);
                  }}
                  className={cn("pressable flex w-full items-center gap-3 rounded-[14px] border px-4 py-3 text-left", on ? "border-ink bg-surface-2" : "border-line")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-medium text-ink">{o.recipe.name}</span>
                    <span className="mt-0.5 block text-[13px] text-ink-3">
                      {servingsLabel(o.servings)}, day {macroLine(o.day.calories, o.day.protein)}
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-x-2 text-[13px]">
                      {o.liked ? <span className="text-ink-2">You like this</span> : null}
                      {!o.day.ok ? <span className="text-warn">Day off target</span> : null}
                      {o.overBudget ? <span className="text-warn">Over budget</span> : null}
                    </span>
                  </span>
                  <span className={cn("tnum shrink-0 text-[14px]", o.costDelta > 0.004 ? "text-ink-2" : "text-ink")}>{signedMoney(o.costDelta)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {options.length === 0 ? <p className="t-sub mt-4">No other {SLOT_LABEL[slot].toLowerCase()} recipes fit your dislikes. Add one in Recipes.</p> : null}
        <p className="mt-3 text-[13px] text-ink-3">Dollar changes are estimates for the week&apos;s grocery list.</p>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={recipe.name}
      subtitle={`${SLOT_LABEL[slot]}, ${formatDateLong(date)}`}
      footer={
        <div className="flex gap-2.5">
          <Button variant="secondary" onClick={() => setView("swap")} disabled={busy || logged} icon={<ArrowLeftRight size={18} aria-hidden />}>
            Swap
          </Button>
          <Button full onClick={log} disabled={!canLog} loading={busy} icon={logged ? <Check size={18} aria-hidden /> : <ChefHat size={18} aria-hidden />}>
            {logged ? "Logged" : date > m.today ? "Log it on the day" : "Cooked, log it"}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-4 gap-2 rounded-[14px] bg-surface-2 px-3 py-3 text-center">
        {(
          [
            ["kcal", fmt(recipe.calories * meal.servings)],
            ["protein", `${fmt(recipe.protein * meal.servings)}g`],
            ["carbs", `${fmt(recipe.carbs * meal.servings)}g`],
            ["fat", `${fmt(recipe.fat * meal.servings)}g`],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <p className="t-num-sm tnum">{v}</p>
            <p className="t-label mt-0.5">{k}</p>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[14px] text-ink-2">
        Your portion: <span className="font-semibold text-ink">{servingsLabel(meal.servings)}</span>, <Est>{dollars(round(recipe.est_cost * meal.servings, 2))}</Est>
        {day ? <span className="text-ink-3">. Day total {macroLine(day.calories, day.protein)}.</span> : null}
      </p>

      {repeats.length > 1 ? (
        <div className="mt-4">
          <SegmentedControl
            label="Amounts for"
            size="sm"
            value={amount}
            onChange={setAmount}
            options={[
              { value: "portion", label: "This portion" },
              { value: "batch", label: `Batch for ${repeats.length} days` },
            ]}
          />
        </div>
      ) : null}

      <h3 className="t-label mt-5 mb-2">Ingredients{amount === "batch" ? `, ${servingsLabel(weekServings)}` : ""}</h3>
      <ul className="divide-y divide-line rounded-[14px] border border-line">
        {recipe.ingredients.map((i) => (
          <li key={`${i.name}-${i.unit}`} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
            <span className="min-w-0 text-[15px] text-ink">{displayName(i.name)}</span>
            <span className="tnum shrink-0 text-[15px] text-ink-2">{amountLabel(i.quantity * scale, i.unit)}</span>
          </li>
        ))}
      </ul>

      <h3 className="t-label mt-5 mb-2">Steps</h3>
      <ol className="flex flex-col gap-3">
        {recipe.steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-snug text-ink">
            <span className="tnum flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[12px] font-semibold text-ink-2">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      {recipe.servings > 1 ? (
        <p className="mt-4 text-[13px] text-ink-3">
          The recipe as written makes {recipe.servings} servings. Steps describe the full batch, amounts above are scaled.
        </p>
      ) : null}
    </Sheet>
  );
}
