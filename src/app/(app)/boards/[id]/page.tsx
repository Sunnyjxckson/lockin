"use client";

// One board: its collage, and everything you can do to it. Add from the
// camera, the library, the clipboard or the web. Press and drag to arrange.
// Tap a piece to open it. The eye opens the board full screen with nothing
// else around it, and the swatch book turns its palette into the app's look.

import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Images, MoreHorizontal, Plus, SwatchBook } from "lucide-react";
import { ActionButton, Button, EmptyState, IconButton, PageHeader, Screen, useToast } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { BOARD_KIND_LABEL, boardPalette, cleanLink, moveId, sortByLightness } from "@/lib/logic/boards";
import { useTheme } from "@/lib/theme";
import type { BoardItem, BoardItemSource } from "@/lib/types";
import { Collage } from "@/features/boards/Collage";
import {
  STORAGE_FULL,
  addColor,
  addImage,
  addNote,
  countLabel,
  deleteBoard,
  fetchWebImage,
  reorderBoards,
  reorderItems,
  saveBoard,
  saveError,
  sourceOfFile,
  useBoardItems,
  useBoards,
} from "@/features/boards/data";
import { PaletteStrip } from "@/features/boards/PaletteStrip";

const AddSheet = dynamic(() => import("@/features/boards/AddSheet").then((m) => m.AddSheet), { ssr: false });
const BoardSheet = dynamic(() => import("@/features/boards/BoardSheet").then((m) => m.BoardSheet), { ssr: false });
const ItemView = dynamic(() => import("@/features/boards/ItemView").then((m) => m.ItemView), { ssr: false });
const BoardView = dynamic(() => import("@/features/boards/BoardView").then((m) => m.BoardView), { ssr: false });
const LookStudio = dynamic(() => import("@/features/boards/LookStudio").then((m) => m.LookStudio), { ssr: false });

type Open = { kind: "add" } | { kind: "board" } | { kind: "view" } | { kind: "item"; id: string } | { kind: "look"; imageId: string | null } | null;

export default function BoardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const theme = useTheme();
  const { boards, loading: boardsLoading } = useBoards();
  const { items, loading: itemsLoading } = useBoardItems(id);
  const board = boards.find((b) => b.id === id) ?? null;
  const [open, setOpen] = useState<Open>(null);
  const [adding, setAdding] = useState<{ done: number; total: number } | null>(null);
  const busy = useRef(false);

  const addFiles = useCallback(
    async (files: Blob[], source: BoardItemSource) => {
      if (!id || files.length === 0 || busy.current) return;
      busy.current = true;
      let added = 0;
      let problem: string | null = null;
      setAdding({ done: 0, total: files.length });
      for (const file of files) {
        try {
          await addImage(id, file, source === "upload" ? sourceOfFile(file) : source);
          added += 1;
          setAdding({ done: added, total: files.length });
        } catch (e) {
          problem = saveError(e);
          // No point trying the rest when the device is full.
          if (problem === STORAGE_FULL) break;
        }
      }
      busy.current = false;
      setAdding(null);
      if (problem) {
        haptics.error();
        toast(added > 0 ? `Added ${added} of ${files.length}. ${problem}` : problem, { kind: "error", duration: 6000 });
      } else {
        haptics.done();
        toast(added === 1 ? "Added to the board" : `Added ${added} images`, { kind: "done" });
      }
    },
    [id, toast],
  );

  const addWeb = useCallback(
    async (url: string) => {
      const blob = await fetchWebImage(url);
      try {
        await addImage(id, blob, "web", url);
      } catch (e) {
        throw new Error(saveError(e));
      }
      haptics.done();
      toast("Added to the board", { kind: "done" });
    },
    [id, toast],
  );

  // Paste straight onto the board: an image lands as an image, a link is fetched, and a link with no image is kept as a reference.
  useEffect(() => {
    if (!board) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const data = e.clipboardData;
      if (!data) return;
      const files = Array.from(data.files).filter((f) => f.type.startsWith("image/"));
      if (files.length > 0) {
        e.preventDefault();
        void addFiles(files, "screenshot");
        return;
      }
      const link = cleanLink(data.getData("text/plain"));
      if (!link) return;
      e.preventDefault();
      toast("Fetching that link");
      addWeb(link).catch(async () => {
        await addNote(board.id, "", link);
        toast("No image there, so it was kept as a link");
      });
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [board, addFiles, addWeb, toast]);

  if (boardsLoading || itemsLoading) {
    return (
      <Screen>
        <PageHeader title="" back="/boards" />
      </Screen>
    );
  }
  if (!board) {
    return (
      <Screen>
        <PageHeader title="Boards" back="/boards" />
        <EmptyState title="Not found" body="This board is no longer here." />
      </Screen>
    );
  }

  const palette = sortByLightness(boardPalette(items, 12));
  const index = boards.findIndex((b) => b.id === board.id);
  const ids = boards.map((b) => b.id);
  const item: BoardItem | null = open?.kind === "item" ? (items.find((i) => i.id === open.id) ?? null) : null;
  const wearing = theme.palette !== null && theme.boardId === board.id;

  return (
    <Screen>
      <PageHeader
        title={board.name}
        eyebrow={`${BOARD_KIND_LABEL[board.kind]} board`}
        back="/boards"
        right={
          <>
            <IconButton label="View full screen" disabled={items.length === 0} onClick={() => setOpen({ kind: "view" })}>
              <Eye size={20} strokeWidth={1.75} aria-hidden />
            </IconButton>
            <IconButton label="Set the app's look from this board" onClick={() => setOpen({ kind: "look", imageId: null })}>
              <SwatchBook size={20} strokeWidth={1.75} aria-hidden />
            </IconButton>
            <IconButton label="Board settings" onClick={() => setOpen({ kind: "board" })}>
              <MoreHorizontal size={20} strokeWidth={1.75} aria-hidden />
            </IconButton>
          </>
        }
      />
      <p className="t-sub -mt-1 px-1" aria-live="polite">
        {adding ? `Adding ${Math.min(adding.done + 1, adding.total)} of ${adding.total}` : `${countLabel(items.length)}${wearing ? ". The app is wearing this board" : ""}`}
      </p>

      {items.length === 0 ? (
        <EmptyState
          icon={<Images size={22} strokeWidth={1.75} aria-hidden />}
          title="Nothing here yet"
          body="Images, colors and notes. The why, made visible."
          action={
            <Button icon={<Plus size={18} strokeWidth={1.75} aria-hidden />} onClick={() => setOpen({ kind: "add" })}>
              Add the first piece
            </Button>
          }
        />
      ) : (
        <div className="mt-3">
          {palette.length > 0 ? (
            <button type="button" aria-label="Set the app's look from this palette" onClick={() => setOpen({ kind: "look", imageId: null })} className="pressable mb-1 flex min-h-11 w-full items-center">
              <PaletteStrip colors={palette} height={8} className="rounded-full" />
            </button>
          ) : null}
          <Collage items={items} onOpen={(i) => setOpen({ kind: "item", id: i.id })} onReorder={(next) => void reorderItems(board.id, next)} />
          <p className="t-caption mt-4 text-center text-ink-2">Hold and drag to move a piece.</p>
        </div>
      )}

      {items.length > 0 ? (
        <ActionButton
          label="Add to board"
          size={56}
          onClick={() => {
            haptics.tap();
            setOpen({ kind: "add" });
          }}
          className="fixed right-5 bottom-[calc(var(--tabbar-h)+var(--safe-b)+12px)] z-30"
        >
          <Plus size={24} strokeWidth={1.75} aria-hidden />
        </ActionButton>
      ) : null}

      {open?.kind === "add" ? (
        <AddSheet
          open
          onClose={() => setOpen(null)}
          onFiles={addFiles}
          onWeb={addWeb}
          suggestions={palette}
          onColor={async (hex, name) => {
            await addColor(board.id, hex, name);
            toast("Color kept", { kind: "done" });
          }}
          onNote={async (text, link) => {
            await addNote(board.id, text, link);
            toast("Note added", { kind: "done" });
          }}
        />
      ) : null}

      {open?.kind === "board" ? (
        <BoardSheet
          open
          board={board}
          pieces={items.length}
          onClose={() => setOpen(null)}
          onSave={(name, kind) => saveBoard(board.id, { name, kind })}
          onMove={{
            up: index > 0 ? () => void reorderBoards(moveId(ids, board.id, index - 1)).then(() => toast("Moved up")) : null,
            down: index < boards.length - 1 ? () => void reorderBoards(moveId(ids, board.id, index + 1)).then(() => toast("Moved down")) : null,
          }}
          onDelete={async () => {
            router.replace("/boards");
            await deleteBoard(board.id);
            toast("Board deleted");
          }}
        />
      ) : null}

      {open?.kind === "view" ? <BoardView board={board} items={items} onClose={() => setOpen(null)} /> : null}
      {item ? <ItemView board={board} items={items} item={item} onClose={() => setOpen(null)} onLook={(imageId) => setOpen({ kind: "look", imageId })} /> : null}
      {open?.kind === "look" ? <LookStudio board={board} items={items} imageId={open.imageId} onClose={() => setOpen(null)} /> : null}
    </Screen>
  );
}
