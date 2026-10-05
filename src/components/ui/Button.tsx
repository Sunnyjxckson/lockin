"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary is near white on black. The accent is kept for done states. */
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
  primary: "bg-ink text-bg disabled:bg-surface-3 disabled:text-ink-3",
  secondary: "bg-surface-2 text-ink border border-line disabled:text-ink-3",
  ghost: "bg-transparent text-ink-2 disabled:text-ink-3",
  danger: "bg-danger-soft text-danger disabled:opacity-50",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-11 px-4 text-[14px] rounded-[12px] gap-1.5",
  md: "h-12 px-5 text-[16px] rounded-[14px] gap-2",
  lg: "h-14 px-6 text-[17px] rounded-[16px] gap-2",
};

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
      className={cn(
        "pressable inline-flex items-center justify-center font-semibold tracking-[-0.01em] whitespace-nowrap select-none",
        VARIANT[variant],
        SIZE[size],
        full ? "w-full min-w-0 shrink" : "shrink-0",
        className,
      )}
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

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: what the button does, for screen readers. */
  label: string;
  /** Draw a filled circle behind the icon. */
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
        filled && "border border-line bg-surface text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
