"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BookOpen, Check, ChevronRight, Shuffle, ShoppingCart, SlidersHorizontal, UtensilsCrossed } from "lucide-react";
import { Button, Card, EmptyState, IconLink, PageHeader, ProgressBar, Screen, Section, SegmentedControl, Sheet, cn, useToast } from "@/components/ui";
import { useList } from "@/lib/db/hooks";
import { haptics } from "@/lib/haptics";
import { diffDays, formatDateShort, weekdayOf } from "@/lib/logic/dates";
import { describeTargets, dollars, servingsLabel, SLOT_LABEL, SLOTS } from "@/lib/logic/meals";
import { planWeek, type PlanPrefs } from "@/lib/logic/mealsPlanner";
import { pricesAt } from "@/lib/logic/mealsPricing";
import { cleanRequest, describeRequest, isEmptyRequest, parseRequest, toPrefs, type PlanRequest } from "@/lib/logic/mealsRequest";
import { getPref, setPref } from "@/lib/prefs";
import type { DateStr, MealSlot } from "@/lib/types";
import { saveFoodSettings, savePlan, setPreferredStore, type Planned } from "./data";
import { Est, EstimateNote, fmt, macroLine } from "./parts";
import { SetupForm, type SetupValues } from "./SetupForm";
import { currentWeek, rememberWeek, useKeepInStep, useMeals, type MealsState, type WeekChoice } from "./useMeals";

const PlannedMealSheet = dynamic(() => import("./PlannedMealSheet").then((x) => x.PlannedMealSheet));

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Ask the server to read a request with the model. Null means read it locally. */
async function askModel(text: string, m: MealsState): Promise<PlanRequest | null> {
  try {
    const words = [...new Set(m.recipes.flatMap((r) => [...r.tags, ...r.ingredients.map((i) => i.name)]))];
    const res = await fetch("/api/meals/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ text, words }),
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { source?: string; request?: unknown } | null;
    return json?.source === "ai" ? cleanRequest(json.request, m.recipes) : null;
  } catch {
    return null;
  }
}

export default function MealsScreen() {
  const toast = useToast();
  const [week, setWeekState] = useState<WeekChoice>(currentWeek());
  const setWeek = (w: WeekChoice) => {
    rememberWeek(w);
    setWeekState(w);
  };
  const m = useMeals(week);
  useKeepInStep(m);
  const [busy, setBusy] = useState(false);
  const [adjust, setAdjust] = useState(false);
  const [open, setOpen] = useState<{ date: DateStr; slot: MealSlot } | null>(null);
  // What the last build said, and the last ask, per week. Kept on the device.
  const [local, setLocal] = useState<Record<string, { note?: string; ask?: string }>>({});
  const noteKey = `meals:note:${m.weekStart}`;
  const askKey = `meals:ask:${m.weekStart}`;
  const note = local[m.weekStart]?.note ?? getPref(noteKey) ?? "";
  const ask = local[m.weekStart]?.ask ?? getPref(askKey) ?? "";
  const setNote = (text: string) => setLocal((all) => ({ ...all, [m.weekStart]: { ...all[m.weekStart], note: text } }));
  const setAsk = (text: string) => setLocal((all) => ({ ...all, [m.weekStart]: { ...all[m.weekStart], ask: text } }));
  const loggedMeals = useList("meal", { from: m.dates[0], to: m.dates[6] });

  const build = async (v: SetupValues, shuffle = false) => {
    if (busy) return;
    setBusy(true);
    try {
      await saveFoodSettings({ weekly_food_budget: v.budget, food_likes: v.likes, food_dislikes: v.dislikes });
      await setPreferredStore(v.store);

      let request: PlanRequest | null = null;
      if (v.ask) request = (await askModel(v.ask, m)) ?? parseRequest(v.ask, m.recipes);
      const budget = request?.budget ?? v.budget;
      if (request?.budget && request.budget !== v.budget) await saveFoodSettings({ weekly_food_budget: request.budget });
      const prefs: PlanPrefs | undefined = request && !isEmptyRequest(request) ? toPrefs(request) : undefined;

      const seedKey = `meals:seed:${m.weekStart}`;
      const seed = (Number(getPref(seedKey)) || diffDays("2026-01-05", m.weekStart)) + (shuffle ? 1 : 0);
      setPref(seedKey, String(seed));

      // Let the spinner paint before the planner takes the thread.
      await new Promise((r) => setTimeout(r, 40));
      const result = planWeek({ ...m.ctx, prices: pricesAt(m.source, v.store), likes: v.likes, dislikes: v.dislikes, budget, weekStart: m.weekStart, seed, prefs });
      if (result.status === "no_recipes") {
        haptics.error();
        setNote(result.message);
        setPref(noteKey, result.message);
        toast(result.message, { kind: "error", duration: 6000 });
        return;
      }
      // Days already behind us keep what was planned (and maybe eaten) on them.
      const past = m.meals.filter((x) => x.date < m.today);
      const pastDates = new Set(past.map((x) => x.date));
      const meals: Planned[] = [...past, ...result.meals.filter((x) => !pastDates.has(x.date))];
      await savePlan(m.weekStart, meals, budget, v.store, { recipes: m.recipes, book: { ...m.book, store: v.store } });

      const heard = request ? describeRequest(request) : "";
      const message = [result.message, heard ? `Heard: ${heard}` : ""].filter(Boolean).join(" ");
      setNote(message);
      setPref(noteKey, message || null);
      setAsk(v.ask);
      setPref(askKey, v.ask || null);
      setAdjust(false);
      if (result.status === "ok") {
        haptics.done();
        toast(shuffle ? "New week built" : "Week built", { kind: "done" });
      } else haptics.error();
    } catch (e) {
      haptics.error();
      toast(e instanceof Error ? e.message : "Could not build the week", { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const values: SetupValues = { budget: m.budget ?? 0, store: m.store, likes: m.likes, dislikes: m.dislikes, ask };
  const header = (
    <PageHeader
      title="Meals"
      back="/body"
      right={
        <IconLink href="/meals/recipes" label="Recipes">
          <BookOpen size={22} aria-hidden />
        </IconLink>
      }
    />
  );

  if (m.loading) {
    return (
      <Screen>
        {header}
        <div className="mt-4 flex flex-col gap-3" aria-busy="true" aria-label="Loading">
          <div className="h-12 rounded-[14px] bg-surface" />
          <div className="h-44 rounded-[20px] bg-surface" />
          <div className="h-64 rounded-[20px] bg-surface" />
        </div>
      </Screen>
    );
  }

  const weekPicker = (
    <SegmentedControl
      label="Week"
      value={week}
      onChange={setWeek}
      options={[
        { value: "this", label: "This week" },
        { value: "next", label: "Next week" },
      ]}
    />
  );

  if (!m.plan || m.meals.length === 0) {
    return (
      <Screen>
        {header}
        {weekPicker}
        <EmptyState
          compact
          icon={<UtensilsCrossed size={24} aria-hidden />}
          title={`No plan for the week of ${formatDateShort(m.weekStart)}`}
          body={`Set a budget and it builds 7 days from ${m.recipes.length} recipes that hit your numbers, with one grocery list.`}
        />
        {note ? <Notice text={note} /> : null}
        <Card>
          <SetupForm initial={values} targets={m.targets} challengeName={m.challengeName} busy={busy} submitLabel="Build the week" onSubmit={(v) => build(v)} />
        </Card>
      </Screen>
    );
  }

  const s = m.summary!;
  const budget = m.plan.budget;
  const over = s.cost > budget + 0.004;
  const bought = m.rows.filter((r) => r.bought && !m.pantry.has(r.name)).length;
  const toBuy = m.lines.filter((l) => !m.pantry.has(l.name)).length;
  const loggedIds = new Set(loggedMeals.data.map((x) => x.id));
  const order = week === "this" ? [...m.dates.filter((d) => d >= m.today), ...m.dates.filter((d) => d < m.today)] : m.dates;
  const firstPast = week === "this" ? order.findIndex((d) => d < m.today) : -1;

  return (
    <Screen>
      {header}
      {weekPicker}

      <Card className="mt-4" data-plan-cost>
        <p className="t-label">
          Week of {formatDateShort(m.weekStart)}, {m.store}
        </p>
        <div className="mt-1.5 flex items-baseline gap-2">
          <Est className="t-num">{dollars(s.cost)}</Est>
          <span className="text-[15px] text-ink-2">of {dollars(budget)}</span>
        </div>
        <ProgressBar className="mt-3" value={budget > 0 ? s.cost / budget : 1} tone={over ? "warn" : "ink"} label="Estimated cost against budget" />
        <p className={cn("mt-2.5 text-[15px]", over ? "text-warn" : "text-ink")}>
          {over ? `About ${dollars(s.overBy)} over budget.` : `About ${dollars(budget - s.cost)} under budget.`}
          <span className="text-ink-3"> The food you eat is about {dollars(s.foodCost)} of it. The rest is what is left in the packs.</span>
        </p>
        {m.spent > 0 ? (
          <p className="mt-1.5 text-[15px] text-ink">
            Spent so far: <span className="tnum font-semibold">{dollars(m.spent)}</span>
            <span className="text-ink-3">, {m.spent > budget ? `${dollars(m.spent - budget)} over budget` : `${dollars(budget - m.spent)} left`}.</span>
          </p>
        ) : null}
        <EstimateNote store={m.store} className="mt-2" />
        <Link
          href="/meals/grocery"
          className="pressable mt-4 flex h-12 items-center justify-center gap-2 rounded-[14px] bg-ink text-[16px] font-semibold text-bg"
        >
          <ShoppingCart size={18} aria-hidden />
          Grocery list, {toBuy} items{bought > 0 ? `, ${bought} bought` : ""}
        </Link>
        <div className="mt-2.5 flex gap-2.5">
          <Button full variant="secondary" loading={busy} onClick={() => build(values, true)} icon={<Shuffle size={18} aria-hidden />}>
            Shuffle
          </Button>
          <Button full variant="secondary" disabled={busy} onClick={() => setAdjust(true)} icon={<SlidersHorizontal size={18} aria-hidden />}>
            Adjust
          </Button>
        </div>
      </Card>

      {note ? <Notice text={note} /> : !s.allDaysOk ? <Notice text="Some days are off target after your changes. Swap a meal or shuffle the week." /> : null}

      <p className="mt-4 px-1 text-[13px] text-ink-3">
        Each day aims for {describeTargets(m.targets)}
        {m.challengeName ? `, from ${m.challengeName}` : ""}.
      </p>

      {order.map((date, index) => {
        const day = s.days.find((d) => d.date === date)!;
        const meals = SLOTS.map((slot) => m.meals.find((x) => x.date === date && x.slot === slot)).filter((x): x is Planned => !!x);
        const title = `${date === m.today ? "Today, " : ""}${DAY[weekdayOf(date)]} ${formatDateShort(date)}`;
        return (
          <div key={date}>
            {index === firstPast ? <p className="t-label mt-8 px-1">Earlier this week</p> : null}
            <Section
              title={title}
              right={
                <span className={cn("tnum text-[13px] tracking-normal normal-case", day.ok ? "text-ink-2" : "text-warn")}>
                  {macroLine(day.calories, day.protein)}
                </span>
              }
            >
              <Card padded={false} className="overflow-hidden">
                <ul className="divide-y divide-line">
                  {meals.map((meal) => {
                    const r = m.recipeById.get(meal.recipe_id);
                    const done = !!meal.logged && loggedIds.has(meal.logged);
                    return (
                      <li key={meal.slot}>
                        <button
                          type="button"
                          onClick={() => setOpen({ date, slot: meal.slot })}
                          className="pressable flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-surface-2"
                        >
                          <span
                            className={cn(
                              "flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
                              done ? "bg-accent text-accent-ink" : "bg-surface-3 text-ink-2",
                            )}
                            aria-hidden
                          >
                            {done ? <Check size={15} strokeWidth={3} /> : SLOT_LABEL[meal.slot][0]}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[16px] font-medium text-ink">{r?.name ?? "Recipe removed"}</span>
                            <span className="mt-0.5 block truncate text-[13px] text-ink-3">
                              {SLOT_LABEL[meal.slot]}
                              {r ? `, ${servingsLabel(meal.servings)}, ${fmt(r.calories * meal.servings)} kcal, ${fmt(r.protein * meal.servings)}g` : ""}
                              {done ? ", logged" : ""}
                            </span>
                          </span>
                          <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </Section>
          </div>
        );
      })}

      {open ? <PlannedMealSheet key={`${open.date}-${open.slot}`} m={m} date={open.date} slot={open.slot} onClose={() => setOpen(null)} /> : null}

      <Sheet open={adjust} onClose={() => (busy ? undefined : setAdjust(false))} title="Adjust the week" subtitle="Rebuilds from today on. Days behind you stay as they were.">
        <SetupForm key={String(adjust)} initial={values} targets={m.targets} challengeName={m.challengeName} busy={busy} submitLabel="Rebuild the week" onSubmit={(v) => build(v)} />
      </Sheet>
    </Screen>
  );
}

function Notice({ text }: { text: string }) {
  // "Heard: ..." alone is a confirmation, anything else is a problem to read.
  const plain = text.startsWith("Heard:");
  return (
    <Card className={cn("mt-3", plain ? "" : "border-warn bg-warn-soft")} role="status" data-plan-notice>
      <p className="text-[15px] leading-snug text-ink">{text}</p>
    </Card>
  );
}
