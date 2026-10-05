"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS } from "@/lib/nav";
import { cn } from "./cn";

export { TABS };

/** Bottom tab bar. Rendered once by the app layout. */
export function TabBar() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Main"
      // Solid, not see-through: with 15% of the page showing, a dark button or an accent fill scrolling
      // under the bar pulled the small inactive labels below the contrast floor under light palettes.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg pb-[var(--safe-b)]"
    >
      <ul className="mx-auto flex h-[var(--tabbar-h)] max-w-[480px] items-stretch px-2">
        {TABS.map((tab) => {
          const under = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
          const on = under(tab.href) || (tab.also ?? []).some(under);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "pressable flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium tracking-[0.01em]",
                  on ? "text-ink" : "text-ink-3",
                )}
              >
                <Icon size={22} strokeWidth={on ? 2.3 : 1.9} aria-hidden />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
