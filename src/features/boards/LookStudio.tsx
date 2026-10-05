"use client";

// The board sets the app's look. Pick which of the board's colors plays
// background, cards, text and accent, watch a small Today change as you go,
// then apply it to the whole app. The way back to the base is always here.

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, RotateCcw, X } from "lucide-react";
import { Button, IconButton, SegmentedControl, Toggle, cn, useToast } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import {
  ROLES,
  ROLE_LABEL,
  ROLE_TOKEN,
  autoRoles,
  boardPalette,
  dedupeColors,
  inkOnColor,
  paletteToRoles,
  roleShifts,
  rolesToPalette,
  type Role,
  type RoleChoice,
} from "@/lib/logic/boards";
import { BASE_THEMES, THEME_BASES, auditTheme, buildTheme } from "@/lib/logic/theme";
import { usePhoto } from "@/lib/storage/hooks";
import { previewTheme, resetTheme, setThemeFromPalette, useTheme } from "@/lib/theme";
import type { Board, BoardItem, ThemeBase } from "@/lib/types";
import { MiniToday } from "./MiniToday";
import { Overlay } from "./Overlay";

export interface LookStudioProps {
  board: Board;
  items: BoardItem[];
  /** Start from one image's palette instead of the whole board's. */
  imageId?: string | null;
  onClose: () => void;
}

const BASE_OPTIONS = THEME_BASES.map((b) => ({ value: b, label: BASE_THEMES[b].name }));

const ROLE_HELP: Record<Role, string> = {
  background: "The page itself.",
  surface: "Cards and sheets on top of the page.",
  text: "Words and numbers. Buttons too.",
  accent: "Done states and progress. Nothing else.",
};

export function LookStudio({ board, items, imageId = null, onClose }: LookStudioProps) {
  const toast = useToast();
  const current = useTheme();
  const images = useMemo(() => items.filter((i) => i.kind === "image" && (i.palette?.length ?? 0) > 0), [items]);
  const [source, setSource] = useState<string | null>(imageId && images.some((i) => i.id === imageId) ? imageId : null);
  const [base, setBase] = useState<ThemeBase>(current.base);
  const [live, setLive] = useState(false);

  const colors = useMemo(() => {
    const image = source ? images.find((i) => i.id === source) : null;
    return image ? dedupeColors(image.palette ?? [], 0.02) : boardPalette(items, 12);
  }, [source, images, items]);

  // Start from what is already applied when it came from this board, otherwise from the automatic pick.
  const [manual, setManual] = useState<RoleChoice | null>(() => (!imageId && current.boardId === board.id && current.palette ? paletteToRoles(current.palette) : null));
  const auto = useMemo(() => autoRoles(colors, base), [colors, base]);
  const roles = manual ?? auto;
  const palette = useMemo(() => rolesToPalette(roles), [roles]);
  const theme = useMemo(() => buildTheme(base, palette), [base, palette]);
  const shifts = useMemo(() => roleShifts(roles, theme), [roles, theme]);
  const audit = useMemo(() => auditTheme(theme), [theme]);
  const failing = audit.filter((c) => !c.pass);
  const tightest = audit.reduce((m, c) => Math.min(m, c.ratio), 21);

  useEffect(() => {
    previewTheme(live ? palette : null, live ? base : undefined);
  }, [live, palette, base]);
  useEffect(() => () => void previewTheme(null), []);

  const choose = (role: Role, color: string | null) => {
    haptics.tap();
    const next: RoleChoice = { ...roles, [role]: color };
    // One color, one job. Taking a color for a role frees it from any other.
    if (color) for (const other of ROLES) if (other !== role && next[other] === color) next[other] = null;
    setManual(next);
  };

  const apply = async () => {
    await setThemeFromPalette(palette, { boardId: board.id, name: board.name, base });
    haptics.done();
    toast(Object.keys(palette).length > 0 ? `The app now wears ${board.name}` : `${BASE_THEMES[base].name} is on`, { kind: "done" });
    onClose();
  };

  const backToBase = async () => {
    setLive(false);
    await resetTheme();
    toast(`Back to ${BASE_THEMES[current.base].name}`, { kind: "done" });
    onClose();
  };

  const custom = current.palette !== null;

  return (
    <Overlay
      onClose={onClose}
      label="Set the app's look"
      footer={
        <div className="mx-auto flex w-full max-w-[440px] gap-2.5">
          <Button variant="secondary" icon={<RotateCcw size={16} aria-hidden />} onClick={() => void backToBase()} disabled={!custom && !live} aria-label="Back to base">
            Base
          </Button>
          <Button full onClick={() => void apply()}>
            Apply to the app
          </Button>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[480px] px-5 pt-[var(--safe-t)] pb-8">
        <div className="sticky top-0 z-10 -mx-5 border-b border-line bg-bg px-5 pb-4">
          <div className="flex h-14 items-center justify-between">
            <div>
              <p className="t-label">{board.name}</p>
              <h2 className="t-h2">The look</h2>
            </div>
            <IconButton label="Close" onClick={onClose} className="-mr-2.5">
              <X size={24} aria-hidden />
            </IconButton>
          </div>
          <div className="flex items-stretch gap-4">
            <MiniToday theme={theme} />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5" aria-label="Colors in use">
              {ROLES.map((role) => {
                const used = theme.tokens[ROLE_TOKEN[role]];
                const moved = shifts.find((s) => s.role === role)?.noticeable;
                return (
                  <div key={role} className="flex min-h-0 flex-1 flex-col justify-end rounded-[4px] border border-line px-2 py-1.5" style={{ backgroundColor: used, color: inkOnColor(used) }}>
                    <span className="text-[10px] leading-tight font-semibold">{ROLE_LABEL[role]}</span>
                    <span className="tnum text-[9px] leading-tight tracking-[0.1em] uppercase opacity-80">
                      {used.replace("#", "")}
                      {roles[role] ? (moved ? " adjusted" : "") : " base"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {colors.length === 0 ? (
          <p className="t-sub mt-5 rounded-[14px] border border-line bg-surface p-4">This board has no colors yet. Add an image or a swatch and its colors show up here. Until then the base theme is what you get.</p>
        ) : null}

        {images.length > 0 ? (
          <section className="mt-5">
            <p className="t-label mb-2">Colors from</p>
            <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
              <SourceChip on={source === null} label="Whole board" onClick={() => (setSource(null), setManual(null))}>
                <span className="flex size-full flex-wrap">
                  {boardPalette(items, 4).map((c) => (
                    <span key={c} className="h-1/2 w-1/2" style={{ backgroundColor: c }} />
                  ))}
                </span>
              </SourceChip>
              {images.map((img, i) => (
                <SourceChip key={img.id} on={source === img.id} label={`Image ${i + 1}`} onClick={() => (setSource(img.id), setManual(null))}>
                  <Thumb item={img} />
                </SourceChip>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-5">
          <p className="t-label mb-2">Start from</p>
          <SegmentedControl label="Base theme" options={BASE_OPTIONS} value={base} onChange={setBase} />
          <p className="t-sub mt-2">{base === "contrast" ? "High contrast holds every color to a stricter standard, so more of them get adjusted." : "Yours on top. Anything you leave on Base comes from here."}</p>
        </section>

        <section className="mt-6">
          <div className="mb-1 flex items-center justify-between">
            <p className="t-label">Who plays what</p>
            <Button variant="ghost" size="sm" className="-mr-3 h-9" disabled={manual === null} onClick={() => setManual(null)}>
              Auto
            </Button>
          </div>
          <div className="space-y-5">
            {ROLES.map((role) => {
              const shift = shifts.find((s) => s.role === role);
              return (
                <div key={role}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[16px] font-semibold tracking-[-0.01em]">{ROLE_LABEL[role]}</p>
                    <p className="t-sub truncate text-[12px]">{ROLE_HELP[role]}</p>
                  </div>
                  <div role="radiogroup" aria-label={ROLE_LABEL[role]} className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5 py-1">
                    <Swatch on={roles[role] === null} label={`${ROLE_LABEL[role]}: base`} onClick={() => choose(role, null)}>
                      <span className="flex size-full items-center justify-center bg-surface-2 text-[10px] font-semibold tracking-[0.06em] text-ink-2 uppercase">Base</span>
                    </Swatch>
                    {colors.map((c) => (
                      <Swatch key={c} on={roles[role] === c} label={`${ROLE_LABEL[role]}: ${c}`} onClick={() => choose(role, c)} color={c} />
                    ))}
                  </div>
                  {shift?.noticeable ? (
                    <div className="mt-2 flex items-center gap-2.5 rounded-[12px] border border-line bg-surface px-3 py-2.5">
                      <span className="flex shrink-0 items-center gap-1.5" aria-hidden>
                        <span className="size-6 rounded-[3px] border border-line" style={{ backgroundColor: shift.asked }} />
                        <ArrowRight size={13} className="text-ink-3" />
                        <span className="size-6 rounded-[3px] border border-line" style={{ backgroundColor: shift.used }} />
                      </span>
                      <p className="t-sub min-w-0 text-[13px]">
                        Not the exact color you picked. {shift.why}
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-6 rounded-[14px] border border-line bg-surface p-4">
          <Toggle checked={live} onChange={setLive} label="Try it on the whole app" />
          <p className="t-sub mt-2">Paints everything, this screen included, until you close it. Nothing is saved until you apply.</p>
        </section>

        <p className={cn("mt-4 text-[13px]", failing.length > 0 ? "text-warn" : "text-ink-3")}>
          {failing.length > 0
            ? `${failing.length} text pairs fall short of the contrast standard. Try another text or background color.`
            : `Every piece of text passes the contrast standard. The tightest pair is ${tightest.toFixed(1)} to 1.`}
        </p>
        {custom ? (
          <p className="t-sub mt-2 text-[13px]">
            The app is wearing {current.name ?? "a custom look"} right now. Base takes you back to {BASE_THEMES[current.base].name} in one tap.
          </p>
        ) : null}
      </div>
    </Overlay>
  );
}

function Swatch({ on, label, onClick, color, children }: { on: boolean; label: string; onClick: () => void; color?: string; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cn("pressable relative size-12 shrink-0 overflow-hidden rounded-[4px] border", on ? "border-ink ring-2 ring-ink ring-offset-2 ring-offset-bg" : "border-line")}
      style={color ? { backgroundColor: color } : undefined}
    >
      {children}
      {on && color ? (
        <span className="absolute inset-0 flex items-center justify-center" style={{ color: inkOnColor(color) }}>
          <Check size={18} strokeWidth={3} aria-hidden />
        </span>
      ) : null}
    </button>
  );
}

function SourceChip({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={() => {
        haptics.tap();
        onClick();
      }}
      className={cn("pressable size-14 shrink-0 overflow-hidden rounded-[4px] border", on ? "border-ink ring-2 ring-ink ring-offset-2 ring-offset-bg" : "border-line opacity-70")}
    >
      {children}
    </button>
  );
}

function Thumb({ item }: { item: BoardItem }) {
  const url = usePhoto(item.image_url);
  return (
    <span className="block size-full bg-surface-2" style={item.palette?.[0] ? { backgroundColor: item.palette[0] } : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" draggable={false} className="size-full object-cover" /> : null}
    </span>
  );
}
