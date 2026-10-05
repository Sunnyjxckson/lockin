"use client";

// The board itself: a collage of images, swatches and notes, laid out by
// layoutBoard. Press and hold a piece, then drag, to move it. The others
// slide out of the way as it passes.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { NOTE_PAD, inkOnColor, layoutBoard, linkHost, moveId, noteMetrics, tileAt, type TileInput, type TileRect } from "@/lib/logic/boards";
import { usePhoto } from "@/lib/storage/hooks";
import type { BoardItem } from "@/lib/types";
import { rememberAspect } from "./data";

export interface CollageProps {
  items: BoardItem[];
  /** Tap a piece. Leave out for a board that is only looked at. */
  onOpen?: (item: BoardItem) => void;
  /** Called with every id in the new order when a drag ends. Leave out to switch dragging off. */
  onReorder?: (ids: string[]) => void;
  gap?: number;
  /** Square corners and no borders, for the full screen view. */
  bare?: boolean;
  className?: string;
}

const HOLD_MS = 260;
const SLOP = 9;

interface Drag {
  id: string;
  pointerId: number;
  /** Where in the tile it was grabbed, 0 to 1. */
  fx: number;
  fy: number;
  /** Pointer position in the collage's own coordinates. */
  x: number;
  y: number;
}

export function Collage({ items, onOpen, onReorder, gap = 6, bare = false, className }: CollageProps) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [order, setOrder] = useState<string[] | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const pending = useRef<{ id: string; pointerId: number; x: number; y: number; timer: number } | null>(null);
  const lastSwap = useRef<{ id: string; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const pointer = useRef({ clientX: 0, clientY: 0 });
  const scroller = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const ids = useMemo(() => {
    const base = items.map((i) => i.id);
    if (!order) return base;
    // The order being dragged, minus anything deleted meanwhile, plus anything added.
    const kept = order.filter((id) => byId.has(id));
    return [...kept, ...base.filter((id) => !kept.includes(id))];
  }, [items, order, byId]);

  const layout = useMemo(() => {
    const inputs: TileInput[] = ids.map((id) => {
      const item = byId.get(id) as BoardItem;
      return { id, kind: item.kind, aspect: item.aspect ?? null, chars: item.note?.length ?? 0, link: !!item.source_url };
    });
    return layoutBoard(inputs, { width: width || 320, gap });
  }, [ids, byId, width, gap]);
  const layoutRef = useRef(layout);
  const idsRef = useRef(ids);
  useEffect(() => {
    layoutRef.current = layout;
    idsRef.current = ids;
  }, [layout, ids]);

  const local = useCallback((clientX: number, clientY: number) => {
    const r = box.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  }, []);

  const stopScroll = () => {
    if (scroller.current !== null) cancelAnimationFrame(scroller.current);
    scroller.current = null;
  };

  const consider = useCallback((d: Drag) => {
    const target = tileAt(layoutRef.current, d.x, d.y);
    if (!target || target.id === d.id) return;
    const prev = lastSwap.current;
    // After a swap the same neighbor can land back under the finger. Wait for real movement before swapping again.
    if (prev && prev.id === target.id && Math.hypot(d.x - prev.x, d.y - prev.y) < 28) return;
    const now = idsRef.current;
    const next = moveId(now, d.id, now.indexOf(target.id));
    lastSwap.current = { id: target.id, x: d.x, y: d.y };
    idsRef.current = next;
    setOrder(next);
    haptics.tap();
  }, []);

  const move = useCallback(
    (clientX: number, clientY: number) => {
      const d = dragRef.current;
      if (!d) return;
      const p = local(clientX, clientY);
      const next = { ...d, x: p.x, y: p.y };
      dragRef.current = next;
      setDrag(next);
      consider(next);
    },
    [consider, local],
  );

  // Scroll the page (or the overlay the board sits in) when a dragged piece nears the top or bottom edge.
  const autoScroll = useCallback(() => {
    const tick = () => {
      scroller.current = null;
      if (!dragRef.current) return;
      const y = pointer.current.clientY;
      const h = window.innerHeight;
      const edge = 90;
      const speed = y < edge ? -Math.ceil((edge - y) / 7) : y > h - edge ? Math.ceil((y - (h - edge)) / 7) : 0;
      if (speed !== 0) {
        const target = (box.current?.closest("[data-layer] > div") as HTMLElement | null) ?? document.scrollingElement;
        const before = target?.scrollTop ?? 0;
        target?.scrollBy(0, speed);
        if ((target?.scrollTop ?? 0) !== before) move(pointer.current.clientX, pointer.current.clientY);
      }
      scroller.current = requestAnimationFrame(tick);
    };
    if (scroller.current === null) scroller.current = requestAnimationFrame(tick);
  }, [move]);

  const begin = useCallback(
    (id: string, pointerId: number, clientX: number, clientY: number) => {
      const rect = layoutRef.current.tiles.find((t) => t.id === id);
      if (!rect) return;
      const p = local(clientX, clientY);
      const d: Drag = { id, pointerId, fx: Math.min(1, Math.max(0, (p.x - rect.x) / rect.w)), fy: Math.min(1, Math.max(0, (p.y - rect.y) / rect.h)), x: p.x, y: p.y };
      dragRef.current = d;
      lastSwap.current = null;
      suppressClick.current = true;
      setOrder(idsRef.current);
      setDrag(d);
      haptics.done();
      autoScroll();
    },
    [autoScroll, local],
  );

  const finish = useCallback(
    (commit: boolean) => {
      if (pending.current) window.clearTimeout(pending.current.timer);
      pending.current = null;
      stopScroll();
      const d = dragRef.current;
      dragRef.current = null;
      if (!d) return;
      setDrag(null);
      const next = idsRef.current;
      const before = items.map((i) => i.id);
      if (commit && onReorder && next.join() !== before.join()) onReorder(next);
      else setOrder(null);
      // The click that follows the release belongs to the drag, not to the tile.
      window.setTimeout(() => (suppressClick.current = false), 60);
    },
    [items, onReorder],
  );

  // Once the saved order matches what was dragged, stop overriding it.
  useEffect(() => {
    if (order && !dragRef.current && items.map((i) => i.id).join() === order.join()) {
      // The override exists only to bridge the moment between the drop and the save.
      setOrder(null);
    }
  }, [items, order]);

  // While a piece is held, the page must not scroll under the finger. This has to be a real listener: React's are passive.
  useEffect(() => {
    const el = box.current;
    if (!el || !onReorder) return;
    const block = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault();
    };
    el.addEventListener("touchmove", block, { passive: false });
    return () => el.removeEventListener("touchmove", block);
  }, [onReorder]);

  useEffect(() => () => stopScroll(), []);

  const handlers = (id: string) =>
    onReorder
      ? {
          onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
            if (e.button !== 0 || dragRef.current) return;
            const { pointerId, clientX, clientY } = e;
            const el = e.currentTarget;
            pointer.current = { clientX, clientY };
            if (pending.current) window.clearTimeout(pending.current.timer);
            const timer = window.setTimeout(() => {
              pending.current = null;
              try {
                el.setPointerCapture(pointerId);
              } catch {
                // The pointer is already gone.
              }
              begin(id, pointerId, pointer.current.clientX, pointer.current.clientY);
            }, HOLD_MS);
            pending.current = { id, pointerId, x: clientX, y: clientY, timer };
          },
          onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
            pointer.current = { clientX: e.clientX, clientY: e.clientY };
            const p = pending.current;
            if (p && p.pointerId === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP) {
              // Moved before the hold finished: this is a scroll, not a drag.
              window.clearTimeout(p.timer);
              pending.current = null;
            }
            if (dragRef.current?.pointerId === e.pointerId) move(e.clientX, e.clientY);
          },
          onPointerUp: () => finish(true),
          onPointerCancel: () => finish(false),
          onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
        }
      : {};

  const interactive = !!onOpen || !!onReorder;

  return (
    <div
      ref={box}
      className={cn("relative w-full select-none [-webkit-touch-callout:none]", className)}
      style={{ height: width ? layout.height : undefined, minHeight: width ? undefined : 200 }}
      role={interactive ? "list" : undefined}
      aria-label={interactive ? "Pieces on this board" : undefined}
    >
      {width
        ? layout.tiles.map((rect) => {
            const item = byId.get(rect.id);
            if (!item) return null;
            const held = drag?.id === rect.id;
            const x = held ? drag.x - drag.fx * rect.w : rect.x;
            const y = held ? drag.y - drag.fy * rect.h : rect.y;
            return (
              <div
                key={rect.id}
                role={interactive ? "listitem" : undefined}
                className={cn(
                  "absolute top-0 left-0 will-change-transform motion-reduce:transition-none",
                  held ? "z-20" : "z-0 transition-[transform,width,height] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
                )}
                style={{ transform: `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`, width: rect.w, height: rect.h }}
              >
                <Tile
                  item={item}
                  rect={rect}
                  bare={bare}
                  held={held}
                  onClick={
                    onOpen
                      ? () => {
                          if (suppressClick.current) return;
                          haptics.tap();
                          onOpen(item);
                        }
                      : undefined
                  }
                  handlers={handlers(rect.id)}
                />
              </div>
            );
          })
        : null}
    </div>
  );
}

function describe(item: BoardItem): string {
  if (item.kind === "color") return `Color ${item.color ?? ""}${item.note ? `, ${item.note}` : ""}`;
  if (item.kind === "note") return `Note: ${item.note ?? linkHost(item.source_url) ?? "link"}`;
  return item.note ? `Image: ${item.note}` : "Image";
}

interface TileProps {
  item: BoardItem;
  rect: TileRect;
  bare: boolean;
  held: boolean;
  onClick?: () => void;
  handlers: Record<string, unknown>;
}

function Tile({ item, rect, bare, held, onClick, handlers }: TileProps) {
  const shape = cn(
    "relative block size-full overflow-hidden text-left transition-[box-shadow,scale] duration-200 [touch-action:pan-y]",
    bare ? "rounded-none" : "rounded-[16px]",
    held ? "scale-[1.04] shadow-float" : "",
  );
  const body =
    item.kind === "image" ? <ImageBody item={item} /> : item.kind === "color" ? <ColorBody item={item} wide={rect.w > 190} /> : <NoteBody item={item} rect={rect} bare={bare} />;
  if (!onClick && Object.keys(handlers).length === 0) return <div className={shape}>{body}</div>;
  return (
    <button type="button" aria-label={describe(item)} onClick={onClick} className={cn(shape, "outline-none focus-visible:ring-2 focus-visible:ring-ink")} {...handlers}>
      {body}
    </button>
  );
}

function ImageBody({ item }: { item: BoardItem }) {
  const url = usePhoto(item.image_url);
  const [loaded, setLoaded] = useState(false);
  const tone = item.palette?.[0];
  return (
    // The image's own main color holds its place until it paints, so the board never flashes empty boxes.
    <span className="block size-full bg-surface-2" style={tone ? { backgroundColor: tone } : undefined}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) rememberAspect(item, img.naturalWidth / img.naturalHeight);
            setLoaded(true);
          }}
          className={cn("pointer-events-none size-full object-cover transition-opacity duration-500", loaded ? "opacity-100" : "opacity-0")}
        />
      ) : null}
    </span>
  );
}

function ColorBody({ item, wide }: { item: BoardItem; wide: boolean }) {
  const color = item.color ?? "#808080";
  const ink = inkOnColor(color);
  return (
    <span className="flex size-full flex-col justify-end p-3" style={{ backgroundColor: color, color: ink }}>
      {item.note ? <span className={cn("on-swatch line-clamp-2 font-medium tracking-[-0.02em]", wide ? "text-[17px] leading-[1.15]" : "text-[14px] leading-[1.15]")}>{item.note}</span> : null}
      <span className="on-swatch mt-1 text-[11px] font-medium tracking-[0.12em] uppercase">{color.replace("#", "")}</span>
    </span>
  );
}

function NoteBody({ item, rect, bare }: { item: BoardItem; rect: TileRect; bare: boolean }) {
  const text = item.note ?? "";
  const host = linkHost(item.source_url);
  const m = noteMetrics(text.length, rect.w, !!host);
  // A grown tile has room for more lines than the estimate gave it.
  const room = Math.max(1, Math.floor((rect.h - NOTE_PAD * 2 - (host ? 30 : 0)) / m.lineHeight));
  return (
    <span className={cn("flex size-full flex-col justify-between text-ink", bare ? "bg-surface" : "tile rounded-[16px]")} style={{ padding: NOTE_PAD }}>
      {text ? (
        <span
          className={cn("block overflow-hidden break-words", m.fontSize >= 20 ? "font-medium tracking-[-0.03em]" : m.fontSize >= 16 ? "font-medium tracking-[-0.015em]" : "text-ink-2")}
          style={{ fontSize: m.fontSize, lineHeight: `${m.lineHeight}px`, display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: room }}
        >
          {text}
        </span>
      ) : (
        <span />
      )}
      {host ? (
        <span className="t-label mt-2 flex items-center gap-1 truncate normal-case tracking-[0.02em]">
          <ArrowUpRight size={13} aria-hidden className="shrink-0" />
          <span className="truncate">{host}</span>
        </span>
      ) : null}
    </span>
  );
}
