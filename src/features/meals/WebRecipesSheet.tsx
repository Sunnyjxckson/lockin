"use client";

import { useMemo, useState } from "react";
import { Check, ExternalLink, Search } from "lucide-react";
import { Button, Chip, Notice, Sheet, useToast } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { useChecklist, useList, useSettings, useToday } from "@/lib/db/hooks";
import { dayTargets, DEFAULT_TARGETS, dollars, SLOT_LABEL, SLOTS } from "@/lib/logic/meals";
import { FOODS } from "@/lib/logic/mealsFoods";
import { safeUrl, type WebRecipe } from "@/lib/logic/mealsWeb";
import { targetOn } from "@/lib/logic/targets";
import type { MealSlot } from "@/lib/types";
import { addWebRecipe } from "./data";
import { Est, fmt } from "./parts";

type Phase = { kind: "idle" } | { kind: "busy" } | { kind: "done"; recipes: WebRecipe[] } | { kind: "no_key" } | { kind: "none" } | { kind: "error" };

/** Find real recipes online that fit your likes, dislikes, budget, cook time and macros. Pick the ones to keep. */
export function WebRecipesSheet({ defaultSlot, onClose }: { defaultSlot?: MealSlot | null; onClose: () => void }) {
  const toast = useToast();
  const settings = useSettings();
  const checklist = useChecklist();
  const recipes = useList("recipe");
  const today = useToday();
  const [slots, setSlots] = useState<MealSlot[]>(defaultSlot ? [defaultSlot] : []);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);

  const targets = useMemo(() => {
    const cal = checklist.data.items.find((i) => i.key === "calories");
    const pro = checklist.data.items.find((i) => i.key === "protein");
    return cal || pro
      ? dayTargets(cal ? targetOn(cal, checklist.data.versions, today) : null, pro ? targetOn(pro, checklist.data.versions, today) : null)
      : DEFAULT_TARGETS;
  }, [checklist.data, today]);

  const toggle = (s: MealSlot) => setSlots((all) => (all.includes(s) ? all.filter((x) => x !== s) : [...all, s]));

  const search = async () => {
    if (phase.kind === "busy") return;
    setPhase({ kind: "busy" });
    try {
      const res = await fetch("/api/meals/web-recipes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          likes: settings.data?.food_likes ?? [],
          dislikes: settings.data?.food_dislikes ?? [],
          slots,
          calories: Math.round((targets.calMin + targets.calMax) / 2),
          protein: targets.proteinMin,
          budget: settings.data?.weekly_food_budget ?? null,
          cook_minutes: settings.data?.cook_minutes ?? null,
          count: 6,
          foods: FOODS.map((f) => f.name),
          known_names: recipes.data.map((r) => r.name),
          known_urls: recipes.data.map((r) => r.source_url).filter((u): u is string => !!u),
        }),
      });
      if (!res.ok) return setPhase({ kind: "error" });
      const json = (await res.json().catch(() => null)) as { source?: string; reason?: string; recipes?: WebRecipe[] } | null;
      if (json?.source === "ai" && Array.isArray(json.recipes)) {
        // The link is checked again here, so a bad one is never rendered.
        const ok = json.recipes.filter((r) => safeUrl(r.source_url));
        return setPhase(ok.length > 0 ? { kind: "done", recipes: ok } : { kind: "none" });
      }
      if (json?.reason === "no_key") return setPhase({ kind: "no_key" });
      if (json?.reason === "empty") return setPhase({ kind: "none" });
      setPhase({ kind: "error" });
    } catch {
      setPhase({ kind: "error" });
    }
  };

  const add = async (r: WebRecipe) => {
    if (adding) return;
    setAdding(r.source_url);
    try {
      await addWebRecipe(r);
      setAdded((all) => new Set(all).add(r.source_url));
      haptics.done();
      toast("Added to your recipes", { kind: "done" });
    } catch (e) {
      haptics.error();
      toast(e instanceof Error ? e.message : "Could not add it", { kind: "error" });
    } finally {
      setAdding(null);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Find recipes online"
      subtitle="Real recipes that fit your likes, budget and macros"
      footer={
        <Button full size="lg" variant="primary" loading={phase.kind === "busy"} icon={<Search size={17} strokeWidth={1.75} aria-hidden />} onClick={search}>
          {phase.kind === "done" || phase.kind === "none" ? "Search again" : "Search"}
        </Button>
      }
    >
      <div className="flex flex-wrap gap-2" role="group" aria-label="Meal">
        {SLOTS.map((s) => (
          <Chip key={s} on={slots.includes(s)} onClick={() => toggle(s)}>
            {SLOT_LABEL[s]}
          </Chip>
        ))}
      </div>
      <p className="t-caption mt-2.5 text-ink-2">No meal picked means a mix. It takes up to a minute.</p>

      {phase.kind === "no_key" ? (
        <Notice className="mt-5" tone="quiet" title="Web search needs the Anthropic key. Add ANTHROPIC_API_KEY and try again." />
      ) : null}
      {phase.kind === "error" ? <Notice className="mt-5" tone="warn" title="Could not search just now. Try again." /> : null}
      {phase.kind === "none" ? <Notice className="mt-5" tone="quiet" title="Nothing new that fits. Try another meal." /> : null}

      {phase.kind === "done" ? (
        <ul className="mt-5 divide-y divide-hair" aria-label="Recipes found">
          {phase.recipes.map((r) => {
            const href = safeUrl(r.source_url) ?? undefined;
            const done = added.has(r.source_url);
            return (
              <li key={r.source_url} className="py-4">
                <p className="t-body text-ink">{r.name}</p>
                <p className="t-sub mt-1">
                  {SLOT_LABEL[r.slot]}, {r.source_name}
                  {r.minutes ? `, ${r.minutes} min` : ""}
                </p>
                <p className="t-sub mt-1">
                  {fmt(r.calories)} kcal, {fmt(r.protein)}g protein, <Est className="text-ink">{dollars(r.est_cost)}</Est> a serving
                  {r.partial ? <span className="text-warn">. Numbers are partial.</span> : null}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Button size="md" variant={done ? "secondary" : "solid"} disabled={done} loading={adding === r.source_url} icon={done ? <Check size={16} strokeWidth={1.75} aria-hidden /> : undefined} onClick={() => add(r)}>
                    {done ? "Added" : "Add"}
                  </Button>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pressable tile inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[14px] text-ink"
                  >
                    <ExternalLink size={15} strokeWidth={1.75} aria-hidden />
                    View recipe
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {phase.kind === "done" ? <p className="t-caption mt-1 text-ink-2">Calories, protein and cost are worked out here from the ingredients, not taken from the site.</p> : null}
    </Sheet>
  );
}
