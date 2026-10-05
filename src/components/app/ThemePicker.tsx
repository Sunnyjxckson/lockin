"use client";

import { Check } from "lucide-react";
import { Button, cn, useToast } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { BASE_THEMES, THEME_BASES, buildTheme, themeVars } from "@/lib/logic/theme";
import { useTheme } from "@/lib/theme";

/**
 * The base theme picker for Settings: one tile per base, each drawn in its
 * own colors. When a palette from a board is on top, it says so and offers
 * the way back. The Boards screen can mount this as well.
 */
export function ThemePicker({ className }: { className?: string }) {
  const toast = useToast();
  const { base, palette, theme, setBase, reset } = useTheme();

  return (
    <div className={className}>
      <div role="radiogroup" aria-label="Base theme" className="grid grid-cols-2 gap-3">
        {THEME_BASES.map((id) => {
          const b = BASE_THEMES[id];
          // Each tile previews its base with the current palette on top, in that theme's own colors and strengths.
          const built = buildTheme(id, palette);
          const t = built.tokens;
          const v = themeVars(built);
          const on = id === base;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={b.name}
              onClick={() => {
                if (on) return;
                haptics.tap();
                void setBase(id).then(() => toast(`${b.name} is on`, { kind: "done" }));
              }}
              className={cn("pressable relative overflow-hidden rounded-[24px] border text-left", on ? "border-ink" : "border-glass-line")}
              style={{ background: `radial-gradient(90% 70% at 90% 0%, ${v["--glow-1"]} 0%, transparent 70%), radial-gradient(80% 60% at 0% 100%, ${v["--glow-3"]} 0%, transparent 70%), ${t.bg}`, color: t.ink }}
            >
              <span className="block px-4 pt-4">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-medium tracking-[-0.01em]">{b.name}</span>
                  {on ? (
                    <span className="flex size-5 items-center justify-center rounded-full" style={{ background: t.ink, color: t.bg }}>
                      <Check size={12} strokeWidth={2} aria-hidden />
                    </span>
                  ) : null}
                </span>
                {/* Main text color, not the muted one: a tile is drawn in another theme's colors, and has to read whichever theme is on. */}
                <span className="t-caption mt-1 block leading-snug" style={{ color: t.ink }}>
                  {b.blurb}
                </span>
              </span>
              <span className="mt-3 block px-4 pb-4" aria-hidden>
                <span className="flex items-stretch gap-1.5">
                  <span className="flex h-9 flex-1 items-end rounded-[10px] px-2 pb-1.5 text-[11px] font-medium" style={{ background: `linear-gradient(145deg, ${t.accent}, ${t["accent-2"]})`, color: t["accent-ink"] }}>
                    Done
                  </span>
                  <span
                    className="tnum flex h-9 flex-1 items-end rounded-[10px] border px-2 pb-1.5 text-[11px]"
                    style={{ backgroundColor: v["--glass-smoke"], backgroundImage: `linear-gradient(160deg, ${v["--glass-hi"]}, ${v["--glass-lo"]})`, borderColor: v["--glass-line"], color: t.ink }}
                  >
                    26/30
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {palette ? (
        <div className="tile mt-3 flex items-center justify-between gap-3 rounded-[20px] py-3 pr-3 pl-4">
          <div className="min-w-0">
            <p className="text-[15px] text-ink">Your palette is on top</p>
            <p className="t-caption mt-0.5 text-ink-2">{theme.adjusted.length > 0 ? "Some colors adjusted to stay readable." : "Pulled from a board."}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void reset().then(() => toast("Back to the base theme", { kind: "done" }))}>
            Reset
          </Button>
        </div>
      ) : null}
    </div>
  );
}
