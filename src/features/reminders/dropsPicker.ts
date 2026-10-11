"use client";

// Where the picker for philosophy drops lives, so any screen that plans the
// day can read it. Nothing here imports the quotes: the runtime that holds
// them is fetched the first time drops are on.

import { useSyncExternalStore } from "react";
import type { DropPicker } from "@/features/library/dropsRuntime";

let current: DropPicker | null = null;
const listeners = new Set<() => void>();
let activation: Promise<void> | null = null;

function set(next: DropPicker): void {
  current = next;
  for (const l of Array.from(listeners)) l();
}

/** Load the drops runtime, once. Safe to call whenever drops are on. */
export function activateDrops(): void {
  if (activation) return;
  activation = import("@/features/library/dropsRuntime")
    .then((m) => m.connect(set))
    .catch(() => {
      activation = null;
    });
}

/** The picker once it is loaded, null before. */
export function useDropsPicker(): DropPicker | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => current,
    () => null,
  );
}
