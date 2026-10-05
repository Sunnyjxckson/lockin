// Data upgrades for rows written by an earlier build. In Supabase mode the SQL
// migrations do this work, so this only runs against the device store.
// Every step is safe to run again and does nothing once the data is current.

import { db } from "./index";
import { syncSlipCount } from "./helpers";
import { parseLegacySpendHint } from "../logic/vices";

export async function upgradeLocalData(): Promise<void> {
  if ((await db.backendName()) !== "local") return;

  // 0003: the typical spend moves out of checklist_item.hint into its own fields.
  const items = await db.list("checklist_item");
  for (const item of items) {
    const legacy = parseLegacySpendHint(item.hint);
    if (legacy) {
      await db.update("checklist_item", item.id, { typical_spend: legacy.amount, spend_period: legacy.period, hint: null });
    } else if (item.typical_spend === undefined || item.spend_period === undefined) {
      await db.update("checklist_item", item.id, { typical_spend: item.typical_spend ?? null, spend_period: item.spend_period ?? null });
    }
  }

  // 0004: day_log carries the slip count.
  const slips = await db.list("vice_slip");
  const seen = new Set<string>();
  for (const s of slips) {
    const key = `${s.item_id}|${s.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await syncSlipCount(s.item_id, s.date);
  }

  // 0005: the money target start. Null means the challenge start.
  const challenge = await db.first("challenge", { orderBy: "created_at" });
  if (challenge && challenge.money_target_start === undefined) await db.update("challenge", challenge.id, { money_target_start: null });
}
