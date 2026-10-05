"use client";

// The morning brief as a compact card for the top of Today. Self-contained:
// mount <TodaySlot /> with no props. It shows in both modes, challenge or
// ongoing. The first open of the day writes the brief. It starts
// open, and once closed it stays closed for that day on this device, so the
// rest of the day Today leads with Now and Next.

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Card, cn } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { plural } from "@/lib/logic/coach";
import { getPref, setPref } from "@/lib/prefs";
import { NoteBody } from "./parts";
import { useCoach } from "./useCoach";

const CLOSED_KEY = "brief-closed";

export function TodaySlot({ className }: { className?: string }) {
  const coach = useCoach("missing");
  const [closedDay, setClosedDay] = useState(() => getPref(CLOSED_KEY));

  // Hold the collapsed height while the notes load, so nothing below jumps.
  if (coach.loading) return <Card className={cn("h-[58px]", className)} aria-busy="true" />;
  if (coach.phase !== "active") return null;
  if (!coach.brief && !coach.writingBrief) return null;

  const open = closedDay !== coach.today;
  const toggle = () => {
    const next = open ? coach.today : null;
    setPref(CLOSED_KEY, next);
    setClosedDay(next);
    haptics.tap();
  };
  const firstLine = coach.brief?.body.split(/\n+/)[0] ?? "";

  return (
    <Card padded={false} className={cn("overflow-hidden", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="coach-brief"
        className="pressable flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
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
