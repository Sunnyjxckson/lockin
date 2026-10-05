"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, CircleAlert } from "lucide-react";
import { cn } from "./cn";

export type ToastKind = "info" | "done" | "error";

export interface ToastOptions {
  kind?: ToastKind;
  /** Milliseconds on screen. Default 2600. */
  duration?: number;
}

type Show = (message: string, options?: ToastOptions) => void;

const ToastContext = createContext<Show | null>(null);

/** `const toast = useToast(); toast("Saved", { kind: "done" });` */
export function useToast(): Show {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast needs a ToastProvider above it");
  return show;
}

interface Item {
  id: number;
  message: string;
  kind: ToastKind;
}

/** Mounted once in the root layout. One toast at a time, above the tab bar. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<Item | null>(null);
  const timer = useRef<number | null>(null);
  const seq = useRef(0);

  const show = useCallback<Show>((message, options) => {
    if (timer.current) window.clearTimeout(timer.current);
    seq.current += 1;
    setItem({ id: seq.current, message, kind: options?.kind ?? "info" });
    timer.current = window.setTimeout(() => setItem(null), options?.duration ?? 2600);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+var(--safe-b)+16px)] z-[60] flex justify-center px-5"
      >
        {item ? (
          <div
            key={item.id}
            role="status"
            className={cn(
              "animate-toast-in pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border px-4 py-3 text-[15px] font-medium shadow-[0_8px_30px_rgba(0,0,0,0.6)]",
              item.kind === "error" ? "border-danger/40 bg-surface-2 text-ink" : "border-line-strong bg-surface-2 text-ink",
            )}
          >
            {item.kind === "done" ? (
              <span className="flex size-5 items-center justify-center rounded-full bg-accent text-accent-ink">
                <Check size={13} strokeWidth={3.5} aria-hidden />
              </span>
            ) : item.kind === "error" ? (
              <CircleAlert size={18} className="text-danger" aria-hidden />
            ) : null}
            <span className="truncate">{item.message}</span>
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
