"use client";

import { useState } from "react";
import { Button, NumberField, Select, TextField } from "@/components/ui";
import { describeTargets, type DayTargets } from "@/lib/logic/meals";
import { STORES, type Store } from "@/lib/logic/mealsPricing";
import { DISLIKE_IDEAS, LIKE_IDEAS, TermChips } from "./parts";

export interface SetupValues {
  budget: number;
  store: Store;
  likes: string[];
  dislikes: string[];
  /** A request in plain words, or empty. */
  ask: string;
}

/** Budget, store, likes and dislikes, and an optional ask in plain words. Used for the first plan and for every rebuild. */
export function SetupForm({
  initial,
  targets,
  challengeName,
  busy,
  submitLabel,
  onSubmit,
  showAsk = true,
}: {
  initial: SetupValues;
  targets: DayTargets;
  challengeName: string | null;
  busy: boolean;
  submitLabel: string;
  onSubmit: (v: SetupValues) => void;
  showAsk?: boolean;
}) {
  const [budget, setBudget] = useState<number | null>(initial.budget > 0 ? initial.budget : null);
  const [store, setStore] = useState<Store>(initial.store);
  const [likes, setLikes] = useState(initial.likes);
  const [dislikes, setDislikes] = useState(initial.dislikes);
  const [ask, setAsk] = useState(initial.ask);
  const ok = budget !== null && budget > 0;

  return (
    <div className="flex flex-col gap-5">
      <NumberField label="Weekly food budget" prefix="$" value={budget} onChange={setBudget} live placeholder="60" max={2000} />
      <Select
        label="Where you shop"
        value={store}
        onChange={setStore}
        options={STORES.map((s) => ({ value: s, label: s }))}
        hint="Priced with estimates for this store."
      />
      <div className="px-1">
        <p className="t-label">Each day{challengeName ? `, from ${challengeName}` : ""}</p>
        <p className="mt-2 text-[15px] text-ink">{describeTargets(targets)}</p>
      </div>
      <TermChips label="Foods you like" terms={likes} onChange={setLikes} suggestions={LIKE_IDEAS} placeholder="Add a food" />
      <TermChips label="Foods to leave out" terms={dislikes} onChange={setDislikes} suggestions={DISLIKE_IDEAS} placeholder="Add a food" />
      {showAsk ? (
        <TextField
          label="Anything else, in your words"
          value={ask}
          onChange={setAsk}
          rows={2}
          maxLength={300}
          placeholder="More chicken, no fish, cheaper breakfasts"
          hint="Optional."
        />
      ) : null}
      <Button full size="lg" loading={busy} disabled={!ok} onClick={() => (ok ? onSubmit({ budget: budget!, store, likes, dislikes, ask: ask.trim() }) : undefined)}>
        {submitLabel}
      </Button>
    </div>
  );
}
