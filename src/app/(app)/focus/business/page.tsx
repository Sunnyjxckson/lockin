"use client";

// The light business log (PRD 19): one goal in a sentence, and the business
// moves ticked off on the daily checklist, week by week. Nothing new is
// stored for the moves. They are the "Business move" item's day_log text.

import { useMemo, useState } from "react";
import { Briefcase } from "lucide-react";
import { Button, Card, EmptyState, ListRow, PageHeader, Screen, Section, Stat, TextField, useToast } from "@/components/ui";
import { usePrefText } from "@/features/focus/useFocus";
import { setText } from "@/lib/db/helpers";
import { useChecklist, useLogs, useMode } from "@/lib/db/hooks";
import { formatDateShort, weekStart } from "@/lib/logic/dates";
import { businessSummary, businessWeeks } from "@/lib/logic/focus";

export default function BusinessLogPage() {
  const mode = useMode();
  const toast = useToast();
  const checklist = useChecklist();
  const logs = useLogs(mode.historyStart, mode.today);
  const item = checklist.data.items.find((i) => i.key === "business") ?? null;
  const weeks = useMemo(() => (item ? businessWeeks(logs.data, item.id) : []), [logs.data, item]);
  const sum = businessSummary(weeks, mode.today);
  const [goal, setGoal] = usePrefText("focus:business_goal");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [move, setMove] = useState("");
  const todayMove = item ? logs.data.find((l) => l.item_id === item.id && l.date === mode.today)?.text?.trim() : "";
  const thisWeek = weekStart(mode.today);

  const add = async () => {
    const text = move.trim();
    if (!item || !text) return;
    await setText(item.id, mode.today, todayMove ? `${todayMove}. ${text}` : text);
    setMove("");
    toast("Business move logged", { kind: "done" });
  };

  return (
    <Screen>
      <PageHeader title="Business log" back="/focus" />

      <Card data-business-goal>
        <p className="t-label">The goal</p>
        {editing ? (
          <div className="mt-2 space-y-3">
            <TextField value={draft} onChange={setDraft} rows={2} maxLength={160} placeholder="Sign three paying clients by December" autoFocus />
            <div className="flex gap-2">
              <Button
                full
                onClick={() => {
                  setGoal(draft.trim() || null);
                  setEditing(false);
                }}
              >
                Save
              </Button>
              <Button full variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : goal ? (
          <>
            <p className="t-h2 mt-2">{goal}</p>
            <Button
              className="mt-3"
              size="sm"
              variant="secondary"
              onClick={() => {
                setDraft(goal);
                setEditing(true);
              }}
            >
              Change
            </Button>
          </>
        ) : (
          <>
            <p className="mt-2 text-[15px] text-ink-2">Say where the business is going in one sentence. Every move below is measured against it.</p>
            <Button
              className="mt-3"
              size="sm"
              onClick={() => {
                setDraft("");
                setEditing(true);
              }}
            >
              Set a goal
            </Button>
          </>
        )}
      </Card>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Card>
          <Stat size="sm" label="This week" value={String(sum.thisWeek)} />
        </Card>
        <Card>
          <Stat size="sm" label="All moves" value={String(sum.total)} />
        </Card>
        <Card>
          <Stat size="sm" label="Weeks active" value={String(sum.activeWeeks)} />
        </Card>
      </div>

      {item ? (
        <Section title="Today">
          <Card>
            {todayMove ? <p className="mb-3 text-[15px]">{todayMove}</p> : null}
            <TextField value={move} onChange={setMove} maxLength={140} placeholder={todayMove ? "Add another move" : item.hint ?? "What moved the business today"} />
            <Button full className="mt-3" variant="secondary" disabled={!move.trim()} onClick={add}>
              Log move
            </Button>
          </Card>
        </Section>
      ) : null}

      <Section title="Moves">
        {weeks.length === 0 ? (
          <EmptyState compact icon={<Briefcase size={24} aria-hidden />} title="No business moves yet" body="Log one here or on Today's checklist. A call, a pitch, a deal moved forward." />
        ) : (
          <div className="space-y-3">
            {weeks.map((w) => (
              <div key={w.weekStart}>
                <p className="tnum mb-1.5 flex justify-between text-[13px] text-ink-2">
                  <span>{w.weekStart === thisWeek ? "This week" : `${formatDateShort(w.weekStart)} to ${formatDateShort(w.weekEnd)}`}</span>
                  <span>
                    {w.moves.length} {w.moves.length === 1 ? "move" : "moves"}
                  </span>
                </p>
                <Card padded={false} className="overflow-hidden">
                  <div className="divide-y divide-line">
                    {w.moves.map((m) => (
                      <ListRow key={m.date} plain title={m.text} sub={m.date === mode.today ? "Today" : formatDateShort(m.date)} href={`/today?date=${m.date}`} />
                    ))}
                  </div>
                </Card>
              </div>
            ))}
          </div>
        )}
      </Section>

      <p className="mt-6 text-[13px] text-ink-3">Deeper money tracking will come from your finance app once it can be connected.</p>
    </Screen>
  );
}
