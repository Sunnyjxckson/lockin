import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** One quote in a list (Saved, Search): the words, who and where, and your note if there is one. */
export function QuoteRow({ href, text, by, note, meta }: { href: string; text: string; by: string; note?: string | null; meta?: string }) {
  return (
    <Link href={href} className="pressable flex min-h-[72px] items-start gap-3 px-1 py-4">
      <span className="min-w-0 flex-1">
        <span className="line-clamp-3 block text-[16px] leading-snug whitespace-pre-line text-ink">{text}</span>
        <span className="t-caption mt-2 block truncate text-ink-2">
          {by}
          {meta ? <span className="tnum"> &middot; {meta}</span> : null}
        </span>
        {note ? <span className="tile mt-3 line-clamp-3 block rounded-[16px] px-3.5 py-2.5 text-[14px] leading-snug text-ink-2">{note}</span> : null}
      </span>
      <ChevronRight size={18} className="mt-1 shrink-0 text-ink-3" aria-hidden />
    </Link>
  );
}
