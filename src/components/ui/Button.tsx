"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "solid" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * primary is the champagne to rose gradient: the one main action on a screen or sheet.
   * solid is cream (ink) for a strong action that is not the main one.
   * secondary is glass. ghost is text only. danger is for destructive actions.
   */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the full width of the parent. */
  full?: boolean;
  /** Shows a spinner and blocks taps. */
  loading?: boolean;
  /** Icon before the label. */
  icon?: ReactNode;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: "grad shadow-glow disabled:bg-none disabled:bg-tile disabled:text-ink-3 disabled:shadow-none",
  solid: "bg-ink text-bg disabled:bg-tile disabled:text-ink-3",
  secondary: "glass text-ink disabled:text-ink-3",
  ghost: "bg-transparent text-ink-2 disabled:text-ink-3",
  danger: "bg-danger-soft text-danger disabled:opacity-50",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-11 px-4 text-[14px] gap-1.5",
  md: "h-12 px-5 text-[15px] gap-2",
  lg: "h-14 px-6 text-[16px] gap-2",
};

function buttonClass(variant: ButtonVariant, size: ButtonSize, full: boolean, className?: string): string {
  return cn(
    "pressable inline-flex items-center justify-center rounded-full font-medium tracking-[-0.01em] whitespace-nowrap select-none",
    VARIANT[variant],
    SIZE[size],
    full ? "w-full min-w-0 shrink" : "shrink-0",
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  full = false,
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={buttonClass(variant, size, full, className)}
      {...rest}
    >
      {loading ? (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}

export interface ButtonLinkProps {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  /** Icon before the label. */
  icon?: ReactNode;
  /** Icon after the label, for an arrow. */
  iconAfter?: ReactNode;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}

/**
 * A Button that is a link: the same variants and sizes, for a main action
 * that goes to another screen ("Open Today", "Start a challenge"). The one
 * primary per view rule counts these too.
 */
export function ButtonLink({ href, variant = "primary", size = "md", full = false, icon, iconAfter, children, className, ...aria }: ButtonLinkProps) {
  return (
    <Link href={href} aria-label={aria["aria-label"]} className={buttonClass(variant, size, full, className)}>
      {icon}
      {children}
      {iconAfter}
    </Link>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: what the button does, for screen readers. */
  label: string;
  /** Draw a glass circle behind the icon. */
  filled?: boolean;
}

/** A 44px round button holding a single icon. */
export function IconButton({ label, filled = false, className, children, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "pressable inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 disabled:text-ink-3 disabled:opacity-40",
        filled && "glass text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: what the button does, for screen readers. */
  label: string;
  /** Diameter in px. Default 52. Never under 44. */
  size?: number;
}

/**
 * The round gradient button: the single main action of a card or a screen
 * (add an earning, log a meal). One per view. Holds one icon.
 */
export function ActionButton({ label, size = 52, className, children, style, type = "button", ...rest }: ActionButtonProps) {
  const d = Math.max(44, size);
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      style={{ width: d, height: d, ...style }}
      className={cn("pressable grad shadow-glow inline-flex shrink-0 items-center justify-center rounded-full disabled:opacity-50", className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface IconLinkProps {
  href: string;
  /** Read by screen readers and shown as the tooltip. */
  label: string;
  children: ReactNode;
  /** Draw a glass circle behind the icon. */
  filled?: boolean;
  className?: string;
}

/** A 44px round icon that is a link. The header twin of IconButton, for a page's `right` slot. */
export function IconLink({ href, label, children, filled = false, className }: IconLinkProps) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn("pressable inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2", filled && "glass text-ink", className)}
    >
      {children}
    </Link>
  );
}
