"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Pencil, Plus, Search } from "lucide-react";
import { Button, EmptyState, IconButton, List, ListRow, PageHeader, Screen, Sheet, Chip } from "@/components/ui";
import { useList, useSettings } from "@/lib/db/hooks";
import { amountLabel, dollars, isExcluded, SLOT_LABEL, SLOTS } from "@/lib/logic/meals";
import { displayName } from "@/lib/logic/mealsGrocery";
import type { MealSlot, Recipe } from "@/lib/types";
import { ensureLibrary } from "./data";
import { Est, IngredientList, MacroRow, StepList, fmt } from "./parts";

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
            <Plus size={22} strokeWidth={1.75} aria-hidden />
          </IconButton>
        }
      />
      {/* Five uneven words: chips, not segments, so "Breakfast" is never cut short. */}
      <div role="radiogroup" aria-label="Meal" className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
        {[{ value: "all" as Filter, label: "All" }, ...SLOTS.map((s) => ({ value: s as Filter, label: SLOT_LABEL[s] }))].map((o) => (
          <Chip key={o.value} radio on={slot === o.value} onClick={() => setSlot(o.value)}>
            {o.label}
          </Chip>
        ))}
      </div>
      <label className="tile mt-3 flex h-[52px] items-center gap-2.5 rounded-[16px] px-4 transition-colors focus-within:border-ink-2">
        <Search size={18} strokeWidth={1.75} className="shrink-0 text-ink-2" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or ingredient"
          aria-label="Search recipes"
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-3"
        />
      </label>

      {recipes.loading || (recipes.data.length === 0 && query === "") ? (
        <div className="tile mt-4 h-72 rounded-[26px]" aria-busy="true" aria-label="Loading" />
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
        <List className="mt-3">
          {shown.map((r) => (
            <ListRow
              key={r.id}
              onClick={() => setView(r)}
              plain
              title={r.name}
              sub={`${SLOT_LABEL[r.slot]}, ${fmt(r.calories)} kcal, ${fmt(r.protein)}g protein${r.source === "user" ? ", yours" : ""}${isExcluded(r, dislikes) ? ", left out" : ""}`}
              right={<Est className="text-[15px] text-ink">{dollars(r.est_cost)}</Est>}
            />
          ))}
        </List>
      )}
      <p className="t-caption mt-3 px-1 text-ink-2">Costs are estimates per serving, not a store&apos;s shelf price.</p>

      {viewing ? (
        <Sheet
          open
          onClose={() => setView(null)}
          title={viewing.name}
          subtitle={`${SLOT_LABEL[viewing.slot]}, makes ${viewing.servings} ${viewing.servings === 1 ? "serving" : "servings"}`}
          footer={
            <Button
              full
              size="lg"
              variant="secondary"
              icon={<Pencil size={17} strokeWidth={1.75} aria-hidden />}
              onClick={() => {
                setEdit({ recipe: viewing });
                setView(null);
              }}
            >
              Edit recipe
            </Button>
          }
        >
          <MacroRow calories={viewing.calories} protein={viewing.protein} carbs={viewing.carbs} fat={viewing.fat} />
          <p className="t-sub mt-4">
            Per serving, <Est className="text-ink">{dollars(viewing.est_cost)}</Est>
            {isExcluded(viewing, dislikes) ? <span className="text-warn">. Left out of plans by your dislikes.</span> : null}
          </p>
          <h3 className="t-label mt-6 mb-2.5">Ingredients, whole batch</h3>
          <IngredientList rows={viewing.ingredients.map((i) => ({ key: `${i.name}-${i.unit}`, name: displayName(i.name), amount: amountLabel(i.quantity, i.unit) }))} />
          <h3 className="t-label mt-6 mb-3">Steps</h3>
          <StepList steps={viewing.steps} />
          {viewing.steps.length === 0 ? <p className="t-sub">No steps written.</p> : null}
        </Sheet>
      ) : null}

      {edit ? <RecipeEditor key={edit.recipe?.id ?? "new"} recipe={edit.recipe} defaultSlot={slot === "all" ? "dinner" : slot} onClose={() => setEdit(null)} /> : null}
    </Screen>
  );
}
