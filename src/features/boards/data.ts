"use client";

// Reads and writes for boards. Everything goes through the shared db and
// photo storage, so it works the same on this device and on Supabase.

import { useMemo, useSyncExternalStore } from "react";
import { db } from "@/lib/db";
import { useList } from "@/lib/db/hooks";
import { boardPalette, cleanBoardName, cleanLink, coverOf, orderPatches } from "@/lib/logic/boards";
import { normalizeHex } from "@/lib/logic/theme";
import { getPref, setPref } from "@/lib/prefs";
import { removePhoto, uploadPhoto } from "@/lib/storage";
import type { Board, BoardItem, BoardItemSource, BoardKind } from "@/lib/types";
import { prepareImage } from "./images";

// ---------- reading ----------

export function useBoards(): { boards: Board[]; loading: boolean } {
  const { data, loading } = useList("board", { orderBy: "sort_order" });
  return { boards: data, loading };
}

export function useBoardItems(boardId: string | null | undefined): { items: BoardItem[]; loading: boolean } {
  const { data, loading } = useList("board_item", { orderBy: "sort_order" });
  const items = useMemo(() => (boardId ? data.filter((i) => i.board_id === boardId) : []), [data, boardId]);
  return { items, loading };
}

export interface BoardSummary {
  board: Board;
  items: BoardItem[];
  cover: BoardItem | null;
  palette: string[];
  images: number;
}

/** Every board with its pieces, cover and palette, in order. */
export function useBoardSummaries(): { summaries: BoardSummary[]; loading: boolean } {
  const boards = useList("board", { orderBy: "sort_order" });
  const all = useList("board_item", { orderBy: "sort_order" });
  const summaries = useMemo(
    () =>
      boards.data.map((board) => {
        const items = all.data.filter((i) => i.board_id === board.id);
        return { board, items, cover: coverOf(board.cover_item_id, items), palette: boardPalette(items), images: items.filter((i) => i.kind === "image").length };
      }),
    [boards.data, all.data],
  );
  return { summaries, loading: boards.loading || all.loading };
}

export function countLabel(n: number): string {
  return n === 1 ? "1 piece" : `${n} pieces`;
}

// ---------- image shapes ----------
//
// The collage needs each image's shape before the image loads, or the layout
// jumps. board_item has no column for it, so the shape is remembered on this
// device when the image is added, and measured once on load anywhere else.

const ASPECT_PREF = "board-aspects";
let aspects: Record<string, number> | null = null;
const aspectListeners = new Set<() => void>();

function readAspects(): Record<string, number> {
  if (aspects) return aspects;
  try {
    aspects = JSON.parse(getPref(ASPECT_PREF) ?? "{}") as Record<string, number>;
  } catch {
    aspects = {};
  }
  return aspects;
}

export function rememberAspect(id: string, aspect: number): void {
  if (!Number.isFinite(aspect) || aspect <= 0) return;
  const now = readAspects();
  const rounded = Math.round(aspect * 1000) / 1000;
  if (now[id] === rounded) return;
  aspects = { ...now, [id]: rounded };
  setPref(ASPECT_PREF, JSON.stringify(aspects));
  for (const fn of Array.from(aspectListeners)) fn();
}

function forgetAspect(id: string): void {
  const now = readAspects();
  if (!(id in now)) return;
  const next = { ...now };
  delete next[id];
  aspects = next;
  setPref(ASPECT_PREF, JSON.stringify(aspects));
}

const NO_ASPECTS: Record<string, number> = {};

export function useAspects(): Record<string, number> {
  return useSyncExternalStore(
    (fn) => {
      aspectListeners.add(fn);
      return () => void aspectListeners.delete(fn);
    },
    readAspects,
    () => NO_ASPECTS,
  );
}

// ---------- errors ----------

export const STORAGE_FULL = "This device is out of room for photos. Delete a few images, then try again.";

/** A message a person can act on, whatever went wrong while saving. */
export function saveError(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? "";
  const message = e instanceof Error ? e.message : String(e ?? "");
  if (/quota/i.test(name) || /quota|storage may be full|out of room/i.test(message)) return STORAGE_FULL;
  if (/could not read that image/i.test(message)) return message;
  return "Could not save that. Try again.";
}

// ---------- boards ----------

async function nextOrder(rows: { sort_order: number }[]): Promise<number> {
  return rows.reduce((m, r) => Math.max(m, r.sort_order), -1) + 1;
}

export async function createBoard(name: string, kind: BoardKind): Promise<Board> {
  const boards = await db.list("board");
  return db.insert("board", { name: cleanBoardName(name, kind), kind, cover_item_id: null, sort_order: await nextOrder(boards) });
}

export async function saveBoard(id: string, patch: { name?: string; kind?: BoardKind; cover_item_id?: string | null }): Promise<void> {
  const board = await db.get("board", id);
  if (!board) return;
  const kind = patch.kind ?? board.kind;
  await db.update("board", id, { ...patch, ...(patch.name !== undefined ? { name: cleanBoardName(patch.name, kind) } : {}) });
}

export async function reorderBoards(idsInOrder: string[]): Promise<void> {
  const boards = await db.list("board");
  for (const p of orderPatches(idsInOrder, boards)) await db.update("board", p.id, { sort_order: p.sort_order });
}

export async function deleteBoard(id: string): Promise<void> {
  const items = await db.list("board_item", { eq: { board_id: id } });
  for (const item of items) {
    if (item.image_url) await removePhoto(item.image_url).catch(() => undefined);
    forgetAspect(item.id);
  }
  await db.removeWhere("board_item", { board_id: id });
  await db.remove("board", id);
}

// ---------- pieces ----------

async function insertItem(boardId: string, fields: Partial<BoardItem> & Pick<BoardItem, "kind">): Promise<BoardItem> {
  const items = await db.list("board_item", { eq: { board_id: boardId } });
  return db.insert("board_item", {
    board_id: boardId,
    image_url: null,
    note: null,
    color: null,
    palette: null,
    source: null,
    source_url: null,
    sort_order: await nextOrder(items),
    ...fields,
  });
}

/** Scale the image down, pull its palette, store it and put it on the board. Throws with nothing left behind. */
export async function addImage(boardId: string, file: Blob, source: BoardItemSource, sourceUrl: string | null = null): Promise<BoardItem> {
  const prepared = await prepareImage(file);
  // Already scaled, so storage is told to keep it as it is.
  const ref = await uploadPhoto(prepared.blob, { folder: "boards", maxSize: 0 });
  try {
    const item = await insertItem(boardId, { kind: "image", image_url: ref, palette: prepared.palette, source, source_url: sourceUrl });
    rememberAspect(item.id, prepared.aspect);
    return item;
  } catch (e) {
    await removePhoto(ref).catch(() => undefined);
    throw e;
  }
}

/** Keep a swatch on the board. Returns null when the color is not a hex color. */
export async function addColor(boardId: string, color: string, note: string | null = null): Promise<BoardItem | null> {
  const hex = normalizeHex(color);
  if (!hex) return null;
  return insertItem(boardId, { kind: "color", color: hex, note: note?.trim() || null });
}

export async function addNote(boardId: string, text: string, link: string | null = null): Promise<BoardItem | null> {
  const note = text.trim().slice(0, 600) || null;
  const url = link ? cleanLink(link) : null;
  if (!note && !url) return null;
  return insertItem(boardId, { kind: "note", note, source_url: url });
}

export async function saveItem(id: string, patch: { note?: string | null; source_url?: string | null; color?: string }): Promise<void> {
  const clean: Partial<BoardItem> = {};
  if (patch.note !== undefined) clean.note = patch.note?.trim().slice(0, 600) || null;
  if (patch.source_url !== undefined) clean.source_url = patch.source_url ? cleanLink(patch.source_url) : null;
  if (patch.color !== undefined) {
    const hex = normalizeHex(patch.color);
    if (hex) clean.color = hex;
  }
  await db.update("board_item", id, clean);
}

export async function deleteItem(item: BoardItem): Promise<void> {
  await db.remove("board_item", item.id);
  if (item.image_url) await removePhoto(item.image_url).catch(() => undefined);
  forgetAspect(item.id);
  const board = await db.get("board", item.board_id);
  if (board?.cover_item_id === item.id) await db.update("board", board.id, { cover_item_id: null });
}

export async function reorderItems(boardId: string, idsInOrder: string[]): Promise<void> {
  const items = await db.list("board_item", { eq: { board_id: boardId } });
  for (const p of orderPatches(idsInOrder, items)) await db.update("board_item", p.id, { sort_order: p.sort_order });
}

/** "screenshot" for what looks like one, so the board remembers where a piece came from. */
export function sourceOfFile(file: Blob, fallback: BoardItemSource = "upload"): BoardItemSource {
  const name = (file as File).name ?? "";
  if (/screen ?shot|screen_shot|^img_\d+\.png$/i.test(name)) return "screenshot";
  return fallback;
}

/** Ask the server for an image on the web. Throws an Error whose message can be shown as it is. */
export async function fetchWebImage(url: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch("/api/boards/image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ url }),
    });
  } catch {
    throw new Error("Could not reach the app to fetch that. Check the connection.");
  }
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(json?.error ?? "Could not fetch that image.");
  }
  return res.blob();
}
