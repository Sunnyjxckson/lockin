"use client";

import { useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import type { Store } from "@/lib/logic/mealsPricing";

/** The line that goes wherever a price estimate is shown. */
export function EstimateNote({ store, receipts = 0, className }: { store?: Store; receipts?: number; className?: string }) {
  return (
    <p className={cn("t-caption text-ink-2", className)} data-estimate-note>
      {store ? `Estimated prices, not ${store}'s shelf prices.` : "Estimated prices, not any store's shelf prices."}
      {receipts > 0 ? ` ${receipts} from your receipts.` : ""}
    </p>
  );
}

/** "est." in front of a dollar amount that is not a real price. */
export function Est({ children, real = false, className }: { children: ReactNode; real?: boolean; className?: string }) {
  return (
    <span className={cn("whitespace-nowrap", className)}>
      {real ? null : <span className="mr-1 text-[10px] font-medium tracking-[0.12em] text-ink-2 uppercase">est.</span>}
      {children}
    </span>
  );
}

/** Calories and the three macros as one row of numbers, for a sheet. */
export function MacroRow({ calories, protein, carbs, fat }: { calories: number; protein: number; carbs: number; fat: number }) {
  const cells: [string, string][] = [
    ["kcal", fmt(calories)],
    ["protein", `${fmt(protein)}g`],
    ["carbs", `${fmt(carbs)}g`],
    ["fat", `${fmt(fat)}g`],
  ];
  return (
    <div className="grid grid-cols-4 gap-3.5">
      {cells.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <p className="t-stat truncate text-ink">{v}</p>
          <p className="t-label mt-1.5 truncate text-[10px]">{k}</p>
        </div>
      ))}
    </div>
  );
}

/** Ingredients and numbered steps, the same in the planned meal sheet and the recipe sheet. */
export function IngredientList({ rows }: { rows: { key: string; name: string; amount: string }[] }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {rows.map((r) => (
        <li key={r.key} className="flex items-baseline justify-between gap-3 py-2.5">
          <span className="min-w-0 text-[15px] text-ink">{r.name}</span>
          <span className="shrink-0 text-[14px] text-ink-2">{r.amount}</span>
        </li>
      ))}
    </ul>
  );
}

export function StepList({ steps }: { steps: readonly string[] }) {
  return (
    <ol className="flex flex-col gap-3.5">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3.5 text-[15px] leading-snug text-ink">
          <span className="w-4 shrink-0 text-[13px] leading-[1.6] text-accent">{i + 1}</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function macroLine(calories: number, protein: number): string {
  return `${fmt(calories)} kcal, ${fmt(protein)}g protein`;
}

/** A list of words the user can add to and remove from, with one tap suggestions. */
export function TermChips({
  label,
  hint,
  terms,
  onChange,
  suggestions,
  placeholder,
}: {
  label: string;
  hint?: string;
  terms: readonly string[];
  onChange: (next: string[]) => void;
  suggestions: readonly string[];
  placeholder: string;
}) {
  const [text, setText] = useState("");
  const has = (t: string) => terms.some((x) => x.toLowerCase() === t.toLowerCase());
  const add = (raw: string) => {
    const parts = raw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0 && t.length <= 30 && !has(t));
    if (parts.length > 0) {
      haptics.tap();
      onChange([...terms, ...new Set(parts)]);
    }
    setText("");
  };
  const open = suggestions.filter((s) => !has(s)).slice(0, 8);
  const id = `terms-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[13px] text-ink-2">
        {label}
      </label>
      {terms.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={label}>
          {terms.map((t) => (
            <li key={t}>
              <button
                type="button"
                onClick={() => onChange(terms.filter((x) => x !== t))}
                aria-label={`Remove ${t}`}
                className="pressable inline-flex h-11 items-center gap-1.5 rounded-full bg-ink pr-3 pl-4 text-[14px] font-medium text-bg"
              >
                {t}
                <X size={15} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(text);
            }
          }}
          onBlur={() => (text.trim() ? add(text) : undefined)}
          placeholder={placeholder}
          maxLength={60}
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="done"
          className="tile h-[52px] min-w-0 flex-1 rounded-[16px] px-4 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-ink-2"
        />
      </div>
      {open.length > 0 ? (
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 no-scrollbar">
          {open.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="pressable tile inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-3.5 text-[14px] text-ink"
            >
              <Plus size={14} aria-hidden />
              {s}
            </button>
          ))}
        </div>
      ) : null}
      {hint ? <p className="text-[13px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

export const LIKE_IDEAS = ["chicken", "turkey", "beef", "eggs", "rice", "pasta", "tacos", "tofu", "oats", "yogurt"];
export const DISLIKE_IDEAS = ["fish", "shellfish", "tofu", "pork", "beef", "eggs", "dairy", "cottage cheese", "peanut butter", "protein powder", "beans", "spicy"];
