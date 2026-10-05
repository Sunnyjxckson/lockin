"use client";

// The way into the board from Today. A small row showing the main board (the
// first one in the list): tap it and the board opens full screen with
// nothing else around it. Renders nothing until a board has something on it,
// so it never adds an empty card to Today.
//
//   import { BoardEntry } from "@/features/boards/TodayEntry";
//   <BoardEntry />

import dynamic from "next/dynamic";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { usePhoto } from "@/lib/storage/hooks";
import type { BoardItem } from "@/lib/types";
import { useBoardSummaries } from "./data";
import { PaletteStrip } from "./PaletteStrip";

const BoardView = dynamic(() => import("./BoardView").then((m) => m.BoardView), { ssr: false });

function Thumb({ item, className }: { item: BoardItem; className?: string }) {
  const url = usePhoto(item.image_url);
  return (
    <span className={cn("block overflow-hidden rounded-[6px] bg-surface-2", className)} style={{ backgroundColor: item.kind === "color" ? (item.color ?? undefined) : item.palette?.[0] }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" draggable={false} className="size-full object-cover" /> : null}
    </span>
  );
}

export interface BoardEntryProps {
  className?: string;
  /** The line above the board's name. */
  label?: string;
}

export function BoardEntry({ className, label = "What this is for" }: BoardEntryProps) {
  const { summaries } = useBoardSummaries();
  const [open, setOpen] = useState(false);
  const main = summaries.find((s) => s.items.length > 0);
  if (!main) return null;
  const images = main.items.filter((i) => i.kind === "image");
  const shown = [main.cover, ...images.filter((i) => i.id !== main.cover?.id)].filter((i): i is BoardItem => !!i).slice(0, 3);

  return (
    <>
      <button
        type="button"
        aria-label={`Open ${main.board.name} full screen`}
        onClick={() => {
          haptics.tap();
          setOpen(true);
        }}
        className={cn("pressable glass block w-full overflow-hidden rounded-[24px] text-left", className)}
      >
        <span className="flex items-center gap-3.5 p-3.5">
          {shown.length > 0 ? (
            <span className="flex shrink-0 gap-[3px]">
              {shown.map((i, n) => (
                <Thumb key={i.id} item={i} className={n === 0 ? "h-14 w-11" : "h-14 w-8"} />
              ))}
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="t-label block">{label}</span>
            <span className="t-h2 mt-1.5 block truncate">{main.board.name}</span>
          </span>
          <ChevronRight size={20} aria-hidden className="shrink-0 text-ink-3" />
        </span>
        <PaletteStrip colors={main.palette} height={4} />
      </button>
      {open ? <BoardView board={main.board} items={main.items} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
