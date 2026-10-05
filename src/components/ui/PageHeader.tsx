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

/** The top of a screen: optional back arrow, big title, actions on the right. */
export function PageHeader({ title, eyebrow, subtitle, back, right, className }: PageHeaderProps) {
  return (
    <header className={cn("pt-3 pb-2", className)}>
      {back || right ? (
        <div className="-mx-2.5 mb-1 flex h-11 items-center justify-between">
          {back ? (
            <Link
              href={back}
              aria-label="Back"
              className="pressable inline-flex size-11 items-center justify-center rounded-full text-ink-2"
            >
              <ChevronLeft size={26} aria-hidden />
            </Link>
          ) : (
            <span />
          )}
          <div className="flex items-center">{right}</div>
        </div>
      ) : null}
      {eyebrow ? <p className="t-label mb-1.5">{eyebrow}</p> : null}
      <h1 className="t-title">{title}</h1>
      {subtitle ? <p className="t-sub mt-1.5">{subtitle}</p> : null}
    </header>
  );
}

export interface ScreenProps {
  children: ReactNode;
  className?: string;
}

/** Page container: centered column, side padding, room for the tab bar. */
export function Screen({ children, className }: ScreenProps) {
  return (
    <main
      className={cn(
        "mx-auto w-full max-w-[480px] px-5 pt-[var(--safe-t)] pb-[calc(var(--tabbar-h)+var(--safe-b)+32px)]",
        className,
      )}
    >
      {children}
    </main>
  );
}
