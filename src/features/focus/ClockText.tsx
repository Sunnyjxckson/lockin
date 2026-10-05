import { Fragment } from "react";

/**
 * A counting clock: fixed width digits so nothing jumps as it ticks, with the
 * colons set at their natural width so the time still reads as one figure.
 * The text content is unchanged ("19:38").
 */
export function ClockText({ text }: { text: string }) {
  const parts = text.split(":");
  return (
    <span className="tabular">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 ? <span className="mx-[-0.04em] [font-variant-numeric:normal]">:</span> : null}
          {p}
        </Fragment>
      ))}
    </span>
  );
}
