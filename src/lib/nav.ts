// Where everything lives. One list, read by the tab bar, the More sheet on
// Today and Settings, so a new screen is added in one place.
//
// The bottom bar holds the five screens used every day. Everything else is
// one tap from Today's header: Coach and Vices have their own icons, and the
// More button opens the rest. Meals and Focus also have a way in from the
// screens they belong to (Body and Schedule).

import { CalendarClock, CircleCheck, DollarSign, Activity, Images, LayoutGrid, Settings, Timer, UtensilsCrossed, type LucideIcon } from "lucide-react";

export interface Tab {
  href: string;
  /** Other routes that light this tab: screens reached from it that are not under its path. */
  also?: readonly string[];
  label: string;
  icon: LucideIcon;
}

export const TABS: readonly Tab[] = [
  { href: "/today", label: "Today", icon: CircleCheck, also: ["/coach", "/vices", "/reminders", "/settings", "/boards"] },
  { href: "/schedule", label: "Schedule", icon: CalendarClock, also: ["/focus"] },
  { href: "/money", label: "Money", icon: DollarSign },
  { href: "/body", label: "Body", icon: Activity, also: ["/meals"] },
  { href: "/progress", label: "Progress", icon: LayoutGrid },
];

export interface MoreLink {
  href: string;
  label: string;
  sub: string;
  icon: LucideIcon;
}

/** The rows of the More sheet, top to bottom. */
export const MORE_LINKS: readonly MoreLink[] = [
  { href: "/focus", label: "Focus", sub: "Study timer and hours", icon: Timer },
  { href: "/meals", label: "Meals", sub: "Week plan, recipes and the grocery list", icon: UtensilsCrossed },
  { href: "/boards", label: "Boards", sub: "Mood boards and the look of the app", icon: Images },
  { href: "/settings", label: "Settings", sub: "Checklist, schedule, challenge, theme", icon: Settings },
];
