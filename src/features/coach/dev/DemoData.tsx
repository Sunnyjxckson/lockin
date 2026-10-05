"use client";

// Dev only, loaded by /dev/coach outside production. Replaces the logged
// data on this device with the coach fixture.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, useToast } from "@/components/ui";
import { db } from "@/lib/db";
import { getItems, getWorkouts, updateChallenge } from "@/lib/db/helpers";
import { clearQueryCache, useToday } from "@/lib/db/hooks";
import { syncCoach } from "@/features/coach/data";
import { TodaySlot } from "@/features/coach/TodaySlot";
import { WeeklyReview } from "@/features/coach/WeeklyReview";
import { buildCoachFixture, FIXTURE_DAYS } from "@/lib/logic/coachFixture";
import type { NewRow, TableName } from "@/lib/types";

const TABLES = ["day_log", "earning", "meal", "set_log", "vice_slip", "body_log", "coach_note"] as const satisfies readonly TableName[];

async function clear(table: (typeof TABLES)[number]): Promise<void> {
  const rows = await db.list(table);
  for (const r of rows) await db.remove(table, r.id);
}

export default function DemoData() {
  const today = useToday();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      if ((await db.backendName()) !== "local") throw new Error("Only works when data is kept on this device, not with Supabase on.");
      const [items, workouts] = await Promise.all([getItems(), getWorkouts()]);
      const fx = buildCoachFixture(today, items, workouts);
      for (const t of TABLES) await clear(t);
      await updateChallenge(fx.challenge);
      await db.insertMany("day_log", fx.day_log);
      await db.insertMany("earning", fx.earning);
      await db.insertMany("meal", fx.meal);
      await db.insertMany("set_log", fx.set_log);
      await db.insertMany("vice_slip", fx.vice_slip as NewRow<"vice_slip">[]);
      await db.insertMany("body_log", fx.body_log);
      // The preview cards below may have written notes mid-load. Rewrite them from the full data.
      await clear("coach_note");
      await syncCoach(today, { regenerate: true, weekly: true });
      clearQueryCache();
      toast("Demo data loaded", { kind: "done" });
      router.push("/coach");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load demo data", { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <Card className="mt-4">
      <p className="text-[16px] leading-[1.45]">
        Replaces every log on this device (checklist, earnings, meals, sets, slips, weight, coach notes) with {FIXTURE_DAYS} days of made up data, and moves the
        challenge start back so today is day {FIXTURE_DAYS + 1}.
      </p>
      <p className="t-sub mt-2">It plants each pattern the coach looks for. Reset everything afterwards from Settings.</p>
      <Button className="mt-4" full variant="danger" loading={busy} onClick={load}>
        Replace my data with the demo
      </Button>
    </Card>
    <p className="t-label mt-8 mb-2.5 px-1">Today card preview</p>
    <TodaySlot />
    <p className="t-label mt-8 mb-2.5 px-1">Progress card preview</p>
    <WeeklyReview />
    </>
  );
}
