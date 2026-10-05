"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { haptics } from "@/lib/haptics";
import { cn } from "@/components/ui";
import { Keypad } from "./Keypad";

export const PASSCODE_LENGTH = 4;
const MAX_LENGTH = 8;

export interface LockScreenProps {
  /**
   * create: first run on this device, pick a passcode and confirm it.
   * device: enter the passcode kept on this device (fixed length, submits itself).
   * server: enter the passcode set on the server (any length, OK key).
   */
  mode: "create" | "device" | "server";
  /** Resolve true to unlock. Resolve a string to show it as the error. */
  onSubmit: (passcode: string) => Promise<true | string>;
}

function Mark() {
  return (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" aria-hidden>
      <circle cx="24" cy="24" r="19" stroke="var(--surface-3)" strokeWidth="5" />
      <path d="M24 5a19 19 0 1 1-16.45 9.5" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export function LockScreen({ mode, onSubmit }: LockScreenProps) {
  const [code, setCode] = useState("");
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const submitting = useRef(false);

  const fixed = mode !== "server";
  const slots = fixed ? PASSCODE_LENGTH : Math.max(PASSCODE_LENGTH, code.length);

  const fail = useCallback((message: string) => {
    haptics.error();
    setError(message);
    setShake((n) => n + 1);
    setCode("");
  }, []);

  const submit = useCallback(
    async (value: string) => {
      if (submitting.current) return;
      if (mode === "create" && first === null) {
        setFirst(value);
        setCode("");
        setError(null);
        return;
      }
      if (mode === "create" && first !== value) {
        setFirst(null);
        fail("Those did not match. Start again.");
        return;
      }
      submitting.current = true;
      setBusy(true);
      const result = await onSubmit(value).catch(() => "Something went wrong. Try again.");
      submitting.current = false;
      setBusy(false);
      if (result !== true) fail(result);
    },
    [mode, first, onSubmit, fail],
  );

  // Fixed length codes submit themselves on the last digit.
  useEffect(() => {
    if (!fixed || code.length !== PASSCODE_LENGTH) return;
    const id = window.setTimeout(() => void submit(code), 140);
    return () => window.clearTimeout(id);
  }, [code, fixed, submit]);

  const onDigit = useCallback(
    (d: string) => {
      setError(null);
      setCode((c) => (c.length >= (fixed ? PASSCODE_LENGTH : MAX_LENGTH) ? c : c + d));
    },
    [fixed],
  );
  const onDelete = useCallback(() => setCode((c) => c.slice(0, -1)), []);
  const onOk = useCallback(() => {
    if (code.length >= PASSCODE_LENGTH) void submit(code);
  }, [code, submit]);

  const title =
    mode === "create" ? (first === null ? "Create a passcode" : "Enter it again") : "Enter passcode";
  const sub =
    mode === "create"
      ? first === null
        ? "Four digits. It keeps this app closed on this device."
        : "Confirm your passcode."
      : "Lock In";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-between px-6 pt-[calc(var(--safe-t)+56px)] pb-[calc(var(--safe-b)+40px)]">
      <div className="flex flex-col items-center text-center">
        <Mark />
        <h1 className="t-title mt-7">{title}</h1>
        <p className={cn("mt-2 min-h-5 text-[15px]", error ? "text-danger" : "text-ink-2")} role={error ? "alert" : undefined}>
          {error ?? sub}
        </p>
        <div key={shake} className={cn("mt-9 flex h-4 items-center gap-4", shake > 0 && "animate-shake")} aria-label={`${code.length} digits entered`}>
          {Array.from({ length: slots }, (_, i) => (
            <span
              key={i}
              className={cn(
                "size-3.5 rounded-full border-2 transition-all duration-150",
                i < code.length ? "scale-110 border-ink bg-ink" : "border-line-strong",
              )}
            />
          ))}
        </div>
      </div>
      <div className="mt-10">
        <Keypad onDigit={onDigit} onDelete={onDelete} onSubmit={fixed ? undefined : onOk} disabled={busy} />
      </div>
    </main>
  );
}
