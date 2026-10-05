import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Inner padding. Default true (16px). Pass false for edge to edge rows. */
  padded?: boolean;
  /** A solid, slightly lighter surface, for a card inside a card or inside a sheet. */
  raised?: boolean;
}

/** The standard card: frosted glass with a hairline border. */
export function Card({ padded = true, raised = false, className, children, ...rest }: CardProps) {
  return (
    <div className={cn("rounded-[24px]", raised ? "border border-line bg-surface-2" : "glass", padded && "p-4", className)} {...rest}>
      {children}
    </div>
  );
}

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Inner padding: "md" 16px, "lg" 18px by 20px (default, the Now card), false for none. */
  pad?: "md" | "lg" | false;
  /** Really blur what is behind it. Only for a card that floats over scrolling content. Off by default: see the note on `frost` in globals.css. */
  frost?: boolean;
}

/**
 * The feature card of a screen: larger radius and padding than Card. Use it
 * for the one or two things a screen leads with (Now and Next, today's
 * money), and Card for everything else.
 */
export function GlassCard({ pad = "lg", frost = false, className, children, ...rest }: GlassCardProps) {
  return (
    <div className={cn("rounded-[26px]", frost ? "frost" : "glass", pad === "lg" && "px-5 py-[18px]", pad === "md" && "p-4", className)} {...rest}>
      {children}
    </div>
  );
}

export interface SectionLabelProps {
  /** The label, drawn small, uppercase and tracked. */
  children: ReactNode;
  /** Sits at the right end: a count ("7 of 12"), a link, a small action. */
  right?: ReactNode;
  /** Render the label as this heading level. Default "h2". */
  as?: "h2" | "h3" | "p";
  className?: string;
}

/** The small uppercase line that opens a group: "TODAY   7 OF 12". */
export function SectionLabel({ children, right, as: Tag = "h2", className }: SectionLabelProps) {
  return (
    <div className={cn("flex min-h-5 items-center justify-between gap-3 px-1", className)}>
      <Tag className="t-label min-w-0 truncate">{children}</Tag>
      {right ? <div className="t-label shrink-0">{right}</div> : null}
    </div>
  );
}

export interface SectionProps {
  /** Uppercase label above the content. */
  title: string;
  /** Sits on the right of the title: a count, a link, a small button. */
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A titled group on a page: a SectionLabel, then content, with the standard gap above. */
export function Section({ title, right, className, children }: SectionProps) {
  return (
    <section className={cn("mt-7", className)}>
      <SectionLabel right={right} className="mb-3">
        {title}
      </SectionLabel>
      {children}
    </section>
  );
}
