"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BookOpen, ChevronRight, Shuffle, SlidersHorizontal } from "lucide-react";
import { GlassCard, IconButton, IconLink, PageHeader, ProgressBar, Screen, SegmentedControl, Sheet, TrackStat, cn, useToast } from "@/components/ui";
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
import { Est, EstimateNote, MoneyHero, Note, fmt, macroLine } from "./parts";
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
          <BookOpen size={22} strokeWidth={1.75} aria-hidden />
        </IconLink>
      }
    />
  );

  if (m.loading) {
    return (
      <Screen>
        {header}
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
          <div className="tile h-[52px] rounded-full" />
          <div className="tile h-40 rounded-[26px]" />
          <div className="tile h-64 rounded-[26px]" />
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
        <section className="px-1 pt-7" aria-label="No plan">
          <p className="t-greeting text-ink">No plan for the week of {formatDateShort(m.weekStart)}</p>
          <p className="t-sub mt-2.5">
            Set a budget. It builds 7 days from {m.recipes.length} recipes, with one grocery list.
          </p>
        </section>
        {note ? <Notice text={note} /> : null}
        <GlassCard className="mt-5 overflow-hidden !py-5">
          <SetupForm initial={values} targets={m.targets} challengeName={m.challengeName} busy={busy} submitLabel="Build the week" onSubmit={(v) => build(v)} />
        </GlassCard>
      </Screen>
    );
  }

  const s = m.summary!;
  const budget = m.plan.budget;
  const over = s.cost > budget + 0.004;
  const bought = m.rows.filter((r) => r.bought && !m.pantry.has(r.name)).length;
  const toBuy = m.lines.filter((l) => !m.pantry.has(l.name)).length;
  const loggedIds = new Set(loggedMeals.data.map((x) => x.id));
  const slots = SLOTS.filter((slot) => m.meals.some((x) => x.slot === slot));
  const columns = { gridTemplateColumns: `50px repeat(${slots.length}, minmax(0, 1fr))` };

  return (
    <Screen>
      {header}
      {weekPicker}

      <section className="px-1 pt-4" data-plan-cost aria-label="Week cost">
        <MoneyHero label={`Est. at ${m.store}, week of ${formatDateShort(m.weekStart)}`} amount={dollars(s.cost)} />
        <ProgressBar className="mt-4" value={budget > 0 ? s.cost / budget : 1} tone={over ? "warn" : "accent"} label="Estimated cost against budget" />
        <p className="t-sub mt-3">
          <span className={over ? "text-warn" : "text-ink"}>{over ? `About ${dollars(s.overBy)} over budget` : `About ${dollars(budget - s.cost)} under budget`}</span> of {dollars(budget)}.
          {m.spent > 0 ? (
            <>
              {" "}
              Spent so far: <span className="text-ink">{dollars(m.spent)}</span>, {m.spent > budget ? `${dollars(m.spent - budget)} over budget` : `${dollars(budget - m.spent)} left`}.
            </>
          ) : null}
        </p>
        <EstimateNote store={m.store} className="mt-1.5" />
      </section>

      {note ? <Notice text={note} /> : !s.allDaysOk ? <Notice text="Some days are off target. Swap a meal or shuffle the week." /> : null}

      <section className="mt-5" aria-label="The week">
        <div className="grid items-end gap-1.5 pb-2" style={columns} aria-hidden>
          <span />
          {slots.map((slot) => (
            <span key={slot} className="t-caption truncate px-1 text-ink-2">
              {SLOT_LABEL[slot]}
            </span>
          ))}
        </div>
        <ul className="flex flex-col gap-1">
          {m.dates.map((date) => {
            const day = s.days.find((d) => d.date === date)!;
            const isToday = date === m.today;
            const name = `${isToday ? "Today, " : ""}${DAY[weekdayOf(date)]} ${formatDateShort(date)}`;
            return (
              <li key={date} className="grid items-stretch gap-1.5" style={columns} aria-label={`${name}, ${macroLine(day.calories, day.protein)}`}>
                <div className="flex min-w-0 flex-col justify-center pl-1">
                  <span className={cn("text-[13px] font-medium", isToday ? "text-accent" : "text-ink")}>
                    {DAY[weekdayOf(date)]} {Number(date.slice(8))}
                  </span>
                  <span className={cn("t-caption mt-0.5", day.ok ? "text-ink-2" : "text-warn")}>{fmt(day.calories)}</span>
                </div>
                {slots.map((slot) => {
                  const meal = m.meals.find((x) => x.date === date && x.slot === slot);
                  if (!meal) return <span key={slot} />;
                  const r = m.recipeById.get(meal.recipe_id);
                  const done = !!meal.logged && loggedIds.has(meal.logged);
                  const detail = `${SLOT_LABEL[slot]}${r ? `, ${servingsLabel(meal.servings)}, ${fmt(r.calories * meal.servings)} kcal, ${fmt(r.protein * meal.servings)}g` : ""}${done ? ", logged" : ""}`;
                  return (
                    <button
                      key={slot}
                      type="button"
                      data-meal-cell
                      onClick={() => setOpen({ date, slot })}
                      aria-label={`${r?.name ?? "Recipe removed"}. ${name}, ${detail}`}
                      className={cn(
                        "pressable flex min-h-[50px] min-w-0 items-center overflow-hidden rounded-[14px] border px-1.5 py-1 text-left transition-[background-color,border-color] duration-200",
                        done ? "grad border-transparent" : cn("tile text-ink", isToday && "border-ink-3"),
                      )}
                    >
                      <span className="line-clamp-3 text-[11.5px] leading-[1.2] tracking-[-0.01em] [overflow-wrap:anywhere]">{r?.name ?? "Recipe removed"}</span>
                      <span className="sr-only">{detail}</span>
                    </button>
                  );
                })}
              </li>
            );
          })}
        </ul>
        <p className="t-caption mt-3 px-1 text-ink-2">
          Each day: {describeTargets(m.targets)}
          {m.challengeName ? `, from ${m.challengeName}` : ""}.
        </p>
      </section>

      <GlassCard className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/meals/grocery" className="pressable -my-1 flex min-h-11 min-w-0 flex-1 flex-col justify-center">
            <span className="t-label">Grocery list</span>
            <span className="mt-1.5 flex items-baseline gap-2">
              <span className="t-h1 text-ink">{toBuy}</span>
              <span className="truncate text-[14px] text-ink-2">
                items{bought > 0 ? `, ${bought} bought` : ""}
              </span>
              <ChevronRight size={16} className="shrink-0 self-center text-ink-3" aria-hidden />
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <IconButton filled label="Shuffle" disabled={busy} onClick={() => build(values, true)}>
              {busy ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : <Shuffle size={18} strokeWidth={1.75} aria-hidden />}
            </IconButton>
            <IconButton filled label="Adjust" disabled={busy} onClick={() => setAdjust(true)}>
              <SlidersHorizontal size={18} strokeWidth={1.75} aria-hidden />
            </IconButton>
          </div>
        </div>
      </GlassCard>

      <div className="mt-6 grid grid-cols-3 gap-3.5 px-1">
        <TrackStat label="Food eaten" value={<Est>{dollars(Math.round(s.foodCost))}</Est>} />
        <TrackStat label="Left in packs" value={<Est>{dollars(Math.round(Math.max(0, s.cost - s.foodCost)))}</Est>} />
        <TrackStat label="A day" value={<Est>{dollars(Math.round((s.cost / 7) * 100) / 100)}</Est>} />
      </div>

      {open ? <PlannedMealSheet key={`${open.date}-${open.slot}`} m={m} date={open.date} slot={open.slot} onClose={() => setOpen(null)} /> : null}

      <Sheet open={adjust} onClose={() => (busy ? undefined : setAdjust(false))} title="Adjust the week" subtitle="Rebuilds from today on. Past days stay.">
        <SetupForm key={String(adjust)} initial={values} targets={m.targets} challengeName={m.challengeName} busy={busy} submitLabel="Rebuild the week" onSubmit={(v) => build(v)} />
      </Sheet>
    </Screen>
  );
}

function Notice({ text }: { text: string }) {
  // "Heard: ..." alone is a confirmation, anything else is a problem to read.
  const plain = text.startsWith("Heard:");
  return (
    <Note className="mt-5" warn={!plain} role="status" data-plan-notice>
      {text}
    </Note>
  );
}
