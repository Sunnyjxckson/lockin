"use client";

import { useState } from "react";
import { CalendarClock, Plus } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  ListRow,
  PageHeader,
  Screen,
  Section,
  SegmentedControl,
  Select,
  Sheet,
  TextField,
  TimeField,
  Toggle,
  useToast,
} from "@/components/ui";
import { db } from "@/lib/db";
import { useList, useToday } from "@/lib/db/hooks";
import { durationMinutes, formatDuration, formatTime, isTimeStr, minutesOf, weekdayOf } from "@/lib/logic/dates";
import { WEEKDAY_NAMES, type BlockKind, type ScheduleTemplate, type Weekday } from "@/lib/types";

const DAYS: { value: Weekday; label: string }[] = [
  { value: 1, label: "M" },
  { value: 2, label: "T" },
  { value: 3, label: "W" },
  { value: 4, label: "T" },
  { value: 5, label: "F" },
  { value: 6, label: "S" },
  { value: 0, label: "S" },
];

const KINDS: { value: BlockKind; label: string }[] = [
  { value: "wake", label: "Wake" },
  { value: "workout", label: "Workout" },
  { value: "home", label: "Home" },
  { value: "class", label: "Class" },
  { value: "delivery", label: "Delivery" },
  { value: "basketball", label: "Basketball" },
  { value: "study", label: "Study or business" },
  { value: "free", label: "Free time" },
  { value: "errand", label: "Errand" },
  { value: "bed", label: "Bed" },
  { value: "other", label: "Other" },
];

type Draft = Pick<ScheduleTemplate, "block_name" | "start" | "end" | "kind" | "flexible" | "note"> & { id: string | null };

function BlockSheet({ draft, weekday, onClose }: { draft: Draft; weekday: Weekday; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState(draft);
  const valid = d.block_name.trim().length > 0 && isTimeStr(d.start) && isTimeStr(d.end) && d.start !== d.end;

  const save = async () => {
    const row = { weekday, block_name: d.block_name.trim(), start: d.start, end: d.end, kind: d.kind, flexible: d.flexible, note: d.note?.trim() || null };
    if (d.id) await db.update("schedule_template", d.id, row);
    else await db.insert("schedule_template", row);
    toast("Saved", { kind: "done" });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={d.id ? "Edit block" : "New block"}
      subtitle={`Every ${WEEKDAY_NAMES[weekday]}`}
      footer={
        <div className="flex gap-3">
          {d.id ? (
            <Button
              variant="danger"
              size="lg"
              onClick={async () => {
                await db.remove("schedule_template", d.id as string);
                onClose();
              }}
            >
              Delete
            </Button>
          ) : null}
          <Button full size="lg" disabled={!valid} onClick={() => void save()}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="Name" value={d.block_name} onChange={(v) => setD({ ...d, block_name: v })} placeholder="Delivery" maxLength={60} />
        <div className="grid grid-cols-2 gap-3">
          <TimeField label="Start" value={d.start} onChange={(v) => setD({ ...d, start: v })} />
          <TimeField label="End" value={d.end} onChange={(v) => setD({ ...d, end: v })} />
        </div>
        <Select label="Kind" value={d.kind} options={KINDS} onChange={(v) => setD({ ...d, kind: v })} />
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[15px] text-ink">Flexible</p>
            <p className="t-caption mt-0.5 text-ink-2">Can shift when a block runs long</p>
          </div>
          <Toggle label="Flexible" checked={d.flexible} onChange={(v) => setD({ ...d, flexible: v })} />
        </div>
        <TextField label="Note" value={d.note ?? ""} onChange={(v) => setD({ ...d, note: v })} placeholder="Optional" maxLength={120} />
      </div>
    </Sheet>
  );
}

export default function ScheduleSettingsPage() {
  const today = useToday();
  const [picked, setPicked] = useState<Weekday | null>(null);
  const weekday = picked ?? weekdayOf(today);
  const template = useList("schedule_template", { eq: { weekday } });
  const [draft, setDraft] = useState<Draft | null>(null);

  const blocks = template.data.slice().sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
  const lastEnd = blocks.length > 0 ? blocks[blocks.length - 1].end : "09:00";

  return (
    <Screen>
      <PageHeader title="Weekly plan" back="/settings" subtitle="What each weekday starts from." />

      <div className="mt-2">
        <SegmentedControl label="Weekday" size="sm" options={DAYS} value={weekday} onChange={setPicked} />
      </div>

      <Section title={WEEKDAY_NAMES[weekday]} right={<span>{blocks.length} blocks</span>}>
        {template.loading ? null : blocks.length === 0 ? (
          <Card padded={false}>
            <EmptyState compact icon={<CalendarClock size={22} strokeWidth={1.75} aria-hidden />} title="Nothing planned" body="Add the first block for this day." />
          </Card>
        ) : (
          <Card padded={false} className="overflow-hidden">
            <div className="divide-y divide-hair">
              {blocks.map((b) => (
                <ListRow
                  key={b.id}
                  title={b.block_name}
                  sub={b.kind === "wake" || b.kind === "bed" ? undefined : `To ${formatTime(b.end)} · ${formatDuration(durationMinutes(b.start, b.end))}${b.flexible ? "" : " · Fixed"}`}
                  value={formatTime(b.start)}
                  onClick={() => setDraft({ id: b.id, block_name: b.block_name, start: b.start, end: b.end, kind: b.kind, flexible: b.flexible, note: b.note })}
                />
              ))}
            </div>
          </Card>
        )}
        <Button
          variant="secondary"
          full
          className="mt-3"
          icon={<Plus size={18} strokeWidth={1.75} aria-hidden />}
          onClick={() => setDraft({ id: null, block_name: "", start: lastEnd === "23:59" ? "12:00" : lastEnd, end: "13:00", kind: "other", flexible: true, note: null })}
        >
          Add block
        </Button>
      </Section>

      {draft ? <BlockSheet key={draft.id ?? "new"} draft={draft} weekday={weekday} onClose={() => setDraft(null)} /> : null}
    </Screen>
  );
}
