"use client";

// Pieces shared by the Coach screen, the Today card and the Progress card.

import { X } from "lucide-react";
import { Card, IconButton, cn } from "@/components/ui";
import type { Flag } from "@/lib/logic/coach";
import { formatDateShort, weekStart } from "@/lib/logic/dates";
import type { CoachNote, DateStr } from "@/lib/types";

const LABEL = /^([A-Z][A-Za-z ]{2,16}):\s+(.*)$/;

/**
 * A note's text. Lines that open with a short label ("Today: ...") get the
 * label set apart, so the brief scans in a glance. Everything else is a
 * plain paragraph.
 */
export function NoteBody({ body, className }: { body: string; className?: string }) {
  const lines = body.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {lines.map((line, i) => {
        const m = LABEL.exec(line);
        if (!m) {
          return (
            <p key={i} className="text-[16px] leading-[1.45] text-ink">
              {line}
            </p>
          );
        }
        if (m[1] === "One change") {
          return (
            <div key={i} className="mt-1 rounded-[14px] border border-line-strong bg-surface-2 px-3.5 py-3">
              <p className="t-label">One change</p>
              <p className="mt-1.5 text-[16px] leading-[1.4] font-medium text-ink">{m[2]}</p>
            </div>
          );
        }
        return (
          <p key={i} className="text-[16px] leading-[1.45] text-ink-2">
            <span className="font-semibold text-ink">{m[1]}.</span> {m[2].charAt(0).toUpperCase() + m[2].slice(1)}
          </p>
        );
      })}
    </div>
  );
}

/** "Written by Claude" or "Written by rules", so it is always clear which one you are reading. */
export function SourceTag({ source, className }: { source: CoachNote["source"]; className?: string }) {
  return <span className={cn("text-[13px] text-ink-3", className)}>{source === "ai" ? "Written by Claude from your data" : "Written by rules from your data"}</span>;
}

/** "Sep 28 to Oct 4" for the week a review is dated (its Sunday). */
export function weekLabel(sunday: DateStr): string {
  return `${formatDateShort(weekStart(sunday))} to ${formatDateShort(sunday)}`;
}

/** The evidence rows and the change, without the card around them. */
export function FlagDetail({ flag }: { flag: Flag }) {
  return (
    <>
      <p className="t-sub mt-1.5">{flag.detail}</p>
      {flag.evidence.length > 0 ? (
        <dl className="mt-3.5 divide-y divide-line overflow-hidden rounded-[14px] bg-surface-2">
          {flag.evidence.map((e, i) => (
            <div key={i} className="flex items-baseline justify-between gap-4 px-3.5 py-2.5">
              <dt className="tnum shrink-0 text-[14px] text-ink-2">{e.label}</dt>
              <dd className="tnum min-w-0 text-right text-[14px] font-medium text-ink">{e.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="mt-3.5 text-[15px] leading-[1.4] text-ink">
        <span className="t-label mr-2">Change</span>
        {flag.change}
      </p>
    </>
  );
}

export function FlagCard({ flag, onDismiss }: { flag: Flag; onDismiss?: () => void }) {
  return (
    <Card className="animate-rise-in">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 pt-0.5">
          <p className="t-label flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-warn" aria-hidden />
            Since {formatDateShort(flag.since)}
          </p>
          <h3 className="mt-2 text-[18px] leading-[1.25] font-semibold tracking-[-0.01em]">{flag.title}</h3>
        </div>
        {onDismiss ? (
          <IconButton label={`Dismiss flag: ${flag.title}`} onClick={onDismiss} className="-mt-1.5 -mr-2 shrink-0 text-ink-3">
            <X size={20} aria-hidden />
          </IconButton>
        ) : null}
      </div>
      <FlagDetail flag={flag} />
    </Card>
  );
}
