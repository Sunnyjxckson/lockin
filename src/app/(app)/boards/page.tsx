"use client";

// Boards: the worlds you are locking in toward, one per track. Each opens
// into its collage. The look of the whole app can be taken from any of them.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { Images, Plus, RotateCcw } from "lucide-react";
import { Button, EmptyState, IconButton, PageHeader, Screen, cn, useToast } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { BOARD_KIND_LABEL } from "@/lib/logic/boards";
import { BASE_THEMES } from "@/lib/logic/theme";
import { usePhoto } from "@/lib/storage/hooks";
import { useTheme } from "@/lib/theme";
import { countLabel, createBoard, useBoardSummaries, type BoardSummary } from "@/features/boards/data";
import { PaletteStrip } from "@/features/boards/PaletteStrip";

const BoardSheet = dynamic(() => import("@/features/boards/BoardSheet").then((m) => m.BoardSheet), { ssr: false });

export default function BoardsPage() {
  const { summaries, loading } = useBoardSummaries();
  const [creating, setCreating] = useState(false);
  const toast = useToast();
  const theme = useTheme();

  const header = (
    <PageHeader
      title="Boards"
      back="/today"
      subtitle="The world you are locking in toward."
      right={
        <IconButton label="New board" onClick={() => setCreating(true)}>
          <Plus size={24} aria-hidden />
        </IconButton>
      }
    />
  );

  return (
    <Screen>
      {header}

      {loading ? null : summaries.length === 0 ? (
        <EmptyState
          icon={<Images size={24} aria-hidden />}
          title="No boards yet"
          body="A fashion house sets its world before any clothes exist. Start one for the body, the brand or the life, and fill it with images, colors and references."
          action={
            <Button icon={<Plus size={18} aria-hidden />} onClick={() => setCreating(true)}>
              Start a board
            </Button>
          }
        />
      ) : (
        <div className="mt-4 space-y-7">
          {summaries.map((s, i) => (
            <BoardCard key={s.board.id} summary={s} index={i} wearing={theme.palette !== null && theme.boardId === s.board.id} />
          ))}
        </div>
      )}

      {!loading && theme.palette ? (
        <div className="mt-8 flex items-center gap-3 rounded-[20px] border border-line bg-surface p-4">
          <div className="min-w-0 flex-1">
            <p className="t-label">The look of the app</p>
            <p className="mt-1 truncate text-[16px] font-semibold tracking-[-0.01em]">{theme.name ?? "Custom"}</p>
            <p className="t-sub text-[13px]">On top of {BASE_THEMES[theme.base].name}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<RotateCcw size={16} aria-hidden />}
            onClick={() => {
              haptics.tap();
              void theme.reset().then(() => toast(`Back to ${BASE_THEMES[theme.base].name}`, { kind: "done" }));
            }}
          >
            Back to base
          </Button>
        </div>
      ) : null}

      {creating ? (
        <BoardSheet
          open
          onClose={() => setCreating(false)}
          taken={summaries.map((s) => s.board.kind)}
          onSave={async (name, kind) => {
            await createBoard(name, kind);
            toast("Board created", { kind: "done" });
          }}
        />
      ) : null}
    </Screen>
  );
}

function BoardCard({ summary, index, wearing }: { summary: BoardSummary; index: number; wearing: boolean }) {
  const { board, cover, items, palette } = summary;
  const url = usePhoto(cover?.image_url);
  const second = items.filter((i) => i.kind === "image" && i.id !== cover?.id).slice(0, 2);
  return (
    <Link href={`/boards/${board.id}`} className="pressable block" aria-label={`${board.name}, ${countLabel(items.length)}`}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="t-label">
            <span className="tnum">{String(index + 1).padStart(2, "0")}</span>
            <span className="mx-2">/</span>
            {BOARD_KIND_LABEL[board.kind]}
          </p>
          <h2 className="mt-1.5 text-[34px] leading-[0.98] font-bold tracking-[-0.045em] break-words">{board.name}</h2>
        </div>
        <p className="t-sub shrink-0 pb-1 text-[13px]">{countLabel(items.length)}</p>
      </div>

      <div className="mt-3 flex gap-[5px]">
        <div
          className={cn("relative min-w-0 flex-1 overflow-hidden rounded-[4px] bg-surface", cover ? "aspect-[4/5]" : "flex aspect-[16/9] items-center justify-center border border-line")}
          style={cover?.palette?.[0] ? { backgroundColor: cover.palette[0] } : undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url ? <img src={url} alt="" draggable={false} className="size-full object-cover" /> : null}
          {!cover ? <p className="t-sub px-6 text-center">{items.length === 0 ? "Empty. Open it and add the first piece." : "No images yet."}</p> : null}
        </div>
        {second.length > 0 ? (
          <div className="flex w-[34%] shrink-0 flex-col gap-[5px]">
            {second.map((i) => (
              <Side key={i.id} ref_={i.image_url} tone={i.palette?.[0]} />
            ))}
            {second.length === 1 && palette.length > 0 ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[4px]">
                {palette.slice(0, 5).map((c) => (
                  <span key={c} className="min-h-0 flex-1" style={{ backgroundColor: c }} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <PaletteStrip colors={palette} height={8} className="mt-[5px] rounded-[2px]" />
      {wearing ? <p className="t-sub mt-2 text-[13px]">The app is wearing this board.</p> : null}
    </Link>
  );
}

function Side({ ref_, tone }: { ref_: string | null; tone?: string }) {
  const url = usePhoto(ref_);
  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-[4px] bg-surface-2" style={tone ? { backgroundColor: tone } : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" draggable={false} className="size-full object-cover" /> : null}
    </div>
  );
}
