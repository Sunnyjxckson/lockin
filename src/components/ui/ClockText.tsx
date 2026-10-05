import { Fragment } from "react";
import { cn } from "./cn";

/**
 * A counting clock: fixed width digits so nothing jumps as it ticks, with the
 * colons set at their natural width so the time still reads as one figure.
 * The text content is unchanged ("19:38"). Size and color come from the
 * parent or `className`.
 */
export function ClockText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(":");
  return (
    <span className={cn("tabular", className)}>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 ? <span className="mx-[-0.04em] [font-variant-numeric:normal]">:</span> : null}
          {p}
        </Fragment>
      ))}
    </span>
  );
}
