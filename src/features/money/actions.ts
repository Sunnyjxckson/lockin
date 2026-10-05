// Writes for the money feature. Every change to earnings ends by pushing the
// day's total into the "Earned today" checklist item, which is what Today scores.

import { db } from "@/lib/db";
import { setValueByKey, updateChallenge } from "@/lib/db/helpers";
import { parseEarningRead, totalForDate, type EarningRead } from "@/lib/logic/money";
import { blobToDataUrl, removePhoto, resizeImage, uploadPhoto } from "@/lib/storage";
import type { DateStr, Earning } from "@/lib/types";

export interface EarningInput {
  date: DateStr;
  amount: number;
  app: string;
  hours: number | null;
  screenshot_url: string | null;
}

/** Recompute one date's total from the table and write it to the checklist. Empty days clear the value. */
export async function syncEarned(date: DateStr): Promise<number> {
  const rows = await db.list("earning", { eq: { date } });
  const total = totalForDate(rows, date);
  await setValueByKey("earned", date, rows.length > 0 ? total : null);
  return total;
}

export async function addEarning(input: EarningInput): Promise<Earning> {
  const row = await db.insert("earning", input);
  await syncEarned(input.date);
  return row;
}

export async function saveEarning(prev: Earning, input: EarningInput): Promise<Earning> {
  const row = await db.update("earning", prev.id, input);
  await syncEarned(input.date);
  if (prev.date !== input.date) await syncEarned(prev.date);
  if (prev.screenshot_url && prev.screenshot_url !== input.screenshot_url) await removePhoto(prev.screenshot_url).catch(() => {});
  return row;
}

export async function deleteEarning(row: Earning): Promise<void> {
  await db.remove("earning", row.id);
  await syncEarned(row.date);
  if (row.screenshot_url) await removePhoto(row.screenshot_url).catch(() => {});
}

/** Store a screenshot and return the reference for earning.screenshot_url. */
export function storeScreenshot(file: Blob): Promise<string> {
  return uploadPhoto(file, { folder: "earnings", maxSize: 1400 });
}

export type ReadResult = ({ source: "ai" } & EarningRead) | { source: "fallback"; reason: string };

/** Ask the server to read an earnings screenshot. Never throws: any trouble is a fallback. */
export async function readScreenshot(file: Blob): Promise<ReadResult> {
  try {
    const small = await resizeImage(file, 1400, 0.85);
    const image = await blobToDataUrl(small);
    const res = await fetch("/api/money/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image }),
    });
    if (!res.ok) return { source: "fallback", reason: "error" };
    const json = (await res.json()) as { source?: string; reason?: string };
    if (json.source !== "ai") return { source: "fallback", reason: json.reason ?? "no_key" };
    return { source: "ai", ...parseEarningRead(json) };
  } catch {
    return { source: "fallback", reason: "error" };
  }
}

/**
 * Point the challenge at a new money target and deadline. The new target
 * starts a fresh running total from `from` (today). The floor is left alone.
 */
export async function resetTarget(money_target: number, money_deadline: DateStr, from: DateStr): Promise<void> {
  await updateChallenge({ money_target, money_deadline, money_target_start: from });
}
