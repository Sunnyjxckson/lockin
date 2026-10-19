"use client";

// "What the coach knows about you" on the coach notes page. The running
// profile the coach reads before every reply: your why, what sets off slips,
// what has gotten you moving, what you are working on, things you said that
// mattered. Every line can be edited or deleted, and you can add your own.

import { useState } from "react";
import { Brain, Plus } from "lucide-react";
import { Button, Chip, EmptyState, List, ListRow, Notice, Section, Sheet, TextField, useToast } from "@/components/ui";
import { useList } from "@/lib/db/hooks";
import { MAX_NOTE, PROFILE_LABEL } from "@/lib/logic/coachProfile";
import { PROFILE_KINDS, type CoachProfileEntry, type ProfileKind } from "@/lib/types";
import { addProfileEntry, deleteProfileEntry, editProfileEntry } from "./memory";

const QUERY = { orderBy: "updated_at", ascending: false, limit: 200 } as const;

interface Draft {
  /** Null for a new line. */
  id: string | null;
  kind: ProfileKind;
  body: string;
}

export function ProfileSection() {
  const toast = useToast();
  const list = useList("coach_profile", QUERY);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = list.data;
  const count = rows.length;

  const save = () => {
    if (!draft || busy) return;
    setBusy(true);
    const run = draft.id ? editProfileEntry(draft.id, draft.kind, draft.body) : addProfileEntry(draft.kind, draft.body);
    run.then(
      (ok) => {
        if (!ok) {
          toast("Write a few words first", { kind: "error" });
          return;
        }
        setDraft(null);
      },
      () => toast("Could not save that", { kind: "error" }),
    ).finally(() => setBusy(false));
  };

  const remove = () => {
    if (!draft?.id || busy) return;
    setBusy(true);
    deleteProfileEntry(draft.id).then(
      () => setDraft(null),
      () => toast("Could not delete that", { kind: "error" }),
    ).finally(() => setBusy(false));
  };

  return (
    <Section
      title="What the coach knows"
      right={
        list.error ? null : (
          <Button variant="ghost" size="sm" className="-my-3 -mr-3" onClick={() => setDraft({ id: null, kind: "why", body: "" })} icon={<Plus size={15} strokeWidth={1.75} aria-hidden />}>
            Add
          </Button>
        )
      }
    >
      {list.error ? (
        <Notice tone="warn" title="The profile is not set up yet">
          Run supabase/migrations/0016_coach_memory.sql in the Supabase SQL editor, then reload.
        </Notice>
      ) : count === 0 ? (
        <EmptyState row icon={<Brain size={20} strokeWidth={1.75} aria-hidden />} title="Nothing yet" body="As you talk, the coach keeps what matters: your why, what sets off slips, what works. You can edit all of it." />
      ) : (
        <div className="flex flex-col gap-5">
          {PROFILE_KINDS.map((kind) => {
            const own = rows.filter((r) => r.kind === kind);
            if (own.length === 0) return null;
            return (
              <div key={kind}>
                <p className="t-label px-1">{PROFILE_LABEL[kind]}</p>
                <List className="mt-2">
                  {own.map((r: CoachProfileEntry) => (
                    <ListRow key={r.id} title={r.body} onClick={() => setDraft({ id: r.id, kind: r.kind, body: r.body })} />
                  ))}
                </List>
              </div>
            );
          })}
        </div>
      )}

      <Sheet
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit this" : "Tell the coach something"}
        subtitle="The coach reads this before every reply."
        footer={
          <div className="flex gap-2">
            {draft?.id ? (
              <Button variant="danger" onClick={remove} loading={busy}>
                Delete
              </Button>
            ) : null}
            <Button full onClick={save} loading={busy} disabled={!draft || draft.body.trim().length < 6}>
              Save
            </Button>
          </div>
        }
      >
        {draft ? (
          <div className="flex flex-col gap-4 pb-2">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What kind of thing it is">
              {PROFILE_KINDS.map((k) => (
                <Chip key={k} radio on={draft.kind === k} onClick={() => setDraft({ ...draft, kind: k })}>
                  {PROFILE_LABEL[k]}
                </Chip>
              ))}
            </div>
            <TextField label="In your words" value={draft.body} onChange={(body) => setDraft({ ...draft, body })} rows={3} maxLength={MAX_NOTE} placeholder="Short and plain" />
          </div>
        ) : null}
      </Sheet>
    </Section>
  );
}

export default ProfileSection;
