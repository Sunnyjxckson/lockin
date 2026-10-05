"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS } from "@/lib/nav";
import { cn } from "./cn";

export { TABS };

/**
 * The floating tab bar: a frosted glass pill with the five screens as words.
 * The screen you are on is a cream pill inside it. Rendered once by the app
 * layout. Screen leaves room for it, so content never ends up behind it.
 *
 * It is the one surface that really blurs what is behind it, and it is only
 * a little see-through (the theme sets how much, and raises it when a palette
 * would let a button under the bar wash the labels out). Its labels are ink-2
 * at full strength. Do not fade them.
 */
export function TabBar() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(var(--safe-b)+var(--tabbar-gap))]">
      <ul className="frost pointer-events-auto mx-auto flex h-[var(--tabbar-pill)] max-w-[448px] items-center gap-0.5 rounded-full px-1.5 shadow-float">
        {TABS.map((tab) => {
          const under = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
          const on = under(tab.href) || (tab.also ?? []).some(under);
          return (
            <li key={tab.href} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "pressable flex h-12 items-center justify-center rounded-full text-[13px] tracking-[-0.005em]",
                  on ? "bg-ink font-medium text-bg" : "text-ink-2",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
