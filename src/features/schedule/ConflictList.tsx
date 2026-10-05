"use client";

import { TriangleAlert } from "lucide-react";
import type { DayBlock } from "@/lib/blocks";
import { findCalendarConflicts } from "@/lib/logic/calendar";
import { formatDuration, formatTime } from "@/lib/logic/dates";
import { findOverlaps } from "@/lib/logic/schedule";

export interface DayIssue {
  key: string;
  /** The block to open when the row is tapped. */
  block: DayBlock;
  title: string;
  detail: string;
}

/**
 * Everything on the day that sits on top of something else. Collisions with
 * class or a calendar event come first, then other overlaps.
 */
export function dayIssues(blocks: readonly DayBlock[]): DayIssue[] {
  const out: DayIssue[] = [];
  const seen = new Set<string>();
  const pair = (a: string, b: string) => [a, b].sort().join("|");
  for (const c of findCalendarConflicts(blocks)) {
    seen.add(pair(c.event.id, c.block.id));
    out.push({
      key: pair(c.event.id, c.block.id),
      block: c.block,
      title: `${c.block.block_name} overlaps ${c.event.block_name}`,
      detail: `${formatTime(c.start)} to ${formatTime(c.end)}, ${formatDuration(c.minutes)}`,
    });
  }
  for (const o of findOverlaps(blocks)) {
    const key = pair(o.a.id, o.b.id);
    if (seen.has(key)) continue;
    // Open the one that can move.
    const block = o.b.flexible || !o.a.flexible ? o.b : o.a;
    const other = block === o.b ? o.a : o.b;
    out.push({
      key,
      block,
      title: `${block.block_name} overlaps ${other.block_name}`,
      detail: `${formatTime(o.start)} to ${formatTime(o.end)}, ${formatDuration(o.minutes)}${other.flexible ? "" : `. ${other.block_name} is fixed`}`,
    });
  }
  return out;
}

export function ConflictList({ issues, onOpen }: { issues: readonly DayIssue[]; onOpen: (block: DayBlock) => void }) {
  if (issues.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-[20px] border border-warn-line bg-warn-soft" data-conflicts>
      <p className="t-label flex items-center gap-2 px-4 pt-3.5 pb-1 text-warn">
        <TriangleAlert size={14} strokeWidth={1.75} aria-hidden />
        {issues.length} {issues.length === 1 ? "conflict" : "conflicts"}
      </p>
      <div className="divide-y divide-hair">
        {issues.map((i) => (
          <button key={i.key} type="button" onClick={() => onOpen(i.block)} className="pressable flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] text-ink">{i.title}</span>
              <span className="t-caption mt-0.5 block truncate text-ink-2">{i.detail}</span>
            </span>
            <span className="shrink-0 text-[13px] font-medium text-warn">Fix</span>
          </button>
        ))}
      </div>
    </div>
  );
}
