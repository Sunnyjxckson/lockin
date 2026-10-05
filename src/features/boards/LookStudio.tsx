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
  background: "The page",
  surface: "Sheets",
  text: "Words and numbers",
  accent: "Done and progress",
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
          <Button variant="secondary" size="lg" icon={<RotateCcw size={16} strokeWidth={1.75} aria-hidden />} onClick={() => void backToBase()} disabled={!custom && !live} aria-label="Back to base">
            Base
          </Button>
          <Button full size="lg" onClick={() => void apply()}>
            Apply to the app
          </Button>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[480px] px-5 pt-[var(--safe-t)] pb-8">
        <div className="sticky top-0 z-10 -mx-5 border-b border-hair bg-bg px-5 pb-5">
          <div className="flex h-14 items-center justify-between">
            <div>
              <p className="t-label">{board.name}</p>
              <h2 className="t-h2">The look</h2>
            </div>
            <IconButton label="Close" onClick={onClose} className="-mr-2.5">
              <X size={22} strokeWidth={1.75} aria-hidden />
            </IconButton>
          </div>
          <div className="flex items-stretch gap-4">
            <MiniToday theme={theme} />
            <div className="flex min-w-0 flex-1 flex-col gap-2" aria-label="Colors in use">
              {ROLES.map((role) => {
                const used = theme.tokens[ROLE_TOKEN[role]];
                const moved = shifts.find((s) => s.role === role)?.noticeable;
                return (
                  <div key={role} className="flex min-h-0 flex-1 flex-col justify-end rounded-[14px] border border-hair px-3 py-2" style={{ backgroundColor: used, color: inkOnColor(used) }}>
                    <span className="text-[13px] leading-tight font-medium tracking-[-0.01em]">{ROLE_LABEL[role]}</span>
                    <span className="mt-0.5 text-[9px] leading-tight tracking-[0.14em] uppercase">
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
          <p className="tile t-sub mt-6 rounded-[20px] px-4 py-3">No colors on this board yet. Add an image or a swatch.</p>
        ) : null}

        {images.length > 0 ? (
          <section className="mt-7">
            <p className="t-label mb-3">Colors from</p>
            <div className="no-scrollbar -mx-5 flex gap-2.5 overflow-x-auto px-5 py-1">
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

        <section className="mt-7">
          <p className="t-label mb-3">Start from</p>
          <SegmentedControl label="Base theme" options={BASE_OPTIONS} value={base} onChange={setBase} />
          <p className="t-sub mt-2.5">{base === "contrast" ? "Stricter, so more colors get adjusted." : "Anything left on Base comes from here."}</p>
        </section>

        <section className="mt-7">
          <div className="mb-2 flex items-center justify-between">
            <p className="t-label">Who plays what</p>
            <Button variant="ghost" size="sm" className="-mr-3 h-9" disabled={manual === null} onClick={() => setManual(null)}>
              Auto
            </Button>
          </div>
          <div className="space-y-6">
            {ROLES.map((role) => {
              const shift = shifts.find((s) => s.role === role);
              return (
                <div key={role}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[15px] text-ink">{ROLE_LABEL[role]}</p>
                    <p className="t-caption truncate text-ink-2">{ROLE_HELP[role]}</p>
                  </div>
                  <div role="radiogroup" aria-label={ROLE_LABEL[role]} className="no-scrollbar -mx-5 mt-2 flex gap-3 overflow-x-auto px-5 py-1.5">
                    <Swatch on={roles[role] === null} label={`${ROLE_LABEL[role]}: base`} onClick={() => choose(role, null)}>
                      <span className="flex size-full items-center justify-center bg-surface-2 text-[9px] font-medium tracking-[0.1em] text-ink-2 uppercase">Base</span>
                    </Swatch>
                    {colors.map((c) => (
                      <Swatch key={c} on={roles[role] === c} label={`${ROLE_LABEL[role]}: ${c}`} onClick={() => choose(role, c)} color={c} />
                    ))}
                  </div>
                  {shift?.noticeable ? (
                    <div className="tile mt-2 flex items-center gap-3 rounded-[16px] px-3.5 py-2.5">
                      <span className="flex shrink-0 items-center gap-1.5" aria-hidden>
                        <span className="size-6 rounded-full border border-hair" style={{ backgroundColor: shift.asked }} />
                        <ArrowRight size={13} strokeWidth={1.75} className="text-ink-3" />
                        <span className="size-6 rounded-full border border-hair" style={{ backgroundColor: shift.used }} />
                      </span>
                      <p className="t-caption min-w-0 text-ink-2">
                        Adjusted. {shift.why}
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="tile mt-7 rounded-[20px] px-4 py-3.5">
          <Toggle checked={live} onChange={setLive} label="Try it on the whole app" />
          <p className="t-caption mt-2 text-ink-2">Nothing is saved until you apply.</p>
        </section>

        <p className={cn("t-caption mt-4 px-1", failing.length > 0 ? "text-warn" : "text-ink-2")}>
          {failing.length > 0
            ? `${failing.length} text pairs fall short of the contrast standard. Try another text or background color.`
            : `Every piece of text passes the contrast standard. The tightest pair is ${tightest.toFixed(1)} to 1.`}
        </p>
        {custom ? (
          <p className="t-caption mt-2 px-1 text-ink-2">
            Wearing {current.name ?? "a custom look"} now. Base goes back to {BASE_THEMES[current.base].name}.
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
      className={cn("pressable relative size-11 shrink-0 overflow-hidden rounded-full border", on ? "border-ink outline outline-[1.5px] outline-offset-2 outline-ink" : "border-hair")}
      style={color ? { backgroundColor: color } : undefined}
    >
      {children}
      {on && color ? (
        <span className="absolute inset-0 flex items-center justify-center" style={{ color: inkOnColor(color) }}>
          <Check size={16} strokeWidth={2} aria-hidden />
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
      className={cn("pressable size-14 shrink-0 overflow-hidden rounded-[16px] border", on ? "border-ink outline outline-[1.5px] outline-offset-2 outline-ink" : "border-hair")}
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
