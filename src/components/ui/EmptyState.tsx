import type { ReactNode } from "react";
import { cn } from "./cn";

export interface EmptyStateProps {
  /** An icon, usually from lucide-react at size 22 (18 to 20 in a row). */
  icon?: ReactNode;
  title: string;
  body?: string;
  /** A Button or link. */
  action?: ReactNode;
  /** Less vertical padding, for use inside a card. */
  compact?: boolean;
  /**
   * One quiet row, left aligned, on its own tile: for a small group with
   * nothing in it yet (no favorites, nothing flagged) where a centred block
   * would shout. Needs no Card around it.
   */
  row?: boolean;
  className?: string;
}

/** What a screen or a list shows with nothing in it yet: one short line, one sentence, one way forward. */
export function EmptyState({ icon, title, body, action, compact = false, row = false, className }: EmptyStateProps) {
  if (row) {
    return (
      <div className={cn("tile flex min-h-[64px] items-center gap-3.5 rounded-[20px] px-4 py-3", className)}>
        {icon ? <span className="flex shrink-0 items-center text-ink-2">{icon}</span> : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] text-ink">{title}</h3>
          {body ? <p className="t-caption mt-0.5 text-ink-2">{body}</p> : null}
        </div>
        {action ? <div className="-mr-1.5 shrink-0">{action}</div> : null}
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      {icon ? <div className="glass mb-5 flex size-14 items-center justify-center rounded-full text-ink-2">{icon}</div> : null}
      <h3 className="t-h2">{title}</h3>
      {body ? <p className="t-sub mt-2 max-w-[260px]">{body}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
