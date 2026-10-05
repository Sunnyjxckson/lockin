"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Lock, Plus, Star, Utensils, X } from "lucide-react";
import { ActionButton, EmptyState, GlassCard, IconButton, List, ListRow, ProgressBar, SectionLabel, useToast } from "@/components/ui";
import { useChecklist, useInstalledOn, useList, useNow, useSettings, useToday } from "@/lib/db/hooks";
import { haptics } from "@/lib/haptics";
import { budgetGoal, goalFromTarget, mealTotals, NO_GOAL, ringFor, type Goals } from "@/lib/logic/body";
import { addDays, formatDateLong, formatTime, isDayEditable } from "@/lib/logic/dates";
import { targetOn } from "@/lib/logic/targets";
import { usePhoto } from "@/lib/storage/hooks";
import type { DateStr, SavedMeal } from "@/lib/types";
import { logFavorite, removeFavorite } from "./data";
import { CaloriesHero, MacroStats } from "./Eating";
import { fmt } from "./format";
import type { MealSheetState } from "./MealSheet";

const MealSheet = dynamic(() => import("./MealSheet").then((m) => m.MealSheet), { ssr: false });

/** A meal's photo, small. Nothing at all when there is no photo. */
function Thumb({ photo }: { photo: string | null }) {
  const url = usePhoto(photo);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="size-11 rounded-[14px] object-cover" />;
}

function macroLine(m: { protein: number; carbs: number; fat: number }): string {
  return `P ${fmt(m.protein)}  C ${fmt(m.carbs)}  F ${fmt(m.fat)}`;
}

export function FoodTab() {
  const today = useToday();
  const now = useNow();
  const installedOn = useInstalledOn();
  const toast = useToast();
  const [picked, setPicked] = useState<DateStr | null>(null);
  const date = picked ?? today;
  const isToday = date === today;
  const editable = isDayEditable(date, now, installedOn);

  const { data: meals, loading } = useList("meal", { eq: { date }, orderBy: "time" });
  const { data: saved } = useList("saved_meal");
  const { data: checklist } = useChecklist();
  const { data: settings } = useSettings();

  const [sheet, setSheet] = useState<(MealSheetState & { key: number }) | null>(null);
  const [managing, setManaging] = useState(false);
  const [logging, setLogging] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const open = (s: MealSheetState) => {
    seq.current += 1;
    setSheet({ ...s, key: seq.current });
  };

  const totals = useMemo(() => mealTotals(meals), [meals]);
  const goals: Goals = useMemo(() => {
    const find = (key: string) => {
      const item = checklist.items.find((i) => i.key === key);
      return item ? goalFromTarget(targetOn(item, checklist.versions, date)) : NO_GOAL;
    };
    return {
      calories: find("calories"),
      protein: find("protein"),
      carbs: budgetGoal(settings?.carbs_target),
      fat: budgetGoal(settings?.fat_target),
    };
  }, [checklist, settings, date]);

  const favorites = useMemo(
    () => [...saved].sort((a, b) => (b.use_count ?? 0) - (a.use_count ?? 0) || a.name.localeCompare(b.name)),
    [saved],
  );

  const relog = async (s: SavedMeal) => {
    if (logging) return;
    setLogging(s.id);
    try {
      await logFavorite(s, date);
      haptics.done();
      toast(`${s.name} logged`, { kind: "done" });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not log it", { kind: "error" });
    } finally {
      setLogging(null);
    }
  };

  const cal = ringFor(totals.calories, goals.calories);

  return (
    <div className="animate-fade-in">
      <div className="-mx-2.5 mt-2 flex items-center justify-between">
        <IconButton label="Previous day" onClick={() => setPicked(addDays(date, -1))}>
          <ChevronLeft size={20} strokeWidth={1.75} aria-hidden />
        </IconButton>
        <button type="button" className="pressable t-label min-h-11 px-3 text-center text-ink" onClick={() => setPicked(null)} disabled={isToday} aria-label={isToday ? `Today, ${formatDateLong(date)}` : `${formatDateLong(date)}. Back to today`}>
          {isToday ? "Today" : formatDateLong(date)}
        </button>
        <IconButton label="Next day" disabled={isToday} onClick={() => setPicked(date >= addDays(today, -1) ? null : addDays(date, 1))}>
          <ChevronRight size={20} strokeWidth={1.75} aria-hidden />
        </IconButton>
      </div>

      <section className="pt-2" aria-label="Calories">
        <CaloriesHero totals={totals} goals={goals} />
      </section>

      <GlassCard className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="t-label">Eaten</p>
            <p className="mt-1.5 flex items-baseline gap-2">
              <span className="t-h1">{fmt(totals.calories)}</span>
              <span className="text-[14px] text-ink-2">kcal</span>
            </p>
          </div>
          {editable ? (
            <div className="flex shrink-0 items-center gap-2">
              <IconButton filled label="Snap a meal" onClick={() => file.current?.click()}>
                <Camera size={19} strokeWidth={1.75} aria-hidden />
              </IconButton>
              <ActionButton label="Add by hand" onClick={() => open({ mode: "new" })}>
                <Plus size={24} strokeWidth={1.75} aria-hidden />
              </ActionButton>
              <input
                ref={file}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="Meal photo"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) open({ mode: "new", photo: f });
                }}
              />
            </div>
          ) : (
            <span className="t-label flex shrink-0 items-center gap-1.5">
              <Lock size={13} aria-hidden />
              Locked
            </span>
          )}
        </div>
        <ProgressBar className="mt-4" value={cal.fill} tone={cal.state === "over" ? "warn" : "accent"} label="Calories against the target" />
        {!editable ? <p className="t-sub mt-3">Meals can change until noon the next day.</p> : null}
      </GlassCard>

      <div className="mt-6">
        <MacroStats totals={totals} goals={goals} />
      </div>

      <section className="mt-7" aria-label="Meals">
        <SectionLabel right={meals.length > 0 ? meals.length : undefined}>Meals</SectionLabel>
        {meals.length > 0 ? (
          <List className="mt-1.5">
            {meals.map((m) => (
              <ListRow
                key={m.id}
                left={m.photo_url ? <Thumb photo={m.photo_url} /> : undefined}
                title={m.name ?? "Meal"}
                sub={<span className="whitespace-pre">{`${formatTime(m.time)}, ${macroLine(m)}`}</span>}
                value={fmt(m.calories)}
                onClick={editable ? () => open({ mode: "edit", meal: m }) : undefined}
              />
            ))}
          </List>
        ) : loading ? null : (
          <EmptyState
            compact
            icon={<Utensils size={22} strokeWidth={1.75} aria-hidden />}
            title={isToday ? "Nothing eaten yet" : "No meals logged"}
            body={editable ? "Snap a photo or add a meal by hand." : undefined}
          />
        )}
      </section>

      <section className="mt-7" aria-label="Favorites">
        <SectionLabel
          right={
            favorites.length > 0 ? (
              <button type="button" className="pressable t-label -my-3 min-h-11 pl-3 text-ink" onClick={() => setManaging((v) => !v)}>
                {managing ? "Done" : "Edit"}
              </button>
            ) : undefined
          }
        >
          Favorites
        </SectionLabel>
        {favorites.length > 0 ? (
          <List className="mt-1.5">
            {favorites.map((s) => (
              <ListRow
                key={s.id}
                className="!pr-0"
                left={s.photo_url ? <Thumb photo={s.photo_url} /> : undefined}
                title={s.name}
                sub={<span className="whitespace-pre">{`${fmt(s.calories)} kcal, ${macroLine(s)}`}</span>}
                right={
                  managing ? (
                    <IconButton label={`Remove ${s.name} from favorites`} className="text-danger" onClick={() => removeFavorite(s).then(() => toast("Removed from favorites"))}>
                      <X size={20} strokeWidth={1.75} aria-hidden />
                    </IconButton>
                  ) : (
                    <IconButton label={`Log ${s.name}`} filled disabled={!editable || logging === s.id} onClick={() => relog(s)}>
                      <Plus size={20} strokeWidth={1.75} aria-hidden />
                    </IconButton>
                  )
                }
              />
            ))}
          </List>
        ) : (
          <p className="tile t-sub mt-3 flex items-center gap-2.5 rounded-[20px] px-4 py-3">
            <Star size={16} strokeWidth={1.75} className="shrink-0" aria-hidden />
            No favorites yet. Save a meal as one and it logs in a tap.
          </p>
        )}
      </section>

      {sheet ? <MealSheet key={sheet.key} state={sheet} date={date} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}
