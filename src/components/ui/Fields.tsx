"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

// ---------- Field: label, control, hint ----------

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  /** Ties the label to a control. The built in fields set this themselves. */
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, htmlFor, className, children }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? <p className="text-[13px] text-danger">{error}</p> : hint ? <p className="text-[13px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

const CONTROL =
  "h-12 w-full rounded-[14px] border border-line bg-surface-2 px-3.5 text-[16px] text-ink placeholder:text-ink-3 outline-none transition-colors focus:border-ink-3 disabled:opacity-50";

// ---------- NumberField ----------

export interface NumberFieldProps {
  /** null means empty. */
  value: number | null;
  /**
   * Called when the user finishes: on blur or Enter. Empty gives null.
   * Pass `live` to also get every keystroke.
   */
  onChange: (value: number | null) => void;
  live?: boolean;
  label?: string;
  hint?: string;
  /** Shown after the number: "g", "kcal", "lb", "min". */
  unit?: string;
  /** Shown before the number: "$". */
  prefix?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  /** Allow decimals. Default true. */
  decimal?: boolean;
  disabled?: boolean;
  /**
   * field: a full width form control (default).
   * inline: compact, right aligned, for use inside a list row.
   * hero: very large centered numerals, for a quick add sheet.
   */
  variant?: "field" | "inline" | "hero";
  /** Paint the number in the accent. Use when the value meets its target. */
  done?: boolean;
  autoFocus?: boolean;
  className?: string;
  "aria-label"?: string;
  id?: string;
}

function toText(v: number | null): string {
  return v === null || Number.isNaN(v) ? "" : String(v);
}

function parse(text: string, decimal: boolean, min?: number, max?: number): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "." || cleaned === "-") return null;
  let n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (!decimal) n = Math.round(n);
  if (min !== undefined && n < min) n = min;
  if (max !== undefined && n > max) n = max;
  return n;
}

export function NumberField({
  value,
  onChange,
  live = false,
  label,
  hint,
  unit,
  prefix,
  placeholder = "0",
  min = 0,
  max,
  decimal = true,
  disabled,
  variant = "field",
  done = false,
  autoFocus,
  className,
  id,
  ...aria
}: NumberFieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const [text, setText] = useState(() => toText(value));
  const focused = useRef(false);
  const lastSent = useRef<number | null>(value);

  // Follow outside changes, but never fight the user mid edit.
  useEffect(() => {
    if (!focused.current) setText(toText(value));
    lastSent.current = value;
  }, [value]);

  const commit = () => {
    const n = parse(text, decimal, min, max);
    setText(toText(n));
    if (n !== lastSent.current) {
      lastSent.current = n;
      onChange(n);
    }
  };

  const input = (
    <input
      id={inputId}
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      enterKeyHint="done"
      autoComplete="off"
      autoFocus={autoFocus}
      disabled={disabled}
      placeholder={placeholder}
      value={text}
      aria-label={aria["aria-label"] ?? label}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      onChange={(e) => {
        const next = e.target.value.replace(decimal ? /[^0-9.,]/g : /[^0-9,]/g, "");
        setText(next);
        if (live) {
          const n = parse(next, decimal, undefined, max);
          lastSent.current = n;
          onChange(n);
        }
      }}
      style={variant === "hero" ? { width: `${Math.max(1, (text || placeholder).length) * 0.68}em` } : undefined}
      className={cn(
        "tnum min-w-0 bg-transparent outline-none placeholder:text-ink-3 disabled:opacity-60",
        variant === "field" && "h-full flex-1 text-[17px] font-medium",
        variant === "inline" && "h-full w-full text-right text-[19px] font-semibold tracking-[-0.02em]",
        variant === "hero" && "max-w-full text-center text-[64px] leading-none font-bold tracking-[-0.045em]",
        done ? "text-accent" : "text-ink",
      )}
    />
  );

  if (variant === "inline") {
    return (
      <label
        htmlFor={inputId}
        className={cn(
          "flex h-11 w-[116px] shrink-0 items-center gap-1 rounded-[12px] border bg-surface-2 px-3 transition-colors focus-within:border-ink-3",
          done ? "border-accent-line" : "border-line",
          disabled && "opacity-70",
          className,
        )}
      >
        {prefix ? <span className={cn("text-[15px] font-medium", done ? "text-accent" : "text-ink-3")}>{prefix}</span> : null}
        {input}
        {unit ? <span className="shrink-0 text-[13px] font-medium text-ink-3">{unit}</span> : null}
      </label>
    );
  }

  if (variant === "hero") {
    return (
      <label htmlFor={inputId} className={cn("flex flex-col items-center gap-2 py-4", className)}>
        {label ? <span className="t-label">{label}</span> : null}
        <span className="flex w-full items-baseline justify-center gap-1.5">
          {prefix ? <span className="text-[32px] font-semibold text-ink-3">{prefix}</span> : null}
          {input}
          {unit ? <span className="text-[20px] font-medium text-ink-3">{unit}</span> : null}
        </span>
        {hint ? <span className="text-[13px] text-ink-3">{hint}</span> : null}
      </label>
    );
  }

  const control = (
    <div
      className={cn(
        "flex h-12 items-center gap-1.5 rounded-[14px] border border-line bg-surface-2 px-3.5 transition-colors focus-within:border-ink-3",
        disabled && "opacity-60",
        !label && className,
      )}
    >
      {prefix ? <span className="text-ink-3">{prefix}</span> : null}
      {input}
      {unit ? <span className="shrink-0 text-[14px] text-ink-3">{unit}</span> : null}
    </div>
  );
  if (!label) return control;
  return (
    <Field label={label} hint={hint} htmlFor={inputId} className={className}>
      {control}
    </Field>
  );
}

// ---------- TextField ----------

export interface TextFieldProps {
  value: string;
  /** Every keystroke. */
  onChange: (value: string) => void;
  /** When the user leaves the field or presses Enter (single line only). */
  onCommit?: (value: string) => void;
  label?: string;
  hint?: string;
  error?: string | null;
  placeholder?: string;
  /** Render a growing textarea with this many rows. */
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

export function TextField({
  value,
  onChange,
  onCommit,
  label,
  hint,
  error,
  placeholder,
  rows,
  maxLength,
  disabled,
  autoFocus,
  className,
  id,
  ...aria
}: TextFieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const shared = {
    id: inputId,
    value,
    placeholder,
    maxLength,
    disabled,
    autoFocus,
    "aria-label": aria["aria-label"] ?? label,
    onBlur: () => onCommit?.(value),
  };
  const control = rows ? (
    <textarea
      {...shared}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className={cn(CONTROL, "h-auto resize-none py-3 leading-snug", !label && className)}
    />
  ) : (
    <input
      {...shared}
      type="text"
      enterKeyHint="done"
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={cn(CONTROL, !label && className)}
    />
  );
  if (!label) return control;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId} className={className}>
      {control}
    </Field>
  );
}

// ---------- TimeField and DateField (native pickers) ----------

export interface TimeFieldProps {
  /** "HH:MM", 24 hour. */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

export function TimeField({ value, onChange, label, hint, disabled, className, id, ...aria }: TimeFieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const control = (
    <input
      id={inputId}
      type="time"
      value={value}
      disabled={disabled}
      aria-label={aria["aria-label"] ?? label}
      onChange={(e) => {
        if (e.target.value) onChange(e.target.value.slice(0, 5));
      }}
      className={cn(CONTROL, "tnum appearance-none", !label && className)}
    />
  );
  if (!label) return control;
  return (
    <Field label={label} hint={hint} htmlFor={inputId} className={className}>
      {control}
    </Field>
  );
}

export interface DateFieldProps {
  /** "YYYY-MM-DD". */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  hint?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function DateField({ value, onChange, label, hint, min, max, disabled, className, id }: DateFieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const control = (
    <input
      id={inputId}
      type="date"
      value={value}
      min={min}
      max={max}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => {
        if (e.target.value) onChange(e.target.value);
      }}
      className={cn(CONTROL, "tnum appearance-none", !label && className)}
    />
  );
  if (!label) return control;
  return (
    <Field label={label} hint={hint} htmlFor={inputId} className={className}>
      {control}
    </Field>
  );
}

// ---------- Select (native picker) ----------

export interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  label?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function Select<T extends string>({ value, onChange, options, label, hint, disabled, className, id }: SelectProps<T>) {
  const auto = useId();
  const inputId = id ?? auto;
  const control = (
    <select
      id={inputId}
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(CONTROL, "appearance-none", !label && className)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  if (!label) return control;
  return (
    <Field label={label} hint={hint} htmlFor={inputId} className={className}>
      {control}
    </Field>
  );
}
