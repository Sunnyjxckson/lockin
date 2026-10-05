"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { TabBar } from "@/components/ui";
import { checkLocalPasscode, createLocalPasscode, hasLocalPasscode, isLocallyUnlocked } from "@/lib/auth/local";
import { subscribe } from "@/lib/db";
import { getSettings } from "@/lib/db/helpers";
import { setHapticsEnabled } from "@/lib/haptics";
import { upgradeLocalData } from "@/lib/db/upgrade";
import { ensureSeeded } from "@/lib/seed";
import { LockScreen } from "./LockScreen";

type Gate =
  | { state: "checking" }
  | { state: "locked"; mode: "create" | "device" | "server" }
  | { state: "open" }
  | { state: "problem"; message: string };

interface Status {
  mode: "server" | "local";
  authed: boolean;
  /** Set when Supabase is on but the server is missing something. */
  problem: string | null;
}

/** Fired by Settings to lock the app right away. */
export const LOCK_EVENT = "lockin:lock";

/**
 * Wraps every screen in the app group. Holds the passcode gate, writes seed
 * data on first run, and draws the tab bar. Nothing inside renders until the
 * app is unlocked and seeded, so screens can assume data exists.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<Gate>({ state: "checking" });
  const [ready, setReady] = useState(false);

  const check = useCallback(async () => {
    let status: Status = { mode: "local", authed: false, problem: null };
    try {
      const res = await fetch("/api/auth/status", { cache: "no-store" });
      if (res.ok) status = (await res.json()) as Status;
    } catch {
      // Offline. A device passcode still works, and so does local data.
    }
    if (status.problem) return setGate({ state: "problem", message: status.problem });
    if (status.mode === "server") return setGate(status.authed ? { state: "open" } : { state: "locked", mode: "server" });
    if (!hasLocalPasscode()) return setGate({ state: "locked", mode: "create" });
    setGate(isLocallyUnlocked() ? { state: "open" } : { state: "locked", mode: "device" });
  }, []);

  useEffect(() => {
    // Reads the lock state from the server and the device, then stores it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void check();
    const relock = () => void check();
    window.addEventListener(LOCK_EVENT, relock);
    return () => window.removeEventListener(LOCK_EVENT, relock);
  }, [check]);

  // Once open: seed on first run, then let the screens render.
  useEffect(() => {
    if (gate.state !== "open") return;
    let live = true;
    const applySettings = () =>
      getSettings().then((s) => {
        if (s) setHapticsEnabled(s.haptics);
      });
    ensureSeeded()
      .then(upgradeLocalData)
      .then(applySettings)
      .then(
        () => live && setReady(true),
        (e: unknown) => live && setGate({ state: "problem", message: e instanceof Error ? e.message : "Could not load your data." }),
      );
    const off = subscribe("app_settings", () => void applySettings());
    return () => {
      live = false;
      off();
    };
  }, [gate.state]);

  const onSubmit = useCallback(
    async (passcode: string): Promise<true | string> => {
      if (gate.state !== "locked") return true;
      if (gate.mode === "create") {
        await createLocalPasscode(passcode);
        setGate({ state: "open" });
        return true;
      }
      if (gate.mode === "device") {
        if (!(await checkLocalPasscode(passcode))) return "Wrong passcode.";
        setGate({ state: "open" });
        return true;
      }
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        return json?.error ?? "Wrong passcode.";
      }
      setGate({ state: "open" });
      return true;
    },
    [gate],
  );

  if (gate.state === "checking") return <Splash />;
  if (gate.state === "problem") return <Problem message={gate.message} onRetry={() => void check()} />;
  if (gate.state === "locked") return <LockScreen key={gate.mode} mode={gate.mode} onSubmit={onSubmit} />;
  if (!ready) return <Splash />;

  return (
    <>
      {children}
      <TabBar />
    </>
  );
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true" aria-label="Loading">
      <span className="size-6 animate-spin rounded-full border-2 border-line-strong border-t-ink" />
    </div>
  );
}

function Problem({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-start justify-center px-6">
      <p className="t-label">Setup needed</p>
      <h1 className="t-title mt-2">The app cannot reach its data.</h1>
      <p className="t-sub mt-3">{message}</p>
      <button type="button" onClick={onRetry} className="pressable mt-7 h-12 rounded-[14px] bg-ink px-5 font-semibold text-bg">
        Try again
      </button>
    </main>
  );
}
