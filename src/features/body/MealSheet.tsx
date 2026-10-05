"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Star, Trash2 } from "lucide-react";
import { Button, NumberField, Sheet, TextField, Toggle, useToast } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { blobToDataUrl, resizeImage } from "@/lib/storage";
import { useObjectUrl, usePhoto } from "@/lib/storage/hooks";
import type { DateStr, Meal } from "@/lib/types";
import { addMeal, deleteMeal, saveFavorite, storeMealPhoto, updateMeal } from "./data";

export type MealSheetState = { mode: "new"; photo?: File } | { mode: "edit"; meal: Meal };

interface Estimate {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  note?: string;
}

type Read = "idle" | "reading" | "ai" | "fallback";

/** Dashes never reach the screen, whatever the model sends. */
function noDashes(text: string): string {
  return text.replace(/\s*[\u2012-\u2015]\s*/g, ", ");
}

async function estimate(photo: Blob): Promise<Estimate | null> {
  const small = await resizeImage(photo, 1024, 0.8);
  const image = await blobToDataUrl(small);
  const res = await fetch("/api/body/meal-estimate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ image }),
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as { source?: string; estimate?: Estimate } | null;
  return json?.source === "ai" && json.estimate ? json.estimate : null;
}

/** Add or edit a meal. Mount it with a fresh key each time it opens. */
export function MealSheet({ state, date, onClose }: { state: MealSheetState; date: DateStr; onClose: () => void }) {
  const toast = useToast();
  const editing = state.mode === "edit" ? state.meal : null;
  const photo = state.mode === "new" ? (state.photo ?? null) : null;

  const [name, setName] = useState(editing?.name ?? "");
  const [calories, setCalories] = useState<number | null>(editing ? editing.calories : null);
  const [protein, setProtein] = useState<number | null>(editing ? editing.protein : null);
  const [carbs, setCarbs] = useState<number | null>(editing ? editing.carbs : null);
  const [fat, setFat] = useState<number | null>(editing ? editing.fat : null);
  const [favorite, setFavorite] = useState(false);
  const [read, setRead] = useState<Read>(photo ? "reading" : "idle");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const touched = useRef(false);

  const preview = useObjectUrl(photo);
  const stored = usePhoto(editing?.photo_url);

  useEffect(() => {
    if (!photo) return;
    let live = true;
    estimate(photo)
      .catch(() => null)
      .then((e) => {
        if (!live) return;
        if (!e) {
          setRead("fallback");
          return;
        }
        // Never overwrite what was typed while the photo was being read.
        if (!touched.current) {
          setName(noDashes(e.name));
          setCalories(e.calories);
          setProtein(e.protein);
          setCarbs(e.carbs);
          setFat(e.fat);
        }
        setNote(noDashes(e.note ?? ""));
        setRead("ai");
        haptics.tap();
      });
    return () => {
      live = false;
    };
  }, [photo]);

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    touched.current = true;
    set(v);
  };

  const empty = calories === null && protein === null && carbs === null && fat === null;
  const canSave = !busy && read !== "reading" && !empty;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      const values = {
        name: name.trim() || null,
        calories: calories ?? 0,
        protein: protein ?? 0,
        carbs: carbs ?? 0,
        fat: fat ?? 0,
      };
      let photoUrl: string | null | undefined = editing ? undefined : null;
      if (photo) photoUrl = await storeMealPhoto(photo);
      if (editing) await updateMeal(editing, { ...values, photo_url: photoUrl });
      else await addMeal(date, { ...values, photo_url: photoUrl });
      if (favorite) await saveFavorite({ ...values, photo_url: photoUrl ?? editing?.photo_url ?? null });
      haptics.done();
      toast(favorite ? "Saved, and added to favorites" : editing ? "Meal updated" : "Meal logged", { kind: "done" });
      onClose();
    } catch (e) {
      haptics.error();
      toast(e instanceof Error ? e.message : "Could not save the meal", { kind: "error" });
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing || busy) return;
    setBusy(true);
    try {
      await deleteMeal(editing);
      toast("Meal deleted");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not delete the meal", { kind: "error" });
      setBusy(false);
    }
  };

  const image = preview ?? stored;

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing ? "Edit meal" : photo ? "Snap a meal" : "Add a meal"}
      footer={
        <div className="flex gap-2.5">
          {editing ? (
            <Button variant="danger" onClick={remove} disabled={busy} icon={<Trash2 size={18} aria-hidden />} aria-label="Delete meal">
              Delete
            </Button>
          ) : null}
          <Button full onClick={save} disabled={!canSave} loading={busy}>
            {editing ? "Save" : "Log meal"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {image ? (
          <div className="relative overflow-hidden rounded-[16px] border border-line bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="Meal photo" className="h-44 w-full object-cover" />
            {read === "reading" ? (
              <div className="absolute inset-0 flex items-center justify-center gap-2.5 bg-black/60 text-[15px] font-medium">
                <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                Reading the photo
              </div>
            ) : null}
          </div>
        ) : null}

        {read === "ai" ? (
          <p className="flex items-start gap-2 rounded-[14px] bg-surface-2 px-3.5 py-3 text-[14px] text-ink-2">
            <Sparkles size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>Estimated from the photo. Fix anything that looks off. {note}</span>
          </p>
        ) : null}
        {read === "fallback" ? (
          <p className="rounded-[14px] bg-surface-2 px-3.5 py-3 text-[14px] text-ink-2">
            Photo estimates are off. The photo is attached, fill in the numbers by hand.
          </p>
        ) : null}

        <TextField label="Name" value={name} onChange={touch(setName)} placeholder="Chicken and rice" maxLength={80} />
        <NumberField label="Calories" unit="kcal" value={calories} onChange={touch(setCalories)} live decimal={false} max={9999} placeholder="0" />
        <div className="grid grid-cols-3 gap-2.5">
          <NumberField label="Protein" unit="g" value={protein} onChange={touch(setProtein)} live max={999} placeholder="0" />
          <NumberField label="Carbs" unit="g" value={carbs} onChange={touch(setCarbs)} live max={999} placeholder="0" />
          <NumberField label="Fat" unit="g" value={fat} onChange={touch(setFat)} live max={999} placeholder="0" />
        </div>
        <div className="flex min-h-[52px] items-center justify-between gap-3 rounded-[14px] border border-line px-3.5">
          <span className="flex items-center gap-2.5 text-[15px] font-medium">
            <Star size={18} className="text-ink-2" aria-hidden />
            Save as a favorite
          </span>
          <Toggle checked={favorite} onChange={setFavorite} label="Save as a favorite" />
        </div>
      </div>
    </Sheet>
  );
}
