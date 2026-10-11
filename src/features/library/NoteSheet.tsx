"use client";

import { useState } from "react";
import { Button, Sheet, TextField } from "@/components/ui";

export interface NoteSheetProps {
  quote: string;
  writer: string;
  note: string;
  onClose: () => void;
  onSave: (note: string) => void | Promise<void>;
}

/** Why it hit. Saving a note saves the quote too. */
export function NoteSheet({ quote, writer, note, onClose, onSave }: NoteSheetProps) {
  const [text, setText] = useState(note);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await onSave(text);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Why it hit"
      footer={
        <Button full size="lg" loading={busy} onClick={() => void save()}>
          {note && !text.trim() ? "Remove note" : "Save note"}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="tile rounded-[20px] px-4 py-3">
          <p className="line-clamp-3 text-[14px] leading-snug whitespace-pre-line text-ink-2">{quote}</p>
          <p className="t-caption mt-1.5 text-ink-2">{writer}</p>
        </div>
        <TextField label="Your note" value={text} onChange={setText} rows={5} maxLength={2000} autoFocus />
      </div>
    </Sheet>
  );
}
