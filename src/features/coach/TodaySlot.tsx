"use client";

// The morning brief as a compact card for the top of Today. Self-contained:
// mount <TodaySlot /> with no props. It renders nothing outside the
// challenge dates. The first open of the day writes the brief.

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Card, cn } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { plural } from "@/lib/logic/coach";
import { NoteBody } from "./parts";
import { useCoach } from "./useCoach";

// Remembered for the session, per day: open until you close it.
const closedOn = new Set<string>();

export function TodaySlot({ className }: { className?: string }) {
  const coach = useCoach("missing");
  const [, bump] = useState(0);

  if (coach.loading || coach.phase !== "active") return null;
  if (!coach.brief && !coach.writingBrief) return null;

  const open = !closedOn.has(coach.today);
  const toggle = () => {
    if (open) closedOn.add(coach.today);
    else closedOn.delete(coach.today);
    haptics.tap();
    bump((n) => n + 1);
  };
  const firstLine = coach.brief?.body.split(/\n+/)[0] ?? "";

  return (
    <Card padded={false} className={cn("overflow-hidden", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="coach-brief"
        className="pressable flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="t-label block">Morning brief</span>
          {!open && firstLine ? <span className="mt-1 block truncate text-[14px] text-ink-2">{firstLine}</span> : null}
        </span>
        {coach.flags.length > 0 ? (
          <span className="tnum flex shrink-0 items-center gap-1.5 text-[13px] text-ink-2">
            <span className="size-1.5 rounded-full bg-warn" aria-hidden />
            {plural(coach.flags.length, "flag")}
          </span>
        ) : null}
        <ChevronDown size={18} className={cn("shrink-0 text-ink-3 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div id="coach-brief" className="animate-fade-in px-4 pb-4">
          {coach.brief ? (
            <>
              <NoteBody body={coach.brief.body} className="[&_p]:text-[15px]" />
              <Link href="/coach" className="mt-3 inline-flex min-h-11 items-center text-[14px] font-semibold text-ink underline underline-offset-4">
                {coach.flags.length > 0 ? `Open coach, ${plural(coach.flags.length, "flag")}` : "Open coach"}
              </Link>
            </>
          ) : (
            <div aria-busy="true">
              <div className="flex flex-col gap-2.5 pt-1" aria-hidden>
                <div className="h-3.5 w-[90%] animate-pulse rounded-full bg-surface-3" />
                <div className="h-3.5 w-[72%] animate-pulse rounded-full bg-surface-3" />
              </div>
              <p className="t-sub mt-3">Writing today&apos;s brief.</p>
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}

export default TodaySlot;
