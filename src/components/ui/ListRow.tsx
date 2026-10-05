import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "./cn";

export interface ListRowProps {
  title: ReactNode;
  /** Secondary line under the title. */
  sub?: ReactNode;
  /** Before the title: an icon or a Checkbox. */
  left?: ReactNode;
  /** After the title: a value, a Toggle, a NumberField. */
  right?: ReactNode;
  /** Makes the row a link and adds a chevron. */
  href?: string;
  /** Makes the row a button and adds a chevron. */
  onClick?: () => void;
  /** Hide the chevron on a tappable row. */
  plain?: boolean;
  className?: string;
}

/**
 * One row in a list card. Stack rows inside <Card padded={false}> wrapped in
 * a <div className="divide-y divide-line">.
 */
export function ListRow({ title, sub, left, right, href, onClick, plain = false, className }: ListRowProps) {
  const tappable = !!href || !!onClick;
  const body = (
    <>
      {left ? <span className="flex shrink-0 items-center text-ink-2">{left}</span> : null}
      <span className="min-w-0 flex-1 py-3 text-left">
        <span className="block truncate text-[16px] font-medium text-ink">{title}</span>
        {sub ? <span className="mt-0.5 block truncate text-[13px] text-ink-3">{sub}</span> : null}
      </span>
      {right ? <span className="flex shrink-0 items-center text-[15px] text-ink-2">{right}</span> : null}
      {tappable && !plain ? <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden /> : null}
    </>
  );
  const cls = cn("flex min-h-[60px] w-full items-center gap-3 px-4", tappable && "pressable active:bg-surface-2", className);
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}
