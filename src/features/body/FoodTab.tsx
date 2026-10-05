"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Lock, Plus, Star, Utensils, X } from "lucide-react";
import { Button, Card, EmptyState, IconButton, Section, cn, useToast } from "@/components/ui";
import { useChecklist, useInstalledOn, useList, useNow, useSettings, useToday } from "@/lib/db/hooks";
import { haptics } from "@/lib/haptics";
import { budgetGoal, goalFromTarget, mealTotals, NO_GOAL, type Goals } from "@/lib/logic/body";
import { addDays, formatDateLong, formatTime, isDayEditable } from "@/lib/logic/dates";
import { targetOn } from "@/lib/logic/targets";
import { usePhoto } from "@/lib/storage/hooks";
import type { DateStr, Meal, SavedMeal } from "@/lib/types";
import { logFavorite, removeFavorite } from "./data";
import { fmt } from "./format";
import { MacroRings } from "./MacroRings";
import type { MealSheetState } from "./MealSheet";

const MealSheet = dynamic(() => import("./MealSheet").then((m) => m.MealSheet), { ssr: false });

function Thumb({ photo, fallback }: { photo: string | null; fallback: React.ReactNode }) {
  const url = usePhoto(photo);
  return (
    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-surface-2 text-ink-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" className="size-full object-cover" /> : fallback}
    </span>
  );
}

function macroLine(m: { protein: number; carbs: number; fat: number }): string {
  return `P ${fmt(m.protein)}  C ${fmt(m.carbs)}  F ${fmt(m.fat)}`;
}

function MealRow({ meal, onOpen, disabled }: { meal: Meal; onOpen: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      className={cn("flex min-h-[64px] w-full items-center gap-3 px-4 py-2 text-left", !disabled && "pressable active:bg-surface-2")}
    >
      <Thumb photo={meal.photo_url} fallback={<Utensils size={18} aria-hidden />} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-medium">{meal.name ?? "Meal"}</span>
        <span className="tnum mt-0.5 block truncate text-[13px] whitespace-pre text-ink-3">
          {formatTime(meal.time)}, {macroLine(meal)}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="tnum block text-[17px] font-semibold">{fmt(meal.calories)}</span>
        <span className="block text-[12px] text-ink-3">kcal</span>
      </span>
    </button>
  );
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

  return (
    <>
      <div className="mt-4 flex items-center justify-between">
        <IconButton label="Previous day" onClick={() => setPicked(addDays(date, -1))}>
          <ChevronLeft size={22} aria-hidden />
        </IconButton>
        <button type="button" className="pressable min-h-11 px-3 text-center" onClick={() => setPicked(null)} disabled={isToday}>
          <span className="block text-[16px] font-semibold">{isToday ? "Today" : formatDateLong(date)}</span>
          {isToday ? <span className="block text-[13px] text-ink-3">{formatDateLong(date)}</span> : <span className="block text-[13px] text-ink-3">Tap for today</span>}
        </button>
        <IconButton label="Next day" disabled={isToday} onClick={() => setPicked(date >= addDays(today, -1) ? null : addDays(date, 1))}>
          <ChevronRight size={22} aria-hidden />
        </IconButton>
      </div>

      <div className="mt-2">
        <MacroRings totals={totals} goals={goals} />
      </div>

      {editable ? (
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Button icon={<Camera size={18} aria-hidden />} onClick={() => file.current?.click()}>
            Snap a meal
          </Button>
          <Button variant="secondary" icon={<Plus size={18} aria-hidden />} onClick={() => open({ mode: "new" })}>
            Add by hand
          </Button>
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
        <p className="mt-3 flex items-center gap-2 rounded-[14px] bg-surface px-3.5 py-3 text-[14px] text-ink-2">
          <Lock size={16} aria-hidden />
          This day is locked. Meals can be changed until noon the next day.
        </p>
      )}

      <Section title="Meals" right={meals.length > 0 ? <span className="tnum">{meals.length}</span> : undefined}>
        {meals.length > 0 ? (
          <Card padded={false} className="overflow-hidden">
            <div className="divide-y divide-line">
              {meals.map((m) => (
                <MealRow key={m.id} meal={m} disabled={!editable} onOpen={() => open({ mode: "edit", meal: m })} />
              ))}
            </div>
          </Card>
        ) : loading ? null : (
          <Card padded={false}>
            <EmptyState
              compact
              icon={<Utensils size={22} aria-hidden />}
              title={isToday ? "Nothing eaten yet" : "No meals logged"}
              body={editable ? "Snap a photo or add a meal by hand and the rings start to fill." : undefined}
            />
          </Card>
        )}
      </Section>

      <Section
        title="Favorites"
        right={
          favorites.length > 0 ? (
            <button type="button" className="pressable -my-2 min-h-11 pl-3 font-semibold text-ink-2" onClick={() => setManaging((v) => !v)}>
              {managing ? "Done" : "Edit"}
            </button>
          ) : undefined
        }
      >
        {favorites.length > 0 ? (
          <Card padded={false} className="overflow-hidden">
            <div className="divide-y divide-line">
              {favorites.map((s) => (
                <div key={s.id} className="flex min-h-[64px] items-center gap-3 py-2 pr-2.5 pl-4">
                  <Thumb photo={s.photo_url} fallback={<Star size={18} aria-hidden />} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-medium">{s.name}</span>
                    <span className="tnum mt-0.5 block truncate text-[13px] whitespace-pre text-ink-3">
                      {fmt(s.calories)} kcal, {macroLine(s)}
                    </span>
                  </span>
                  {managing ? (
                    <IconButton
                      label={`Remove ${s.name} from favorites`}
                      className="text-danger"
                      onClick={() => removeFavorite(s).then(() => toast("Removed from favorites"))}
                    >
                      <X size={20} aria-hidden />
                    </IconButton>
                  ) : (
                    <IconButton label={`Log ${s.name}`} filled disabled={!editable || logging === s.id} onClick={() => relog(s)}>
                      <Plus size={20} aria-hidden />
                    </IconButton>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card padded={false}>
            <EmptyState
              compact
              icon={<Star size={22} aria-hidden />}
              title="No favorites yet"
              body="Turn on Save as a favorite when you log a meal you eat often. After that it is one tap."
            />
          </Card>
        )}
      </Section>

      {sheet ? <MealSheet key={sheet.key} state={sheet} date={date} onClose={() => setSheet(null)} /> : null}
    </>
  );
}
