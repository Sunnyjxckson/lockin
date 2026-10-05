"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ListChecks, Plus } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  IconButton,
  NumberField,
  PageHeader,
  Screen,
  Section,
  SegmentedControl,
  Sheet,
  TextField,
  TimeField,
  Toggle,
  useToast,
} from "@/components/ui";
import { addItem, removeItem, reorderItems, saveItem, updateChallenge } from "@/lib/db/helpers";
import { useChecklist } from "@/lib/db/hooks";
import { describeTarget } from "@/lib/logic/targets";
import type { Cadence, ChecklistItem, ItemType, Target } from "@/lib/types";

type NumberMode = "min" | "max" | "range";

interface Draft {
  id: string | null;
  key: string | null;
  name: string;
  type: ItemType;
  cadence: Cadence;
  hint: string;
  unit: string;
  gated: boolean;
  by: string;
  mode: NumberMode;
  min: number | null;
  max: number | null;
}

const TYPES: { value: ItemType; label: string }[] = [
  { value: "yesno", label: "Yes / no" },
  { value: "number", label: "Number" },
  { value: "text", label: "Text" },
];
const CADENCES: { value: Cadence; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Once a week" },
];
const MODES: { value: NumberMode; label: string }[] = [
  { value: "min", label: "At least" },
  { value: "max", label: "At most" },
  { value: "range", label: "Between" },
];

function toDraft(item: ChecklistItem | null): Draft {
  const t: Target = item?.target ?? { kind: "check" };
  return {
    id: item?.id ?? null,
    key: item?.key ?? null,
    name: item?.name ?? "",
    type: item?.type ?? "yesno",
    cadence: item?.cadence ?? "daily",
    hint: item?.hint ?? "",
    unit: item?.unit ?? "",
    gated: t.kind === "check_by",
    by: t.kind === "check_by" ? t.by : "06:00",
    mode: t.kind === "max" ? "max" : t.kind === "range" ? "range" : "min",
    min: t.kind === "min" || t.kind === "range" ? t.min : null,
    max: t.kind === "max" || t.kind === "range" ? t.max : null,
  };
}

/** The target a draft describes, or null while it is incomplete. */
function toTarget(d: Draft): Target | null {
  if (d.type === "text") return { kind: "text" };
  if (d.type === "yesno") return d.gated ? { kind: "check_by", by: d.by } : { kind: "check" };
  if (d.mode === "min") return d.min === null ? null : { kind: "min", min: d.min };
  if (d.mode === "max") return d.max === null ? null : { kind: "max", max: d.max };
  if (d.min === null || d.max === null || d.max < d.min) return null;
  return { kind: "range", min: d.min, max: d.max };
}

function ItemSheet({ item, onClose }: { item: ChecklistItem | null; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<Draft>(() => toDraft(item));
  const [busy, setBusy] = useState(false);
  const target = toTarget(d);
  const valid = d.name.trim().length > 0 && target !== null;
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  const save = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const fields = { name: d.name.trim(), cadence: d.cadence, hint: d.hint.trim() || null, unit: d.type === "number" ? d.unit.trim() || null : null, target };
      if (d.id) await saveItem(d.id, fields);
      else await addItem({ ...fields, type: d.type });
      // "Earned today" and the challenge's daily floor are the same number.
      if (d.key === "earned" && target.kind === "min") await updateChallenge({ daily_floor: target.min });
      toast(d.id ? "Saved. Applies from today." : "Added. Counts from today.", { kind: "done" });
      onClose();
    } catch {
      toast("Could not save", { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!d.id) return;
    await removeItem(d.id);
    toast("Removed from today forward");
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={d.id ? "Edit item" : "New item"}
      subtitle={d.id ? "Changes apply from today. Earlier days keep their scoring." : "Counts from today, not on earlier days."}
      footer={
        <div className="flex gap-3">
          {d.id ? (
            <Button variant="danger" onClick={() => void remove()}>
              Remove
            </Button>
          ) : null}
          <Button full disabled={!valid} loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="Name" value={d.name} onChange={(v) => set({ name: v })} placeholder="Read 20 pages" maxLength={60} autoFocus={!d.id} />

        {!d.id ? (
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink-2">Kind</p>
            <SegmentedControl label="Kind" options={TYPES} value={d.type} onChange={(v) => set({ type: v })} />
          </div>
        ) : null}

        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink-2">How often</p>
          <SegmentedControl label="How often" options={CADENCES} value={d.cadence} onChange={(v) => set({ cadence: v })} />
        </div>

        {d.type === "yesno" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[16px] font-medium">Only counts before a time</p>
                <p className="text-[13px] text-ink-3">Checked later than this, it does not count</p>
              </div>
              <Toggle label="Only counts before a time" checked={d.gated} onChange={(v) => set({ gated: v })} />
            </div>
            {d.gated ? <TimeField label="Check by" value={d.by} onChange={(v) => set({ by: v })} /> : null}
          </div>
        ) : null}

        {d.type === "number" ? (
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-ink-2">Done when the number is</p>
              <SegmentedControl label="Target kind" options={MODES} value={d.mode} onChange={(v) => set({ mode: v })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {d.mode !== "max" ? (
                <NumberField label={d.mode === "range" ? "From" : "At least"} value={d.min} onChange={(v) => set({ min: v })} live />
              ) : null}
              {d.mode !== "min" ? (
                <NumberField label={d.mode === "range" ? "To" : "At most"} value={d.max} onChange={(v) => set({ max: v })} live />
              ) : null}
              <TextField label="Unit" value={d.unit} onChange={(v) => set({ unit: v })} placeholder="g, $, min" maxLength={8} />
            </div>
            {d.mode === "range" && d.min !== null && d.max !== null && d.max < d.min ? (
              <p className="text-[13px] text-danger">The second number has to be the larger one.</p>
            ) : null}
          </div>
        ) : null}

        <TextField label="Note under the name" value={d.hint} onChange={(v) => set({ hint: v })} placeholder="Optional" maxLength={60} />
      </div>
    </Sheet>
  );
}

function summary(item: ChecklistItem): string {
  const t = describeTarget(item.target, item.unit);
  const parts = [item.cadence === "weekly" ? "Weekly" : null, t || (item.type === "yesno" ? "Yes / no" : null)];
  return parts.filter(Boolean).join(" · ");
}

export default function ChecklistSettingsPage() {
  const checklist = useChecklist();
  const [editing, setEditing] = useState<ChecklistItem | "new" | null>(null);

  const items = checklist.data.items.filter((i) => !i.archived && i.active).sort((a, b) => a.sort_order - b.sort_order);

  const move = (index: number, by: number) => {
    const ids = items.map((i) => i.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + by, 0, id);
    void reorderItems(ids);
  };

  return (
    <Screen>
      <PageHeader title="Checklist" back="/settings" subtitle="Tap an item to rename it or change its target. Use the arrows to reorder." />

      <Section title="Items" right={<span className="tnum">{items.length}</span>}>
        {checklist.loading ? null : items.length === 0 ? (
          <Card padded={false}>
            <EmptyState compact icon={<ListChecks size={24} aria-hidden />} title="No items" body="Add the first thing you want to hold yourself to." />
          </Card>
        ) : (
          <Card padded={false} className="overflow-hidden">
            <ul className="divide-y divide-line">
              {items.map((item, i) => (
                <li key={item.id} className="flex min-h-[60px] items-center gap-1 pr-1.5 pl-4">
                  <button type="button" onClick={() => setEditing(item)} className="min-h-[60px] min-w-0 flex-1 py-2.5 text-left">
                    <span className="block truncate text-[16px] font-medium">{item.name}</span>
                    <span className="mt-0.5 block truncate text-[13px] text-ink-3">{summary(item)}</span>
                  </button>
                  <IconButton label={`Move ${item.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp size={18} aria-hidden />
                  </IconButton>
                  <IconButton label={`Move ${item.name} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown size={18} aria-hidden />
                  </IconButton>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Button variant="secondary" full className="mt-3" icon={<Plus size={18} aria-hidden />} onClick={() => setEditing("new")}>
          Add item
        </Button>
        <p className="t-sub mt-4 px-1">
          More vices to quit or cap are in the{" "}
          <Link href="/vices" className="text-ink underline underline-offset-4">
            vice library
          </Link>
          .
        </p>
      </Section>

      {editing ? <ItemSheet key={editing === "new" ? "new" : editing.id} item={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </Screen>
  );
}
