"use client";

// Boards: the worlds you are locking in toward, one per track. Each opens
// into its collage. The look of the whole app can be taken from any of them.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { Images, Plus, RotateCcw } from "lucide-react";
import { Button, EmptyState, IconButton, PageHeader, Screen, useToast } from "@/components/ui";
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

  return (
    <Screen>
      <PageHeader
        title="Boards"
        back="/today"
        right={
          <IconButton label="New board" onClick={() => setCreating(true)}>
            <Plus size={22} strokeWidth={1.75} aria-hidden />
          </IconButton>
        }
      />

      {loading ? null : summaries.length === 0 ? (
        <EmptyState
          icon={<Images size={22} strokeWidth={1.75} aria-hidden />}
          title="No boards yet"
          body="Set the world first: the body, the brand, the life."
          action={
            <Button icon={<Plus size={18} strokeWidth={1.75} aria-hidden />} onClick={() => setCreating(true)}>
              Start a board
            </Button>
          }
        />
      ) : (
        <div className="mt-1 space-y-3">
          {summaries.map((s, i) => (
            <BoardCard key={s.board.id} summary={s} index={i} wearing={theme.palette !== null && theme.boardId === s.board.id} />
          ))}
        </div>
      )}

      {!loading && theme.palette ? (
        <div className="tile mt-7 flex items-center gap-3 rounded-[20px] py-3 pr-3 pl-4">
          <div className="min-w-0 flex-1">
            <p className="t-label">The look of the app</p>
            <p className="mt-1.5 truncate text-[15px] text-ink">{theme.name ?? "Custom"}</p>
            <p className="t-caption mt-0.5 text-ink-2">On top of {BASE_THEMES[theme.base].name}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<RotateCcw size={15} strokeWidth={1.75} aria-hidden />}
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
    <Link href={`/boards/${board.id}`} className="pressable glass block overflow-hidden rounded-[26px]" aria-label={`${board.name}, ${countLabel(items.length)}`}>
      {cover ? (
        <div className="flex gap-1.5 p-2 pb-0">
          <div className="relative aspect-[4/5] min-w-0 flex-1 overflow-hidden rounded-[20px]" style={cover.palette?.[0] ? { backgroundColor: cover.palette[0] } : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {url ? <img src={url} alt="" draggable={false} className="size-full object-cover" /> : null}
          </div>
          {second.length > 0 ? (
            <div className="flex w-[34%] shrink-0 flex-col gap-1.5">
              {second.map((i) => (
                <Side key={i.id} ref_={i.image_url} tone={i.palette?.[0]} />
              ))}
              {second.length === 1 && palette.length > 0 ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px]">
                  {palette.slice(0, 5).map((c) => (
                    <span key={c} className="min-h-0 flex-1" style={{ backgroundColor: c }} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-end justify-between gap-3 px-5 pt-4 pb-[18px]">
        <div className="min-w-0">
          <p className="t-label">
            <span>{String(index + 1).padStart(2, "0")}</span>
            <span className="mx-2">/</span>
            {BOARD_KIND_LABEL[board.kind]}
          </p>
          <h2 className="t-h1 mt-2 break-words">{board.name}</h2>
          {wearing ? <p className="t-caption mt-1.5 text-accent">The app is wearing this board.</p> : null}
        </div>
        <p className="shrink-0 text-right">
          <span className="t-stat block text-ink">{items.length}</span>
          <span className="t-label mt-1.5 block text-[10px]">{items.length === 1 ? "piece" : "pieces"}</span>
        </p>
      </div>
      {!cover ? <p className="t-sub -mt-2 px-5 pb-[18px]">{items.length === 0 ? "Empty. Open it and add the first piece." : "No images yet."}</p> : null}
      <PaletteStrip colors={palette} height={4} />
    </Link>
  );
}

function Side({ ref_, tone }: { ref_: string | null; tone?: string }) {
  const url = usePhoto(ref_);
  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-[20px] bg-surface-2" style={tone ? { backgroundColor: tone } : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" draggable={false} className="size-full object-cover" /> : null}
    </div>
  );
}
