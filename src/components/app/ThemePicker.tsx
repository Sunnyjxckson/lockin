"use client";

import { Check } from "lucide-react";
import { Button, Card, cn, useToast } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { BASE_THEMES, THEME_BASES, buildTheme } from "@/lib/logic/theme";
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
          // Each tile previews its base with the current palette on top, in that theme's own tokens.
          const t = buildTheme(id, palette).tokens;
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
              className={cn("pressable overflow-hidden rounded-[20px] border-2 text-left", on ? "border-ink" : "border-line")}
              style={{ background: t.bg, color: t.ink }}
            >
              <span className="block px-3.5 pt-3.5">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-semibold">{b.name}</span>
                  {on ? (
                    <span className="flex size-5 items-center justify-center rounded-full" style={{ background: t.ink, color: t.bg }}>
                      <Check size={13} strokeWidth={3.5} aria-hidden />
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-[12px] leading-snug" style={{ color: t["ink-2"] }}>
                  {b.blurb}
                </span>
              </span>
              <span className="mt-3 block px-3.5 pb-3.5" aria-hidden>
                <span className="flex items-center gap-2 rounded-[12px] border px-2.5 py-2" style={{ background: t.surface, borderColor: t.line }}>
                  <span className="size-4 rounded-full" style={{ background: t.accent }} />
                  <span className="h-1.5 flex-1 rounded-full" style={{ background: t["surface-3"] }}>
                    <span className="block h-full w-2/3 rounded-full" style={{ background: t.accent }} />
                  </span>
                  <span className="tnum text-[12px] font-semibold" style={{ color: t["ink-2"] }}>
                    26/30
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {palette ? (
        <Card className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-medium">Your palette is on top</p>
            <p className="mt-0.5 text-[13px] text-ink-3">
              {theme.adjusted.length > 0 ? "Some colors were adjusted so everything stays readable." : "Pulled from a board."}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void reset().then(() => toast("Back to the base theme", { kind: "done" }))}>
            Reset
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
