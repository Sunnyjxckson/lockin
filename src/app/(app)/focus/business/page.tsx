"use client";

// The light business log (PRD 19): one goal in a sentence, and the business
// moves ticked off on the daily checklist, week by week. Nothing new is
// stored for the moves. They are the "Business move" item's day_log text.

import { useMemo, useState } from "react";
import { Briefcase, Plus } from "lucide-react";
import { ActionButton, Button, Card, EmptyState, List, ListRow, PageHeader, Screen, Section, TextField, TrackStat, useToast } from "@/components/ui";
import { setText, updateSettings } from "@/lib/db/helpers";
import { useChecklist, useLogs, useMode, useSettings } from "@/lib/db/hooks";
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
  const settings = useSettings();
  const goal = settings.data?.business_goal ?? null;
  const setGoal = (text: string | null) => updateSettings({ business_goal: text }).catch(() => toast("Could not save the goal", { kind: "error" }));
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

      <div className="px-1 pt-2" data-business-goal>
        <p className="t-label">The goal</p>
        {editing ? (
          <div className="mt-3 space-y-3">
            <TextField value={draft} onChange={setDraft} rows={2} maxLength={160} placeholder="Sign three paying clients by December" autoFocus aria-label="The goal" />
            <div className="flex gap-2">
              <Button
                full
                variant="solid"
                onClick={() => {
                  void setGoal(draft.trim() || null);
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
            <p className="t-h1 mt-2.5 text-balance">{goal}</p>
            <Button
              className="mt-4"
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
            <p className="t-h1 mt-2.5 text-ink-2">One sentence. Where is the business going?</p>
            <Button
              className="mt-4"
              size="sm"
              variant="solid"
              onClick={() => {
                setDraft("");
                setEditing(true);
              }}
            >
              Set a goal
            </Button>
          </>
        )}
      </div>

      <div className="mt-7 grid grid-cols-3 gap-3.5 px-1">
        <TrackStat value={String(sum.thisWeek)} label="This week" />
        <TrackStat value={String(sum.total)} label="All moves" />
        <TrackStat value={String(sum.activeWeeks)} label="Weeks active" />
      </div>

      {item ? (
        <Section title="Today">
          {todayMove ? <p className="mb-3 px-1 text-[15px]">{todayMove}</p> : null}
          <div className="flex items-center gap-2.5">
            <TextField className="min-w-0 flex-1" value={move} onChange={setMove} maxLength={140} aria-label="Business move" placeholder={todayMove ? "Add another move" : item.hint ?? "What moved the business today"} />
            <ActionButton label="Log move" disabled={!move.trim() || editing} onClick={add}>
              <Plus size={22} strokeWidth={1.75} aria-hidden />
            </ActionButton>
          </div>
        </Section>
      ) : null}

      {weeks.length === 0 ? (
        <Section title="Moves">
          <Card padded={false}>
            <EmptyState compact icon={<Briefcase size={22} strokeWidth={1.75} aria-hidden />} title="No moves yet" body="A call, a pitch, a deal moved forward." />
          </Card>
        </Section>
      ) : (
        weeks.map((w) => (
          <Section key={w.weekStart} title={w.weekStart === thisWeek ? "This week" : `${formatDateShort(w.weekStart)} to ${formatDateShort(w.weekEnd)}`} right={`${w.moves.length} ${w.moves.length === 1 ? "move" : "moves"}`}>
            <List>
              {w.moves.map((m) => (
                <ListRow key={m.date} plain title={m.text} sub={m.date === mode.today ? "Today" : formatDateShort(m.date)} href={`/today?date=${m.date}`} />
              ))}
            </List>
          </Section>
        ))
      )}
    </Screen>
  );
}
