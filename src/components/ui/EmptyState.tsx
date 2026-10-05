import type { ReactNode } from "react";
import { cn } from "./cn";

export interface EmptyStateProps {
  /** An icon, usually from lucide-react at size 24. */
  icon?: ReactNode;
  title: string;
  body?: string;
  /** A Button or link. */
  action?: ReactNode;
  /** Less vertical padding, for use inside a card. */
  compact?: boolean;
  className?: string;
}

export function EmptyState({ icon, title, body, action, compact = false, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "px-4 py-8" : "px-6 py-16", className)}>
      {icon ? (
        <div className="mb-5 flex size-14 items-center justify-center rounded-full border border-line bg-surface text-ink-2">
          {icon}
        </div>
      ) : null}
      <h3 className="t-h2">{title}</h3>
      {body ? <p className="t-sub mt-2 max-w-[280px]">{body}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
