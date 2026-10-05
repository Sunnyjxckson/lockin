import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Inner padding. Default true (16px). Pass false for edge to edge rows. */
  padded?: boolean;
  /** A slightly lighter surface, for a card inside a card. */
  raised?: boolean;
}

export function Card({ padded = true, raised = false, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-line",
        raised ? "bg-surface-2" : "bg-surface",
        padded && "p-4",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface SectionProps {
  /** Uppercase eyebrow above the content. */
  title: string;
  /** Sits on the right of the title: a count, a link, a small button. */
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A titled group on a page: eyebrow label, then content. */
export function Section({ title, right, className, children }: SectionProps) {
  return (
    <section className={cn("mt-7", className)}>
      <div className="mb-2.5 flex min-h-5 items-center justify-between px-1">
        <h2 className="t-label">{title}</h2>
        {right ? <div className="text-[13px] text-ink-2">{right}</div> : null}
      </div>
      {children}
    </section>
  );
}
