"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "./cn";

export interface PageHeaderProps {
  title: string;
  /** Small uppercase line above the title. */
  eyebrow?: string;
  /** Secondary line under the title. */
  subtitle?: string;
  /** Show a back arrow linking here, for example "/today". */
  back?: string;
  /** Buttons on the right, usually IconButtons. */
  right?: ReactNode;
  className?: string;
}

/**
 * The top of a screen that opens with its name. Sub-screens pass `back` and
 * get a back arrow row above the title, with any actions on that row. Tab
 * screens have no back arrow and their actions sit on the title line. A tab
 * screen that opens with a big number or a greeting uses TopBar instead.
 */
export function PageHeader({ title, eyebrow, subtitle, back, right, className }: PageHeaderProps) {
  return (
    <header className={cn("pt-3 pb-3", className)}>
      {back ? (
        <div className="-mx-2.5 mb-2 flex h-11 items-center justify-between">
          <Link href={back} aria-label="Back" className="pressable inline-flex size-11 items-center justify-center rounded-full text-ink-2">
            <ChevronLeft size={24} strokeWidth={1.75} aria-hidden />
          </Link>
          <div className="flex items-center">{right}</div>
        </div>
      ) : null}
      {eyebrow ? <p className="t-label mb-2">{eyebrow}</p> : null}
      {/* A tab screen has no back row, so its actions sit on the title line and every title starts at the same height. */}
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h1 className="t-title min-w-0">{title}</h1>
        {!back && right ? <div className="-mr-2.5 flex shrink-0 items-center">{right}</div> : null}
      </div>
      {subtitle ? <p className="t-sub mt-1.5">{subtitle}</p> : null}
    </header>
  );
}

export interface TopBarProps {
  /** The screen's name, drawn as a small uppercase label. It is the page's h1 unless `as` says otherwise. */
  title: string;
  /** At the right end: a short status ("6 days left") or icon buttons. */
  right?: ReactNode;
  /** "h1" (default) when the screen has no other heading. "p" when the hero under it is the h1 (Today's greeting). */
  as?: "h1" | "p";
  className?: string;
}

/**
 * The quiet top row of a tab screen that leads with a hero: the name small on
 * the left, a status or actions on the right, then the hero (a BigNumber, a
 * greeting) right under it.
 */
export function TopBar({ title, right, as: Tag = "h1", className }: TopBarProps) {
  return (
    <div className={cn("flex h-12 items-center justify-between gap-3 pt-1", className)}>
      <Tag className="t-label">{title}</Tag>
      {right ? <div className="t-label -mr-2.5 flex shrink-0 items-center gap-0.5 [&>span]:mr-2.5">{right}</div> : null}
    </div>
  );
}

export interface ScreenProps {
  children: ReactNode;
  className?: string;
  "aria-busy"?: boolean | "true" | "false";
}

/** Page container: centered column, side padding, safe area at the top, room for the floating tab bar at the bottom. */
export function Screen({ children, className, ...rest }: ScreenProps) {
  return (
    <main
      className={cn(
        "mx-auto w-full max-w-[480px] px-5 pt-[var(--safe-t)] pb-[calc(var(--tabbar-h)+var(--safe-b)+32px)]",
        className,
      )}
      {...rest}
    >
      {children}
    </main>
  );
}
