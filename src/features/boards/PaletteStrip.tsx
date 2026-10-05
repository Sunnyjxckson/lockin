"use client";

import { cn } from "@/components/ui";

export interface PaletteStripProps {
  colors: readonly string[];
  /** Height in pixels. */
  height?: number;
  className?: string;
}

/** A palette as one continuous band, like a strip of fabric swatches. The colors are the board's own, so they are set inline. */
export function PaletteStrip({ colors, height = 10, className }: PaletteStripProps) {
  if (colors.length === 0) return null;
  return (
    <div className={cn("flex w-full overflow-hidden", className)} style={{ height }} aria-hidden>
      {colors.map((c, i) => (
        <span key={`${c}-${i}`} className="min-w-0 flex-1" style={{ backgroundColor: c }} />
      ))}
    </div>
  );
}
