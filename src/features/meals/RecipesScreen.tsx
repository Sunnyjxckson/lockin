"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Pencil, Plus, Search } from "lucide-react";
import { Button, Card, EmptyState, IconButton, ListRow, PageHeader, Screen, SegmentedControl, Sheet } from "@/components/ui";
import { useList, useSettings } from "@/lib/db/hooks";
import { amountLabel, dollars, isExcluded, SLOT_LABEL, SLOTS } from "@/lib/logic/meals";
import { displayName } from "@/lib/logic/mealsGrocery";
import type { MealSlot, Recipe } from "@/lib/types";
import { ensureLibrary } from "./data";
import { Est, fmt } from "./parts";

const RecipeEditor = dynamic(() => import("./RecipeEditor").then((x) => x.RecipeEditor));

type Filter = MealSlot | "all";

export default function RecipesScreen() {
  const recipes = useList("recipe", { orderBy: "name" });
  const settings = useSettings();
  const [slot, setSlot] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<Recipe | null>(null);
  const [edit, setEdit] = useState<{ recipe: Recipe | null } | null>(null);

  useEffect(() => {
    void ensureLibrary().catch(() => undefined);
  }, []);

  const dislikes = settings.data?.food_dislikes ?? [];
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.data.filter(
      (r) => (slot === "all" || r.slot === slot) && (q === "" || r.name.toLowerCase().includes(q) || r.ingredients.some((i) => i.name.toLowerCase().includes(q)) || r.tags.includes(q)),
    );
  }, [recipes.data, slot, query]);

  // The open recipe follows edits made to it.
  const viewing = view ? (recipes.data.find((r) => r.id === view.id) ?? null) : null;

  return (
    <Screen>
      <PageHeader
        title="Recipes"
        back="/meals"
        subtitle={recipes.data.length > 0 ? `${recipes.data.length} recipes. Numbers are per serving.` : undefined}
        right={
          <IconButton label="Add a recipe" onClick={() => setEdit({ recipe: null })}>
            <Plus size={22} aria-hidden />
          </IconButton>
        }
      />
      <SegmentedControl
        label="Meal"
        size="sm"
        value={slot}
        onChange={setSlot}
        options={[{ value: "all" as Filter, label: "All" }, ...SLOTS.map((s) => ({ value: s as Filter, label: s === "breakfast" ? "Breakfast" : SLOT_LABEL[s] }))]}
      />
      <label className="mt-3 flex h-12 items-center gap-2.5 rounded-[14px] border border-line bg-surface px-4">
        <Search size={18} className="shrink-0 text-ink-3" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or ingredient"
          aria-label="Search recipes"
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-3"
        />
      </label>

      {recipes.loading || (recipes.data.length === 0 && query === "") ? (
        <div className="mt-4 h-72 rounded-[20px] bg-surface" aria-busy="true" aria-label="Loading" />
      ) : shown.length === 0 ? (
        <EmptyState
          compact
          title="No recipes match"
          body="Try another word, or add your own recipe."
          action={
            <Button variant="secondary" onClick={() => setEdit({ recipe: null })}>
              Add a recipe
            </Button>
          }
        />
      ) : (
        <Card padded={false} className="mt-4 overflow-hidden">
          <div className="divide-y divide-line">
            {shown.map((r) => (
              <ListRow
                key={r.id}
                onClick={() => setView(r)}
                title={r.name}
                sub={`${SLOT_LABEL[r.slot]}, ${fmt(r.calories)} kcal, ${fmt(r.protein)}g protein${r.source === "user" ? ", yours" : ""}${isExcluded(r, dislikes) ? ", left out" : ""}`}
                right={<Est className="text-[14px]">{dollars(r.est_cost)}</Est>}
              />
            ))}
          </div>
        </Card>
      )}
      <p className="mt-3 px-1 text-[13px] text-ink-3">Costs are estimates per serving from typical prices, not a store&apos;s shelf price.</p>

      {viewing ? (
        <Sheet
          open
          onClose={() => setView(null)}
          title={viewing.name}
          subtitle={`${SLOT_LABEL[viewing.slot]}, makes ${viewing.servings} ${viewing.servings === 1 ? "serving" : "servings"}`}
          footer={
            <Button
              full
              variant="secondary"
              icon={<Pencil size={17} aria-hidden />}
              onClick={() => {
                setEdit({ recipe: viewing });
                setView(null);
              }}
            >
              Edit recipe
            </Button>
          }
        >
          <div className="grid grid-cols-4 gap-2 rounded-[14px] bg-surface-2 px-3 py-3 text-center">
            {(
              [
                ["kcal", fmt(viewing.calories)],
                ["protein", `${fmt(viewing.protein)}g`],
                ["carbs", `${fmt(viewing.carbs)}g`],
                ["fat", `${fmt(viewing.fat)}g`],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <p className="t-num-sm tnum">{v}</p>
                <p className="t-label mt-0.5">{k}</p>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-[14px] text-ink-2">
            Per serving, <Est>{dollars(viewing.est_cost)}</Est>
            {isExcluded(viewing, dislikes) ? <span className="text-warn">. Left out of plans by your dislikes.</span> : null}
          </p>
          <h3 className="t-label mt-5 mb-2">Ingredients, whole batch</h3>
          <ul className="divide-y divide-line rounded-[14px] border border-line">
            {viewing.ingredients.map((i) => (
              <li key={`${i.name}-${i.unit}`} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 text-[15px] text-ink">{displayName(i.name)}</span>
                <span className="tnum shrink-0 text-[15px] text-ink-2">{amountLabel(i.quantity, i.unit)}</span>
              </li>
            ))}
          </ul>
          <h3 className="t-label mt-5 mb-2">Steps</h3>
          <ol className="flex flex-col gap-3">
            {viewing.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-snug text-ink">
                <span className="tnum flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[12px] font-semibold text-ink-2">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          {viewing.steps.length === 0 ? <p className="t-sub">No steps written.</p> : null}
        </Sheet>
      ) : null}

      {edit ? <RecipeEditor key={edit.recipe?.id ?? "new"} recipe={edit.recipe} defaultSlot={slot === "all" ? "dinner" : slot} onClose={() => setEdit(null)} /> : null}
    </Screen>
  );
}
