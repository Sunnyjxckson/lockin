"use client";

// The board with everything else taken away. Edge to edge, no buttons, no
// tab bar: the world you are building toward, for when motivation dips.

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/components/ui";
import { BOARD_KIND_LABEL, boardPalette, sortByLightness } from "@/lib/logic/boards";
import type { Board, BoardItem } from "@/lib/types";
import { Collage } from "./Collage";
import { Overlay } from "@/components/ui";
import { PaletteStrip } from "./PaletteStrip";

export interface BoardViewProps {
  board: Board;
  items: BoardItem[];
  onClose: () => void;
}

export function BoardView({ board, items, onClose }: BoardViewProps) {
  // The close button shows for a moment, then gets out of the way. A tap brings it back.
  const [chrome, setChrome] = useState(true);
  useEffect(() => {
    if (!chrome) return;
    const t = window.setTimeout(() => setChrome(false), 2600);
    return () => window.clearTimeout(t);
  }, [chrome]);

  const palette = sortByLightness(boardPalette(items, 12));

  return (
    <Overlay onClose={onClose} label={`${board.name}, full screen`}>
      <div className="min-h-full" onClick={() => setChrome((c) => !c)}>
        <button
          type="button"
          aria-label="Close"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={cn(
            "fixed top-[calc(var(--safe-t)+12px)] right-3 z-30 flex size-11 items-center justify-center rounded-full bg-scrim text-on-scrim transition-opacity duration-500 focus-visible:opacity-100",
            chrome ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <X size={20} strokeWidth={1.75} aria-hidden />
        </button>

        <header className="px-5 pt-[calc(var(--safe-t)+56px)] pb-7">
          <p className="t-label">{BOARD_KIND_LABEL[board.kind]}</p>
          <h2 className="t-display mt-3 break-words">{board.name}</h2>
        </header>

        {items.length > 0 ? (
          <Collage items={items} gap={3} bare />
        ) : (
          <p className="t-sub px-5">Nothing on this board yet.</p>
        )}

        <PaletteStrip colors={palette} height={44} className="mt-[3px]" />
        <div className="h-[calc(var(--safe-b)+24px)]" />
      </div>
    </Overlay>
  );
}
