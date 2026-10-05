"use client";

// Make a board, or change one: its name, what it is for, where it sits in
// the list, and deleting it.

import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button, SegmentedControl, Sheet, TextField } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { BOARD_KINDS, BOARD_KIND_HINT, BOARD_KIND_LABEL } from "@/lib/logic/boards";
import type { Board, BoardKind } from "@/lib/types";

export interface BoardSheetProps {
  open: boolean;
  onClose: () => void;
  /** The board being changed. Leave out to make a new one. */
  board?: Board | null;
  /** Kinds already in use, so a new board starts on one that is not. */
  taken?: BoardKind[];
  onSave: (name: string, kind: BoardKind) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  /** Move this board up (-1) or down (1) the list. Null when it cannot go that way. */
  onMove?: { up: (() => void) | null; down: (() => void) | null };
  pieces?: number;
}

const KIND_OPTIONS = BOARD_KINDS.map((k) => ({ value: k, label: BOARD_KIND_LABEL[k] }));

export function BoardSheet({ open, onClose, board, taken = [], onSave, onDelete, onMove, pieces = 0 }: BoardSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={board ? "Board" : "New board"} subtitle={board ? undefined : "The body, the brand, the life."}>
      {open ? <Form key={board?.id ?? "new"} board={board ?? null} taken={taken} onSave={onSave} onDelete={onDelete} onMove={onMove} onClose={onClose} pieces={pieces} /> : null}
    </Sheet>
  );
}

function Form({ board, taken, onSave, onDelete, onMove, onClose, pieces }: Omit<BoardSheetProps, "open" | "board"> & { board: Board | null; taken: BoardKind[]; pieces: number }) {
  const [name, setName] = useState(board?.name ?? "");
  const [kind, setKind] = useState<BoardKind>(board?.kind ?? BOARD_KINDS.find((k) => !taken.includes(k)) ?? "life");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await onSave(name, kind);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <TextField label="Name" value={name} onChange={setName} placeholder={`${BOARD_KIND_LABEL[kind]} board`} maxLength={40} autoFocus={!board} />
      <div>
        <p className="mb-1.5 text-[13px] text-ink-2">What it is for</p>
        <SegmentedControl label="What it is for" options={KIND_OPTIONS} value={kind} onChange={setKind} />
        <p className="t-sub mt-2">{BOARD_KIND_HINT[kind]}</p>
      </div>

      {board && onMove && (onMove.up || onMove.down) ? (
        <div>
          <p className="mb-1.5 text-[13px] text-ink-2">Order</p>
          <div className="flex gap-2.5">
            <Button variant="secondary" size="sm" full icon={<ArrowUp size={16} aria-hidden />} disabled={!onMove.up} onClick={() => onMove.up?.()}>
              Move up
            </Button>
            <Button variant="secondary" size="sm" full icon={<ArrowDown size={16} aria-hidden />} disabled={!onMove.down} onClick={() => onMove.down?.()}>
              Move down
            </Button>
          </div>
          <p className="t-sub mt-2">The first board is the one Today opens.</p>
        </div>
      ) : null}

      <Button full size="lg" loading={busy} onClick={() => void save()}>
        {board ? "Save" : "Create board"}
      </Button>

      {board && onDelete ? (
        <Button
          full
          variant={confirm ? "danger" : "ghost"}
          icon={<Trash2 size={17} aria-hidden />}
          onClick={() => {
            if (!confirm) {
              haptics.tap();
              return setConfirm(true);
            }
            void Promise.resolve(onDelete()).then(onClose);
          }}
        >
          {confirm ? (pieces > 0 ? `Tap again to delete it and its ${pieces === 1 ? "1 piece" : `${pieces} pieces`}` : "Tap again to delete") : "Delete board"}
        </Button>
      ) : null}
    </div>
  );
}
