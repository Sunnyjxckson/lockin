"use client";

import { useId, type ReactNode } from "react";
import { cn } from "./cn";

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

type Tone = "accent" | "ink" | "warn";

export interface ProgressRingProps {
  /** 0 to 1. */
  value: number;
  /** Outer diameter in px. Default 88. */
  size?: number;
  /** Ring thickness in px. Default scales with size. */
  stroke?: number;
  /** Drawn in the middle: a percent, a number, an icon. */
  children?: ReactNode;
  /** accent (default) is the gradient, for primary progress. ink for neutral, warn for over a limit. */
  tone?: Tone;
  /** Read by screen readers, for example "Checklist". */
  label?: string;
  className?: string;
}

export function ProgressRing({ value, size = 88, stroke, children, tone = "accent", label, className }: ProgressRingProps) {
  const id = useId();
  const v = clamp01(value);
  const w = stroke ?? Math.max(3, Math.round(size * 0.07));
  const r = (size - w) / 2;
  const c = 2 * Math.PI * r;
  const paint = tone === "accent" ? `url(#${id})` : tone === "ink" ? "var(--ink)" : "var(--warn)";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hair)" strokeWidth={w} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={paint}
          strokeWidth={w}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset 600ms var(--ease-out)", opacity: v === 0 ? 0 : 1 }}
        />
      </svg>
      {children !== undefined ? <div className="absolute inset-0 flex items-center justify-center">{children}</div> : null}
    </div>
  );
}

export interface ProgressBarProps {
  /** 0 to 1. */
  value: number;
  /** Bar height in px. Default 3, the hairline. Use 6 to 8 only where the bar is the main thing in a card. */
  height?: number;
  /** accent (default) is the gradient. ink for neutral, warn for over a limit. */
  tone?: Tone;
  /** A faint tick at this position (0 to 1), for example a daily floor. */
  marker?: number;
  label?: string;
  className?: string;
}

/** A progress line. Thin by default: the look uses hairlines, not thick bars. */
export function ProgressBar({ value, height = 3, tone = "accent", marker, label, className }: ProgressBarProps) {
  const v = clamp01(value);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className={cn("relative w-full overflow-hidden rounded-full bg-hair", className)}
      style={{ height }}
    >
      <div
        className={cn("h-full rounded-full", tone === "accent" ? "grad-line" : tone === "ink" ? "bg-ink" : "bg-warn")}
        style={{
          width: `${v * 100}%`,
          minWidth: v > 0 ? height : 0,
          transition: "width 600ms var(--ease-out)",
        }}
      />
      {marker !== undefined ? (
        <span className="absolute top-0 h-full w-0.5 bg-ink-3" style={{ left: `${clamp01(marker) * 100}%` }} aria-hidden />
      ) : null}
    </div>
  );
}
