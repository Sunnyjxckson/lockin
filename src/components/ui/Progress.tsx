import type { ReactNode } from "react";
import { cn } from "./cn";

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

export interface ProgressRingProps {
  /** 0 to 1. */
  value: number;
  /** Outer diameter in px. Default 88. */
  size?: number;
  /** Ring thickness in px. Default scales with size. */
  stroke?: number;
  /** Drawn in the middle: a percent, a number, an icon. */
  children?: ReactNode;
  /** accent (default) for primary progress, ink for neutral, warn for over a limit. */
  tone?: "accent" | "ink" | "warn";
  /** Read by screen readers, for example "Checklist". */
  label?: string;
  className?: string;
}

const TONE: Record<NonNullable<ProgressRingProps["tone"]>, string> = {
  accent: "var(--accent)",
  ink: "var(--ink)",
  warn: "var(--warn)",
};

export function ProgressRing({ value, size = 88, stroke, children, tone = "accent", label, className }: ProgressRingProps) {
  const v = clamp01(value);
  const w = stroke ?? Math.max(4, Math.round(size * 0.1));
  const r = (size - w) / 2;
  const c = 2 * Math.PI * r;
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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={w} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TONE[tone]}
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
  /** Bar height in px. Default 8. */
  height?: number;
  tone?: "accent" | "ink" | "warn";
  /** A faint tick at this position (0 to 1), for example a daily floor. */
  marker?: number;
  label?: string;
  className?: string;
}

export function ProgressBar({ value, height = 8, tone = "accent", marker, label, className }: ProgressBarProps) {
  const v = clamp01(value);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className={cn("relative w-full overflow-hidden rounded-full bg-surface-3", className)}
      style={{ height }}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${v * 100}%`,
          minWidth: v > 0 ? height : 0,
          background: TONE[tone],
          transition: "width 600ms var(--ease-out)",
        }}
      />
      {marker !== undefined ? (
        <span className="absolute top-0 h-full w-0.5 bg-ink-3" style={{ left: `${clamp01(marker) * 100}%` }} aria-hidden />
      ) : null}
    </div>
  );
}
