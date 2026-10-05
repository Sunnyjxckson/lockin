"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, CircleCheck, DollarSign, Activity, LayoutGrid, type LucideIcon } from "lucide-react";
import { cn } from "./cn";

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const TABS: readonly Tab[] = [
  { href: "/today", label: "Today", icon: CircleCheck },
  { href: "/schedule", label: "Schedule", icon: CalendarClock },
  { href: "/money", label: "Money", icon: DollarSign },
  { href: "/body", label: "Body", icon: Activity },
  { href: "/progress", label: "Progress", icon: LayoutGrid },
];

/** Bottom tab bar. Rendered once by the app layout. */
export function TabBar() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/85 pb-[var(--safe-b)] backdrop-blur-xl"
    >
      <ul className="mx-auto flex h-[var(--tabbar-h)] max-w-[480px] items-stretch px-2">
        {TABS.map((tab) => {
          const on = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
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
