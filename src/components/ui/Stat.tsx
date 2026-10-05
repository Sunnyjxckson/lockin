import type { ReactNode } from "react";
import { cn } from "./cn";

export interface StatProps {
  /** Uppercase eyebrow. */
  label: string;
  /** The number, already formatted. */
  value: ReactNode;
  /** Small text right after the number: "lb", "/ 30", "left". */
  unit?: string;
  /** Line under the number. */
  sub?: ReactNode;
  /** display 64px, lg 40px (default), sm 28px. */
  size?: "display" | "lg" | "sm";
  /** Paint the number in the accent. Only when the stat is a done state. */
  done?: boolean;
  align?: "left" | "center";
  className?: string;
}

/** A big numeral with a label. The main way numbers are shown. */
export function Stat({ label, value, unit, sub, size = "lg", done = false, align = "left", className }: StatProps) {
  return (
    <div className={cn("flex flex-col", align === "center" && "items-center text-center", className)}>
      <span className="t-label">{label}</span>
      <span className="mt-1.5 flex items-baseline gap-1.5">
        <span className={cn(size === "display" ? "t-display" : size === "lg" ? "t-num" : "t-num-sm", done && "text-accent")}>
          {value}
        </span>
        {unit ? <span className="text-[15px] font-medium text-ink-3">{unit}</span> : null}
      </span>
      {sub ? <span className="t-sub mt-1.5">{sub}</span> : null}
    </div>
  );
}
