"use client";

import Link from "next/link";
import { BellOff } from "lucide-react";
import { Card, EmptyState, NumberField, PageHeader, Screen, Section, SegmentedControl, TimeField, Toggle } from "@/components/ui";
import { db } from "@/lib/db";
import { updateSettings } from "@/lib/db/helpers";
import { useList, useSettings } from "@/lib/db/hooks";
import { MAX_DROPS_PER_DAY, MIN_DROPS_PER_DAY, dropsPerDay } from "@/lib/logic/drops";
import type { Reminder } from "@/lib/types";

function ReminderRow({ r }: { r: Reminder }) {
  const save = (patch: Partial<Reminder>) => void db.update("reminder", r.id, patch);
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] text-ink">{r.label}</p>
          <p className="t-caption mt-0.5 truncate text-ink-2">
            {r.time !== null ? (r.body ?? "At a set time") : `Before every block named ${r.block_name ?? "?"}`}
          </p>
        </div>
        <Toggle label={r.label} checked={r.enabled} onChange={(v) => save({ enabled: v })} />
      </div>
      <div className="mt-3">
        {r.time !== null ? (
          <TimeField aria-label={`${r.label} time`} value={r.time} disabled={!r.enabled} onChange={(v) => save({ time: v })} />
        ) : (
          <NumberField
            aria-label={`${r.label}: minutes before`}
            unit="min before"
            decimal={false}
            max={180}
            disabled={!r.enabled}
            value={Math.abs(r.offset_minutes)}
            onChange={(v) => save({ offset_minutes: -(v ?? 0) })}
          />
        )}
      </div>
    </div>
  );
}

const DROP_COUNTS = Array.from({ length: MAX_DROPS_PER_DAY - MIN_DROPS_PER_DAY + 1 }, (_, i) => ({ value: String(MIN_DROPS_PER_DAY + i), label: String(MIN_DROPS_PER_DAY + i) }));

export default function ReminderSettingsPage() {
  const reminders = useList("reminder", { orderBy: "sort_order" });
  const settings = useSettings();
  const s = settings.data;

  return (
    <Screen>
      <PageHeader title="Reminders" back="/settings" subtitle="On or off, and when." />

      <Section title="Reminders" right={<Link href="/reminders" className="-my-3 inline-flex min-h-11 items-center text-ink">Notifications</Link>}>
        {reminders.loading ? null : reminders.data.length === 0 ? (
          <Card padded={false}>
            <EmptyState compact icon={<BellOff size={22} strokeWidth={1.75} aria-hidden />} title="No reminders" body="Reset data to get the defaults back." />
          </Card>
        ) : (
          <Card padded={false} className="overflow-hidden">
            <div className="divide-y divide-hair">
              {reminders.data.map((r) => (
                <ReminderRow key={r.id} r={r} />
              ))}
            </div>
          </Card>
        )}
      </Section>

      {s ? (
        <Section title="Philosophy drops">
          {/* A settings row from before the Library migration has no such column: say so, and do not pretend to save. */}
          {s.drops_per_day === undefined ? (
            <p className="t-sub px-1">Run supabase/migrations/0015_library.sql in the Supabase SQL editor to turn these on.</p>
          ) : (
            <Card>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] text-ink">A quote through the day</p>
                  <p className="t-caption mt-0.5 text-ink-2">From the Library. Tap one to read it.</p>
                </div>
                <Toggle label="A quote through the day" checked={s.drops_enabled === true} onChange={(v) => void updateSettings({ drops_enabled: v })} />
              </div>
              <div className="mt-4">
                <p className="t-label mb-2.5">A day</p>
                <SegmentedControl
                  label="Drops a day"
                  options={DROP_COUNTS}
                  value={String(dropsPerDay(s.drops_per_day))}
                  onChange={(v) => void updateSettings({ drops_per_day: Number(v) })}
                />
                <p className="t-sub mt-3">Spread from wake to bedtime, never in quiet hours.</p>
              </div>
            </Card>
          )}
        </Section>
      ) : null}

      {s ? (
        <Section title="Quiet hours">
          <div>
            <div className="grid grid-cols-2 gap-3">
              <TimeField label="From" value={s.quiet_start} onChange={(v) => void updateSettings({ quiet_start: v })} />
              <TimeField label="Until" value={s.quiet_end} onChange={(v) => void updateSettings({ quiet_end: v })} />
            </div>
            <p className="t-sub mt-3 px-1">Nothing is sent between these times.</p>
          </div>
        </Section>
      ) : null}
    </Screen>
  );
}
