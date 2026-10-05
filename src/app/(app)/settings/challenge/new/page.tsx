"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CheckMark, DateField, NumberField, PageHeader, Screen, Section, SegmentedControl, TextField, Toggle, cn, useToast } from "@/components/ui";
import { startChallenge } from "@/lib/db/helpers";
import { useChecklist, useMode } from "@/lib/db/hooks";
import { haptics } from "@/lib/haptics";
import { MAX_CHALLENGE_DAYS, challengeProblem, type ChallengeInput } from "@/lib/logic/challenge";
import { addDays, formatDateLong } from "@/lib/logic/dates";
import { describeTarget, targetsEqual } from "@/lib/logic/targets";
import type { ChallengeRule, ChecklistItem, DateStr, Target } from "@/lib/types";

const LENGTHS = [7, 14, 30, 60, 90];
const SCOPES = [
  { value: "all", label: "Whole checklist" },
  { value: "pick", label: "Pick items" },
] as const;

/** A number target with one side changed, keeping its shape. */
function withNumbers(own: Target, min: number | null, max: number | null): Target | null {
  if (own.kind === "min") return min === null ? null : { kind: "min", min };
  if (own.kind === "max") return max === null ? null : { kind: "max", max };
  if (own.kind === "range") return min === null || max === null || max < min ? null : { kind: "range", min, max };
  return own;
}

function RuleRow({
  item,
  on,
  target,
  onToggle,
  onTarget,
}: {
  item: ChecklistItem;
  on: boolean;
  target: Target;
  onToggle: () => void;
  onTarget: (t: Target | null) => void;
}) {
  const numeric = item.target.kind === "min" || item.target.kind === "max" || item.target.kind === "range";
  const min = target.kind === "min" || target.kind === "range" ? target.min : null;
  const max = target.kind === "max" || target.kind === "range" ? target.max : null;
  const changed = !targetsEqual(target, item.target);
  return (
    <li>
      <button type="button" role="checkbox" aria-checked={on} aria-label={item.name} onClick={onToggle} className="pressable flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left">
        <CheckMark checked={on} size={26} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[16px] font-medium", on ? "text-ink" : "text-ink-2")}>{item.name}</span>
          <span className="mt-0.5 block truncate text-[13px] text-ink-3">
            {[item.cadence === "weekly" ? "Weekly" : null, describeTarget(on ? target : item.target, item.unit) || "Yes / no", on && changed ? "for the challenge" : null].filter(Boolean).join(" · ")}
          </span>
        </span>
      </button>
      {on && numeric ? (
        <div className="grid grid-cols-2 gap-3 px-4 pb-3.5">
          {item.target.kind !== "max" ? (
            <NumberField
              label={item.target.kind === "range" ? `${item.name}: from` : `${item.name}: at least`}
              unit={item.unit ?? undefined}
              value={min}
              onChange={(v) => onTarget(withNumbers(item.target, v, max))}
              live
            />
          ) : null}
          {item.target.kind !== "min" ? (
            <NumberField
              label={item.target.kind === "range" ? `${item.name}: to` : `${item.name}: at most`}
              unit={item.unit ?? undefined}
              value={max}
              onChange={(v) => onTarget(withNumbers(item.target, min, v))}
              live
            />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export default function NewChallengePage() {
  const toast = useToast();
  const router = useRouter();
  const mode = useMode();
  const checklist = useChecklist();
  const today = mode.today;

  const [name, setName] = useState("");
  const [start, setStart] = useState<DateStr | null>(null);
  const [length, setLength] = useState<number>(30);
  const [scope, setScope] = useState<"all" | "pick">("all");
  const [picked, setPicked] = useState<Record<string, Target | null>>({});
  const [bad, setBad] = useState<Record<string, boolean>>({});
  const [hasMoney, setHasMoney] = useState(false);
  const [money, setMoney] = useState<number | null>(1000);
  const [deadline, setDeadline] = useState<DateStr | null>(null);
  const [saving, setSaving] = useState(false);

  const startDate = start ?? today;
  const end = addDays(startDate, Math.max(1, length) - 1);
  const items = checklist.data.items.filter((i) => i.active && !i.archived).sort((a, b) => a.sort_order - b.sort_order);
  const taken = mode.challenge ?? mode.finished ?? mode.upcoming;

  const rules: ChallengeRule[] | null =
    scope === "all"
      ? null
      : items
          .filter((i) => i.id in picked)
          .map((i) => {
            const t = picked[i.id];
            return { item_id: i.id, target: t && !targetsEqual(t, i.target) ? t : null };
          });

  const input: ChallengeInput = {
    name,
    start_date: startDate,
    length_days: length,
    rules,
    money_target: hasMoney ? money : null,
    money_deadline: hasMoney ? (deadline ?? end) : null,
    daily_floor: mode.floor,
  };
  const incomplete = Object.entries(bad).some(([id, v]) => v && id in picked);
  const problem = challengeProblem(input, today) ?? (incomplete ? "Finish the targets for the items you picked." : null);

  const toggle = (item: ChecklistItem) => {
    haptics.tap();
    setPicked((p) => {
      const next = { ...p };
      if (item.id in next) delete next[item.id];
      else next[item.id] = item.target;
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await startChallenge(input, today);
      haptics.done();
      toast(startDate === today ? "Challenge started. Today is day 1." : `Challenge set. It starts ${formatDateLong(startDate)}.`, { kind: "done" });
      router.push("/today");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not start it", { kind: "error" });
      setSaving(false);
    }
  };

  if (!mode.loading && taken) {
    return (
      <Screen>
        <PageHeader title="New challenge" back="/settings/challenge" />
        <Card className="mt-3">
          <p className="t-h2">{taken.name} is already active</p>
          <p className="t-sub mt-2">One challenge at a time. End it or finish it first, then start the next one.</p>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title="New challenge" back="/settings/challenge" subtitle="A set run on top of your ongoing history. Starting, ending or restarting it never changes what you have logged." />

      <Section title="Name and length">
        <Card className="flex flex-col gap-4">
          <TextField label="Name" value={name} onChange={setName} placeholder="30 days of a strict diet" maxLength={40} />
          <DateField label="Starts" value={startDate} min={today} onChange={(v) => setStart((v as DateStr) || null)} />
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink-2">Length</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Length">
              {LENGTHS.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={length === n}
                  onClick={() => {
                    haptics.tap();
                    setLength(n);
                  }}
                  className={cn(
                    "pressable tnum h-11 min-w-[52px] rounded-[12px] border px-3 text-[15px] font-semibold",
                    length === n ? "border-ink bg-ink text-bg" : "border-line bg-surface-2 text-ink",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <NumberField label="Days" unit="days" decimal={false} min={1} max={MAX_CHALLENGE_DAYS} value={length} onChange={(v) => setLength(v ?? 0)} live />
            </div>
            {length >= 1 ? <p className="t-sub mt-2">Ends {formatDateLong(end)}.</p> : null}
          </div>
        </Card>
      </Section>

      <Section title="Rules">
        <SegmentedControl label="What counts" options={SCOPES} value={scope} onChange={setScope} />
        <p className="t-sub mt-3 px-1">
          {scope === "all"
            ? "A challenge day is full when every daily item on your checklist is done, as it stands that day."
            : "A challenge day is full when the items you pick are done. Give a number a tighter target and it holds for the length of the challenge, then goes back."}
        </p>
        {scope === "pick" ? (
          <Card padded={false} className="mt-3 overflow-hidden">
            <ul className="divide-y divide-line">
              {items.map((item) => (
                <RuleRow
                  key={item.id}
                  item={item}
                  on={item.id in picked}
                  target={picked[item.id] ?? item.target}
                  onToggle={() => toggle(item)}
                  onTarget={(t) => {
                    setBad((b) => ({ ...b, [item.id]: t === null }));
                    if (t) setPicked((p) => ({ ...p, [item.id]: t }));
                  }}
                />
              ))}
            </ul>
          </Card>
        ) : null}
      </Section>

      <Section title="Money target">
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[16px] font-medium">Add a money target</p>
              <p className="text-[13px] text-ink-3">A total to reach by a date. The ${mode.floor} daily floor applies either way.</p>
            </div>
            <Toggle label="Add a money target" checked={hasMoney} onChange={setHasMoney} />
          </div>
          {hasMoney ? (
            <>
              <NumberField label="Target" prefix="$" value={money} onChange={setMoney} live />
              <DateField label="Deadline" value={deadline ?? end} min={startDate} onChange={(v) => setDeadline((v as DateStr) || null)} />
            </>
          ) : null}
        </Card>
      </Section>

      <div className="mt-7">
        <Button full size="lg" disabled={!!problem} loading={saving} onClick={() => void save()}>
          Start challenge
        </Button>
        <p className="t-sub mt-3 min-h-5 px-1 text-center">{problem && name.trim() ? problem : ""}</p>
      </div>
    </Screen>
  );
}
