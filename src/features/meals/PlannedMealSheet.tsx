"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Check, ChefHat, Minus, Plus } from "lucide-react";
import { Button, SegmentedControl, Sheet, cn, useToast } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { formatDateLong } from "@/lib/logic/dates";
import { amountLabel, dollars, round, servingsLabel, SLOT_LABEL } from "@/lib/logic/meals";
import { displayName } from "@/lib/logic/mealsGrocery";
import { applySwap, summarizePlan, swapOptions, type SwapOption, type SwapScope } from "@/lib/logic/mealsPlanner";
import type { DateStr, MealSlot, Recipe } from "@/lib/types";
import { logCooked, savePlan, type Planned } from "./data";
import { Est, IngredientList, MacroRow, StepList, fmt, macroLine } from "./parts";
import type { MealsState } from "./useMeals";

function signedMoney(n: number): string {
  if (Math.abs(n) < 0.005) return "no change";
  return `${n > 0 ? "+" : "-"}${dollars(Math.abs(n))}`;
}

/** Portions move in quarters, from a quarter serving to four. */
const PORTION_STEP = 0.25;
const PORTION_MIN = 0.25;
const PORTION_MAX = 4;

/** One planned meal: the recipe scaled to the planned portion, the portion itself, "Cooked, log it", and swap. */
export function PlannedMealSheet({ m, date, slot, onClose }: { m: MealsState; date: DateStr; slot: MealSlot; onClose: () => void }) {
  const toast = useToast();
  const [view, setView] = useState<"cook" | "swap">("cook");
  const [amount, setAmount] = useState<"portion" | "batch">("portion");
  const [scope, setScope] = useState<SwapScope>("day");
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The portion being tried. Null until it is changed, then it is saved or put back.
  const [draft, setDraft] = useState<number | null>(null);

  const meal = m.meals.find((x) => x.date === date && x.slot === slot) ?? null;
  const recipe: Recipe | null = meal ? (m.recipeById.get(meal.recipe_id) ?? null) : null;
  const repeats = meal ? m.meals.filter((x) => x.slot === slot && x.recipe_id === meal.recipe_id) : [];
  const weekServings = repeats.reduce((a, x) => a + x.servings, 0);
  const portion = draft ?? meal?.servings ?? 1;
  const changed = !!meal && draft !== null && Math.abs(draft - meal.servings) > 0.001;
  // The week as it would be with this portion: the day's numbers and the week's cost follow every tap.
  const preview = useMemo(
    () => (changed && meal ? summarizePlan(m.meals.map((x) => (x.date === date && x.slot === slot ? { ...x, servings: portion } : x)), m.ctx, m.dates) : m.summary),
    [changed, meal, portion, m.meals, m.ctx, m.dates, m.summary, date, slot],
  );
  const savedDay = m.summary?.days.find((d) => d.date === date) ?? null;
  const day = preview?.days.find((d) => d.date === date) ?? savedDay;

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
  const scale = (amount === "batch" ? weekServings - meal.servings + portion : portion) / (recipe.servings > 0 ? recipe.servings : 1);
  const step = (by: number) => {
    haptics.tap();
    const next = Math.min(PORTION_MAX, Math.max(PORTION_MIN, Math.round((portion + by) / PORTION_STEP) * PORTION_STEP));
    setDraft(Math.abs(next - meal.servings) < 0.001 ? null : next);
  };

  const savePortion = async () => {
    if (!changed || busy) return;
    setBusy(true);
    try {
      const next = m.meals.map((x) => (x.date === date && x.slot === slot ? { ...x, servings: portion } : x));
      await savePlan(m.weekStart, next, m.plan!.budget, m.store, { recipes: m.recipes, book: m.book });
      haptics.done();
      toast(`Portion set to ${servingsLabel(portion)}`, { kind: "done" });
      setDraft(null);
    } catch (e) {
      haptics.error();
      toast(e instanceof Error ? e.message : "Could not save the portion", { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

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
        subtitle={`For ${recipe.name}. Best fit first.`}
        footer={
          <div className="flex flex-col gap-2.5">
            {choice ? (
              <div className="t-sub flex flex-col gap-0.5 px-1" role="status" data-swap-effect>
                <p>
                  Day: <span className={choice.day.ok ? "text-ink" : "text-warn"}>{macroLine(choice.day.calories, choice.day.protein)}</span>
                  {choice.day.ok ? null : <span className="text-warn"> (off target)</span>}
                </p>
                <p>
                  Week: <Est className="text-ink">{dollars(choice.weekCost)}</Est>
                  <span className={choice.overBudget ? "text-warn" : undefined}>
                    {" "}
                    ({signedMoney(choice.costDelta)}
                    {choice.overBudget ? ", over budget" : ""})
                  </span>
                </p>
              </div>
            ) : null}
            <div className="flex gap-2.5">
              <Button variant="secondary" size="lg" onClick={() => setView("cook")} disabled={busy}>
                Back
              </Button>
              <Button full size="lg" onClick={confirmSwap} disabled={!choice} loading={busy}>
                {choice ? "Confirm swap" : "Pick a meal"}
              </Button>
            </div>
          </div>
        }
      >
        {repeats.length > 1 ? (
          <SegmentedControl
            label="How much to swap"
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
                  className={cn("pressable flex min-h-[60px] w-full items-center gap-3 rounded-[20px] border px-4 py-3 text-left", on ? "border-ink bg-surface-3" : "border-line bg-surface-2")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-ink">{o.recipe.name}</span>
                    <span className="t-caption mt-1 block text-ink-2">
                      {servingsLabel(o.servings)}, day {macroLine(o.day.calories, o.day.protein)}
                    </span>
                    <span className="t-caption mt-0.5 flex flex-wrap gap-x-2 empty:hidden">
                      {o.liked ? <span className="text-accent">You like this</span> : null}
                      {!o.day.ok ? <span className="text-warn">Day off target</span> : null}
                      {o.overBudget ? <span className="text-warn">Over budget</span> : null}
                    </span>
                  </span>
                  <span className="shrink-0 text-[14px] text-ink">{signedMoney(o.costDelta)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {options.length === 0 ? <p className="t-sub mt-4">No other {SLOT_LABEL[slot].toLowerCase()} recipes fit your dislikes. Add one in Recipes.</p> : null}
        <p className="t-caption mt-3 px-1 text-ink-2">Dollar changes are estimates.</p>
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
        changed ? (
          <div className="flex gap-2.5">
            <Button variant="secondary" size="lg" onClick={() => setDraft(null)} disabled={busy}>
              Put back
            </Button>
            <Button full size="lg" onClick={savePortion} loading={busy} icon={<Check size={18} aria-hidden />}>
              Save portion
            </Button>
          </div>
        ) : (
          <div className="flex gap-2.5">
            <Button variant="secondary" size="lg" onClick={() => setView("swap")} disabled={busy || logged} icon={<ArrowLeftRight size={18} strokeWidth={1.75} aria-hidden />}>
              Swap
            </Button>
            <Button full size="lg" onClick={log} disabled={!canLog} loading={busy} icon={logged ? <Check size={18} aria-hidden /> : <ChefHat size={18} aria-hidden />}>
              {logged ? "Logged" : date > m.today ? "Log it on the day" : "Cooked, log it"}
            </Button>
          </div>
        )
      }
    >
      <MacroRow calories={recipe.calories * portion} protein={recipe.protein * portion} carbs={recipe.carbs * portion} fat={recipe.fat * portion} />
      <div className="mt-5 flex items-center gap-3 rounded-[20px] border border-line bg-surface-2 py-2.5 pr-2.5 pl-4" data-portion>
        <div className="min-w-0 flex-1">
          <p className="t-label">Your portion</p>
          <p className="mt-1.5 text-[16px] font-medium tracking-[-0.01em] text-ink" data-portion-value>
            {servingsLabel(portion)}
            <span className="text-[14px] font-normal tracking-normal text-ink-2">
              , <Est>{dollars(round(recipe.est_cost * portion, 2))}</Est>
            </span>
          </p>
        </div>
        {logged ? null : (
          <div className="flex shrink-0 gap-2">
            <button type="button" aria-label="Smaller portion" disabled={busy || portion <= PORTION_MIN} onClick={() => step(-PORTION_STEP)} className="pressable flex size-11 items-center justify-center rounded-full border border-line bg-surface-3 text-ink disabled:text-ink-3">
              <Minus size={18} strokeWidth={1.75} aria-hidden />
            </button>
            <button type="button" aria-label="Larger portion" disabled={busy || portion >= PORTION_MAX} onClick={() => step(PORTION_STEP)} className="pressable flex size-11 items-center justify-center rounded-full border border-line bg-surface-3 text-ink disabled:text-ink-3">
              <Plus size={18} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        )}
      </div>
      {day && preview ? (
        <div className="t-sub mt-3 flex flex-col gap-0.5 px-1" role="status" data-portion-effect>
          <p>
            Day:{" "}
            <span className={day.ok ? "text-ink" : "text-warn"} data-portion-day>
              {macroLine(day.calories, day.protein)}
            </span>
            {day.ok ? null : <span className="text-warn"> (off target)</span>}
          </p>
          <p>
            Week:{" "}
            <span className="text-ink" data-portion-week>
              <Est>{dollars(preview.cost)}</Est>
            </span>
            <span className={preview.cost > preview.budget + 0.004 ? "text-warn" : undefined}>
              {" "}
              of {dollars(preview.budget)}
              {changed && m.summary ? ` (${signedMoney(preview.cost - m.summary.cost)})` : ""}
            </span>
          </p>
        </div>
      ) : null}

      {repeats.length > 1 ? (
        <div className="mt-4">
          <SegmentedControl
            label="Amounts for"
            value={amount}
            onChange={setAmount}
            options={[
              { value: "portion", label: "This portion" },
              { value: "batch", label: `Batch for ${repeats.length} days` },
            ]}
          />
        </div>
      ) : null}

      <h3 className="t-label mt-6 mb-2.5">Ingredients{amount === "batch" ? `, ${servingsLabel(weekServings)}` : ""}</h3>
      <IngredientList rows={recipe.ingredients.map((i) => ({ key: `${i.name}-${i.unit}`, name: displayName(i.name), amount: amountLabel(i.quantity * scale, i.unit) }))} />

      <h3 className="t-label mt-6 mb-3">Steps</h3>
      <StepList steps={recipe.steps} />
      {recipe.servings > 1 ? <p className="t-caption mt-4 text-ink-2">Steps describe the full batch of {recipe.servings} servings. Amounts above are scaled.</p> : null}
    </Sheet>
  );
}
