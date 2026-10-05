"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button, NumberField, Select, Sheet, TextField, useToast } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { dollars, findFood, recipeNumbers, SLOT_LABEL, SLOTS, UNITS, unitsFor, type IngredientLine } from "@/lib/logic/meals";
import { FOODS } from "@/lib/logic/mealsFoods";
import { displayName } from "@/lib/logic/mealsGrocery";
import type { MealSlot, Recipe } from "@/lib/types";
import { deleteRecipe, FOOD_INDEX, saveRecipe } from "./data";
import { Est, fmt } from "./parts";

const OTHER = "@other";
const FOOD_OPTIONS = [
  ...[...FOODS].sort((a, b) => a.name.localeCompare(b.name)).map((f) => ({ value: f.name, label: displayName(f.name) })),
  { value: OTHER, label: "Something else" },
];

interface Row {
  key: number;
  /** A food table name, or OTHER. */
  food: string;
  /** The typed name when food is OTHER. */
  custom: string;
  quantity: number | null;
  unit: string;
  cost: number | null;
}

let nextKey = 1;

function rowFrom(i: { name: string; quantity: number; unit: string; est_cost: number | null }): Row {
  const food = findFood(FOOD_INDEX, i.name);
  nextKey += 1;
  return food
    ? { key: nextKey, food: food.name, custom: "", quantity: i.quantity, unit: i.unit, cost: null }
    : { key: nextKey, food: OTHER, custom: i.name, quantity: i.quantity, unit: i.unit, cost: i.est_cost };
}

function blank(): Row {
  nextKey += 1;
  return { key: nextKey, food: "chicken breast", custom: "", quantity: null, unit: "g", cost: null };
}

/** Add or edit a recipe. Calories, macros and estimated cost are worked out from the ingredients as you type. */
export function RecipeEditor({ recipe, defaultSlot, onClose }: { recipe: Recipe | null; defaultSlot: MealSlot; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(recipe?.name ?? "");
  const [slot, setSlot] = useState<MealSlot>(recipe?.slot ?? defaultSlot);
  const [servings, setServings] = useState<number | null>(recipe?.servings ?? 1);
  const [rows, setRows] = useState<Row[]>(recipe ? recipe.ingredients.map(rowFrom) : [blank()]);
  const [steps, setSteps] = useState(recipe?.steps.join("\n") ?? "");
  const [manual, setManual] = useState({
    calories: recipe?.calories ?? null,
    protein: recipe?.protein ?? null,
    carbs: recipe?.carbs ?? null,
    fat: recipe?.fat ?? null,
  } as Record<"calories" | "protein" | "carbs" | "fat", number | null>);
  const [busy, setBusy] = useState(false);

  const lines: IngredientLine[] = useMemo(
    () =>
      rows
        .filter((r) => r.quantity !== null && r.quantity > 0 && (r.food !== OTHER || r.custom.trim() !== ""))
        .map((r) => (r.food === OTHER ? { name: r.custom.trim(), quantity: r.quantity!, unit: r.unit, est_cost: r.cost ?? 0, category: "other" } : { name: r.food, quantity: r.quantity!, unit: r.unit })),
    [rows],
  );
  const n = useMemo(() => recipeNumbers(lines, servings ?? 1, FOOD_INDEX), [lines, servings]);
  const hasOther = n.unknown.length > 0;
  const shown = hasOther
    ? { calories: manual.calories ?? n.calories, protein: manual.protein ?? n.protein, carbs: manual.carbs ?? n.carbs, fat: manual.fat ?? n.fat }
    : n;
  const canSave = name.trim().length > 0 && lines.length > 0 && (servings ?? 0) > 0 && !busy;

  const patch = (key: number, p: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await saveRecipe(
        {
          name,
          slot,
          servings: servings ?? 1,
          lines,
          steps: steps.split("\n"),
          manual: hasOther ? { calories: shown.calories, protein: shown.protein, carbs: shown.carbs, fat: shown.fat } : null,
        },
        recipe,
      );
      haptics.done();
      toast(recipe ? "Recipe saved" : "Recipe added", { kind: "done" });
      onClose();
    } catch (e) {
      haptics.error();
      toast(e instanceof Error ? e.message : "Could not save the recipe", { kind: "error" });
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!recipe || busy) return;
    setBusy(true);
    try {
      await deleteRecipe(recipe);
      toast("Recipe deleted");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not delete the recipe", { kind: "error" });
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={recipe ? "Edit recipe" : "New recipe"}
      footer={
        <div className="flex flex-col gap-2.5">
          <p className="t-sub px-1" role="status" data-recipe-numbers>
            Per serving: <span className="text-ink">{fmt(shown.calories)} kcal</span>, <span className="text-ink">{fmt(shown.protein)}g protein</span>, {fmt(shown.carbs)}g carbs, {fmt(shown.fat)}g fat, <Est>{dollars(n.est_cost)}</Est>
          </p>
          <div className="flex gap-2.5">
            {recipe?.source === "user" ? (
              <Button variant="danger" size="lg" onClick={remove} disabled={busy} icon={<Trash2 size={18} aria-hidden />} aria-label="Delete recipe">
                Delete
              </Button>
            ) : null}
            <Button full size="lg" onClick={save} disabled={!canSave} loading={busy}>
              {recipe ? "Save recipe" : "Add recipe"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="Name" value={name} onChange={setName} placeholder="Chicken and rice" maxLength={60} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Meal" value={slot} onChange={setSlot} options={SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] }))} />
          <NumberField label="Makes" unit="servings" value={servings} onChange={setServings} live min={1} max={24} decimal={false} />
        </div>

        <div>
          <p className="t-label">Ingredients, whole batch</p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {rows.map((r, index) => {
              const food = r.food === OTHER ? null : findFood(FOOD_INDEX, r.food);
              const units = food ? unitsFor(food) : [...UNITS];
              return (
                <li key={r.key} className="rounded-[20px] border border-line bg-surface-2 p-2.5">
                  <div className="flex items-center gap-2">
                    <Select
                      className="min-w-0 flex-1"
                      value={r.food}
                      onChange={(v) => {
                        const f = v === OTHER ? null : findFood(FOOD_INDEX, v);
                        patch(r.key, { food: v, unit: f ? (unitsFor(f).includes(r.unit) ? r.unit : f.base) : r.unit });
                      }}
                      options={FOOD_OPTIONS}
                    />
                    <button
                      type="button"
                      aria-label={`Remove ingredient ${index + 1}`}
                      onClick={() => setRows((all) => (all.length > 1 ? all.filter((x) => x.key !== r.key) : all))}
                      className="pressable flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2"
                    >
                      <X size={18} aria-hidden />
                    </button>
                  </div>
                  {r.food === OTHER ? (
                    <div className="mt-2 grid grid-cols-[1fr_112px] gap-2">
                      <TextField value={r.custom} onChange={(v) => patch(r.key, { custom: v })} placeholder="Ingredient name" maxLength={40} />
                      <NumberField value={r.cost} onChange={(v) => patch(r.key, { cost: v })} live prefix="$" placeholder="Cost" max={200} />
                    </div>
                  ) : null}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <NumberField value={r.quantity} onChange={(v) => patch(r.key, { quantity: v })} live placeholder="Amount" max={20000} />
                    <Select value={units.includes(r.unit) ? r.unit : units[0]} onChange={(v) => patch(r.key, { unit: v })} options={units.map((u) => ({ value: u, label: u }))} />
                  </div>
                </li>
              );
            })}
          </ul>
          <Button className="mt-3" variant="secondary" size="sm" onClick={() => setRows((all) => [...all, blank()])} icon={<Plus size={16} aria-hidden />}>
            Add ingredient
          </Button>
        </div>

        {hasOther ? (
          <div className="rounded-[20px] border border-warn-line bg-warn-soft p-3.5">
            <p className="text-[14px] text-ink">
              {n.unknown.join(", ")} {n.unknown.length === 1 ? "is" : "are"} not in the food table. Type the macros per serving.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <NumberField label="Calories" unit="kcal" value={manual.calories} onChange={(v) => setManual((m) => ({ ...m, calories: v }))} live decimal={false} />
              <NumberField label="Protein" unit="g" value={manual.protein} onChange={(v) => setManual((m) => ({ ...m, protein: v }))} live />
              <NumberField label="Carbs" unit="g" value={manual.carbs} onChange={(v) => setManual((m) => ({ ...m, carbs: v }))} live />
              <NumberField label="Fat" unit="g" value={manual.fat} onChange={(v) => setManual((m) => ({ ...m, fat: v }))} live />
            </div>
          </div>
        ) : null}

        <TextField label="Steps" value={steps} onChange={setSteps} rows={4} maxLength={2000} placeholder="One step per line" />
      </div>
    </Sheet>
  );
}
