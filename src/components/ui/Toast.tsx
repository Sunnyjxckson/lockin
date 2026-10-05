"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, CircleAlert } from "lucide-react";

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
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+var(--safe-b)+12px)] z-[60] flex justify-center px-5"
      >
        {item ? (
          // Solid, not see-through: a toast lands over anything, and its text has to read on all of it.
          <div
            key={item.id}
            role="status"
            className="animate-toast-in pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border border-glass-line bg-surface-2 py-3 pr-5 pl-4 text-[14px] text-ink shadow-float"
          >
            {item.kind === "done" ? (
              <span className="grad flex size-5 shrink-0 items-center justify-center rounded-full">
                <Check size={13} strokeWidth={3} aria-hidden />
              </span>
            ) : item.kind === "error" ? (
              <CircleAlert size={18} className="shrink-0 text-danger" aria-hidden />
            ) : null}
            <span className="truncate">{item.message}</span>
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
