"use client";

import { TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui";
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
    <Card padded={false} className="overflow-hidden border-warn/40" data-conflicts>
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-1">
        <TriangleAlert size={16} className="text-warn" aria-hidden />
        <p className="t-label text-warn">
          {issues.length} {issues.length === 1 ? "conflict" : "conflicts"}
        </p>
      </div>
      <div className="divide-y divide-line">
        {issues.map((i) => (
          <button key={i.key} type="button" onClick={() => onOpen(i.block)} className="pressable flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-ink">{i.title}</span>
              <span className="tnum block truncate text-[13px] text-ink-2">{i.detail}</span>
            </span>
            <span className="shrink-0 text-[13px] font-semibold text-ink-2">Fix</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
