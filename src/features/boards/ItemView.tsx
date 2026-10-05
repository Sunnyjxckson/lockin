"use client";

// One piece of a board, full screen: the image with its palette (tap a
// swatch to keep it, tap the image for an exact color), its note, and the
// controls to move or delete it.

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, Check, Pipette, Star, SwatchBook, Trash2, X } from "lucide-react";
import { Button, IconButton, TextField, cn, useToast } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { colorAt, colorDistance, inkOnColor, linkHost, moveId } from "@/lib/logic/boards";
import { usePhoto } from "@/lib/storage/hooks";
import type { Board, BoardItem } from "@/lib/types";
import { addColor, deleteItem, reorderItems, saveBoard, saveError, saveItem } from "./data";
import { loadPixels, type Pixels } from "./images";
import { Overlay } from "./Overlay";

export interface ItemViewProps {
  board: Board;
  /** Every piece on the board, in order. */
  items: BoardItem[];
  item: BoardItem;
  onClose: () => void;
  /** Open the look studio on this image's palette. */
  onLook: (imageId: string) => void;
}

const SAME = 0.012;

export function ItemView({ board, items, item, onClose, onLook }: ItemViewProps) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const index = items.findIndex((i) => i.id === item.id);
  const ids = items.map((i) => i.id);
  const kept = (hex: string) => items.find((i) => i.kind === "color" && i.color && colorDistance(i.color, hex) < SAME) ?? null;

  const toggleKeep = async (hex: string) => {
    const existing = kept(hex);
    try {
      if (existing) {
        await deleteItem(existing);
        toast("Taken off the board");
      } else {
        await addColor(board.id, hex);
        haptics.done();
        toast("Kept on the board", { kind: "done" });
      }
    } catch (e) {
      toast(saveError(e), { kind: "error" });
    }
  };

  const move = (delta: number) => {
    haptics.tap();
    void reorderItems(board.id, moveId(ids, item.id, index + delta));
  };

  const isCover = board.cover_item_id === item.id;
  const title = item.kind === "image" ? "Image" : item.kind === "color" ? "Color" : "Note";

  return (
    <Overlay onClose={onClose} label={title}>
      <div className="mx-auto w-full max-w-[480px] px-5 pt-[var(--safe-t)] pb-[calc(var(--safe-b)+32px)]">
        <div className="flex h-14 items-center justify-between">
          <p className="t-label">
            {board.name} <span className="tnum ml-1.5">{index + 1} of {items.length}</span>
          </p>
          <IconButton label="Close" onClick={onClose} className="-mr-2.5">
            <X size={22} strokeWidth={1.75} aria-hidden />
          </IconButton>
        </div>

        {item.kind === "image" ? <ImagePart key={item.id} item={item} kept={kept} onToggle={toggleKeep} /> : null}
        {item.kind === "color" ? <ColorPart item={item} /> : null}

        <div className="mt-6 space-y-4">
          <Editor key={item.id} item={item} />
          {item.source_url ? (
            <a href={item.source_url} target="_blank" rel="noreferrer noopener" className="pressable flex min-h-11 items-center gap-1.5 text-[14px] text-ink-2">
              <ArrowUpRight size={16} aria-hidden className="shrink-0" />
              <span className="truncate">{linkHost(item.source_url) ?? item.source_url}</span>
            </a>
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <Button variant="secondary" size="sm" full icon={<ArrowUp size={16} aria-hidden />} disabled={index <= 0} onClick={() => move(-1)}>
            Earlier
          </Button>
          <Button variant="secondary" size="sm" full icon={<ArrowDown size={16} aria-hidden />} disabled={index < 0 || index >= items.length - 1} onClick={() => move(1)}>
            Later
          </Button>
          {item.kind === "image" ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                full
                icon={<Star size={16} aria-hidden />}
                disabled={isCover}
                onClick={() => {
                  haptics.tap();
                  void saveBoard(board.id, { cover_item_id: item.id }).then(() => toast("This is the cover now", { kind: "done" }));
                }}
              >
                {isCover ? "Cover" : "Make cover"}
              </Button>
              <Button variant="secondary" size="sm" full icon={<SwatchBook size={16} aria-hidden />} disabled={(item.palette?.length ?? 0) === 0} onClick={() => onLook(item.id)}>
                Set the look
              </Button>
            </>
          ) : null}
        </div>

        <Button
          full
          className="mt-2.5"
          variant={confirm ? "danger" : "ghost"}
          icon={<Trash2 size={17} aria-hidden />}
          onClick={() => {
            if (!confirm) {
              haptics.tap();
              return setConfirm(true);
            }
            void deleteItem(item).then(() => {
              toast("Deleted");
              onClose();
            });
          }}
        >
          {confirm ? "Tap again to delete" : "Delete"}
        </Button>
      </div>
    </Overlay>
  );
}

function Editor({ item }: { item: BoardItem }) {
  const [note, setNote] = useState(item.note ?? "");
  const [link, setLink] = useState(item.source_url ?? "");
  const commit = (value: string) => {
    if ((item.note ?? "") !== value.trim()) void saveItem(item.id, { note: value });
  };
  if (item.kind === "color") return <TextField label="Name" value={note} onChange={setNote} onCommit={commit} placeholder="Bone, oxblood, wet concrete" maxLength={40} />;
  return (
    <>
      <TextField label="Note" value={note} onChange={setNote} onCommit={commit} rows={item.kind === "note" ? 4 : 2} maxLength={600} placeholder={item.kind === "note" ? "Words" : "Why this is on the board"} />
      {item.kind === "note" ? (
        <TextField
          label="Link"
          value={link}
          onChange={setLink}
          onCommit={(v) => {
            if ((item.source_url ?? "") !== v.trim()) void saveItem(item.id, { source_url: v.trim() || null });
          }}
          placeholder="https://"
        />
      ) : null}
    </>
  );
}

function ColorPart({ item }: { item: BoardItem }) {
  const color = item.color ?? "#808080";
  return (
    <div className="flex aspect-[4/3] w-full flex-col justify-end rounded-[26px] p-5" style={{ backgroundColor: color, color: inkOnColor(color) }}>
      {item.note ? <p className="t-title">{item.note}</p> : null}
      <p className="mt-1.5 text-[11px] font-medium tracking-[0.18em] uppercase">{color.replace("#", "")}</p>
    </div>
  );
}

function ImagePart({ item, kept, onToggle }: { item: BoardItem; kept: (hex: string) => BoardItem | null; onToggle: (hex: string) => Promise<void> }) {
  const url = usePhoto(item.image_url);
  const aspect = item.aspect ?? 0.8;
  const [pixels, setPixels] = useState<Pixels | null>(null);
  const [pick, setPick] = useState<{ x: number; y: number; hex: string } | null>(null);
  const palette = item.palette ?? [];

  useEffect(() => {
    if (!url) return;
    let live = true;
    void loadPixels(url).then((p) => live && setPixels(p));
    return () => {
      live = false;
    };
  }, [url]);

  const onTap = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!pixels) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const hex = colorAt(pixels.data, pixels.width, pixels.height, x, y, 1);
    if (!hex) return;
    haptics.tap();
    setPick({ x, y, hex });
  };

  const pickedKept = pick ? kept(pick.hex) : null;

  return (
    <div>
      <button
        type="button"
        onClick={onTap}
        aria-label="Image. Tap a spot to pick its color"
        className="relative mx-auto block cursor-crosshair overflow-hidden rounded-[20px] bg-surface-2"
        style={{ aspectRatio: String(aspect), width: `min(100%, calc(58dvh * ${aspect}))`, backgroundColor: palette[0] }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt={item.note ?? ""} draggable={false} className="size-full object-cover" /> : null}
        {pick ? (
          <span
            aria-hidden
            className="pointer-events-none absolute size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-on-scrim shadow-float"
            style={{ left: `${pick.x * 100}%`, top: `${pick.y * 100}%`, backgroundColor: pick.hex }}
          />
        ) : null}
      </button>

      <div className="mt-3 flex min-h-12 items-center gap-3">
        {pick ? (
          <>
            <span className="size-12 shrink-0 rounded-full border border-hair" style={{ backgroundColor: pick.hex }} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="t-value uppercase">{pick.hex.replace("#", "")}</p>
              <p className="t-caption mt-0.5 text-ink-2">The color at that spot</p>
            </div>
            <Button size="sm" variant={pickedKept ? "secondary" : "primary"} onClick={() => void onToggle(pick.hex)}>
              {pickedKept ? "Kept" : "Keep"}
            </Button>
          </>
        ) : (
          <p className="t-sub flex items-center gap-2">
            <Pipette size={16} aria-hidden className="shrink-0" />
            {pixels || !url ? "Tap the image to pick a color." : "Reading the image."}
          </p>
        )}
      </div>

      {palette.length > 0 ? (
        <div className="mt-4">
          <p className="t-label mb-3">Palette, tap to keep</p>
          <div className="flex gap-1.5">
            {palette.map((c) => {
              const on = !!kept(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${c}${on ? ", kept on the board" : ""}`}
                  onClick={() => void onToggle(c)}
                  className={cn("pressable relative h-16 min-w-0 flex-1 rounded-[14px] border", on ? "border-ink" : "border-hair")}
                  style={{ backgroundColor: c, color: inkOnColor(c) }}
                >
                  {on ? <Check size={16} strokeWidth={2} aria-hidden className="absolute top-1.5 right-1.5" /> : null}
                  <span className="tnum absolute bottom-1.5 left-1.5 text-[9px] font-medium tracking-[0.08em] uppercase">{c.replace("#", "")}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
