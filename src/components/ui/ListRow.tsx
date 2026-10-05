import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "./cn";

export interface ListProps {
  children: ReactNode;
  /** Read by screen readers when the group needs a name. */
  label?: string;
  className?: string;
}

/**
 * Rows separated by hairlines, straight on the page with no card around them
 * (the earnings list on Money). For rows inside a card, use
 * <Card padded={false}> around <div className="divide-y divide-hair">.
 */
export function List({ children, label, className }: ListProps) {
  return (
    <div aria-label={label} className={cn("divide-y divide-hair border-b border-hair [&>*]:px-1", className)}>
      {children}
    </div>
  );
}

export interface ListRowProps {
  title: ReactNode;
  /** Secondary line under the title. */
  sub?: ReactNode;
  /** Before the title: an icon or a Checkbox. */
  left?: ReactNode;
  /** After the title: a Toggle, a NumberField, a small note. */
  right?: ReactNode;
  /** A number at the right end, drawn large: "$40", "182.4". */
  value?: ReactNode;
  /** Makes the row a link and adds a chevron. */
  href?: string;
  /** Makes the row a button and adds a chevron. */
  onClick?: () => void;
  /** Hide the chevron on a tappable row. A row with a `value` has none. */
  plain?: boolean;
  className?: string;
}

/** One row of a list: title, a quiet second line, and a value or control at the right. */
export function ListRow({ title, sub, left, right, value, href, onClick, plain = false, className }: ListRowProps) {
  const tappable = !!href || !!onClick;
  const body = (
    <>
      {left ? <span className="flex shrink-0 items-center text-ink-2">{left}</span> : null}
      <span className="min-w-0 flex-1 py-3 text-left">
        <span className="block truncate text-[15px] text-ink">{title}</span>
        {sub ? <span className="t-caption mt-0.5 block truncate text-ink-2">{sub}</span> : null}
      </span>
      {right ? <span className="flex shrink-0 items-center text-[14px] text-ink-2">{right}</span> : null}
      {value !== undefined && value !== null ? <span className="t-value shrink-0 text-ink">{value}</span> : null}
      {tappable && !plain && value === undefined ? <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden /> : null}
    </>
  );
  const cls = cn("flex min-h-[60px] w-full items-center gap-3 px-4", tappable && "pressable", className);
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
  return (
    <div className={cls}>{body}</div>
  );
}
