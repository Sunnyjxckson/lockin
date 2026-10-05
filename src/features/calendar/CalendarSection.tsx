"use client";

import { useEffect, useState } from "react";
import { CalendarCheck2, CalendarOff, RefreshCw } from "lucide-react";
import { Button, Card, IconButton, Select, cn, useToast } from "@/components/ui";
import { nyParts } from "@/lib/logic/dates";
import { formatDateShort, formatTime } from "@/lib/logic/dates";
import { chooseCalendar, EXPORT_DAYS, fetchCalendars, type CalendarChoice, type CalendarSync } from "./client";

const NONE = "__none__";

function when(at: string | null | undefined, today: string): string {
  if (!at) return "Not synced yet";
  const p = nyParts(at);
  return p.date === today ? `Synced ${formatTime(p.time)}` : `Synced ${formatDateShort(p.date)}, ${formatTime(p.time)}`;
}

function summary(pulled: number, pushed: number, removed: number): string {
  const parts: string[] = [];
  if (pulled > 0) parts.push(`${pulled} in`);
  if (pushed > 0) parts.push(`${pushed} out`);
  if (removed > 0) parts.push(`${removed} removed`);
  return parts.length > 0 ? parts.join(", ") : "Already in step";
}

/** Google Calendar on the Schedule screen: what to set, connect, pick a calendar, sync. */
export function CalendarSection({ calendar }: { calendar: CalendarSync }) {
  const toast = useToast();
  const { status, loading, syncing, error, last } = calendar;
  const [loaded, setLoaded] = useState<CalendarChoice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const connected = !!status?.connected;
  const choices = connected ? loaded : null;

  useEffect(() => {
    if (!connected) return;
    let live = true;
    fetchCalendars().then(
      (r) => live && setLoaded(r.calendars),
      () => live && setLoaded([]),
    );
    return () => {
      live = false;
    };
  }, [connected]);

  if (loading) return <Card className="h-[76px]" aria-busy="true" />;

  if (!status) {
    return (
      <Card>
        <Head on={false} label="Could not check" />
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => void calendar.refresh()}>
          Try again
        </Button>
      </Card>
    );
  }

  if (!status.configured) {
    return (
      <Card padded={false} className="overflow-hidden">
        <div className="p-4">
          <Head on={false} label="Needs server keys" />
        </div>
        <div className="divide-y divide-hair border-t border-hair">
          {status.missing.map((name) => (
            <p key={name} className="flex min-h-11 items-center px-4 font-mono text-[12px] break-all text-ink">
              {name}
            </p>
          ))}
          <div className="px-4 py-3">
            <p className="t-label">Redirect URI</p>
            <p className="mt-1.5 font-mono text-[12px] break-all text-ink-2">{status.redirectUri}</p>
          </div>
        </div>
      </Card>
    );
  }

  if (!connected) {
    return (
      <Card>
        <Head on={false} label="Class times in, your blocks out" />
        {/* An API route that answers with a redirect to Google, so a plain link. */}
        <a href="/api/calendar/start" className="pressable mt-4 flex h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-[15px] font-medium tracking-[-0.01em] text-bg select-none">
          Connect Google Calendar
        </a>
        <p className="t-caption mt-3 text-ink-2">{status.storage === "cookie" ? "The sign in stays on this device. Connect once on each one." : "The sign in is stored on the server."}</p>
      </Card>
    );
  }

  const today = nyParts().date;
  const options = [
    { value: NONE, label: "None, only send blocks out" },
    ...(choices ?? []).map((c) => ({ value: c.id, label: c.primary ? `${c.name} (main)` : c.name })),
  ];
  // Until the list arrives, show the saved choice so the control is never empty.
  if (status.calendarId && !options.some((o) => o.value === status.calendarId)) {
    options.push({ value: status.calendarId, label: status.calendarName ?? "Chosen calendar" });
  }
  const line = error ?? (last && !last.skipped ? summary(last.stats.pulled, last.stats.pushed, last.stats.removed) : `Next ${EXPORT_DAYS} days go out to the Lock In calendar`);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <Head on label={syncing ? "Syncing" : when(status.lastSyncAt, today)} />
        <IconButton
          label="Sync now"
          filled
          disabled={syncing}
          onClick={() => {
            void calendar.sync().then((out) => {
              if (out?.ok) toast(out.skipped ? "Nothing to sync" : summary(out.stats.pulled, out.stats.pushed, out.stats.removed), { kind: "done" });
              else if (out) toast("Some changes did not go through. They will be tried again.", { kind: "error" });
            });
          }}
        >
          <RefreshCw size={18} strokeWidth={1.75} className={syncing ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden />
        </IconButton>
      </div>
      <p className={cn("t-caption mt-3 truncate", error ? "text-danger" : "text-ink-2")}>{line}</p>
      <div className="mt-4">
        <Select
          label="Class times come from"
          value={status.calendarId ?? NONE}
          options={options}
          disabled={busy || syncing}
          hint={status.calendarId && status.importWritable === false ? "Read only. Its events cannot be moved from here." : undefined}
          onChange={(value) => {
            const id = value === NONE ? null : value;
            setBusy(true);
            chooseCalendar(id)
              .then((r) => {
                calendar.setStatus({ calendarId: id, calendarName: r.calendarName, importWritable: r.importWritable });
                return calendar.sync();
              })
              .catch((e: unknown) => toast(e instanceof Error ? e.message : "Could not change the calendar", { kind: "error" }))
              .finally(() => setBusy(false));
          }}
        />
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 -mb-2 -ml-4"
        disabled={busy || syncing}
        onClick={() => {
          setBusy(true);
          calendar
            .disconnect()
            .then(() => toast("Google Calendar disconnected"))
            .catch(() => toast("Could not disconnect", { kind: "error" }))
            .finally(() => setBusy(false));
        }}
      >
        Disconnect
      </Button>
    </Card>
  );
}

function Head({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full", on ? "grad shadow-glow" : "tile text-ink-2")}>
        {on ? <CalendarCheck2 size={20} strokeWidth={1.75} aria-hidden /> : <CalendarOff size={20} strokeWidth={1.75} aria-hidden />}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[15px] text-ink">Google Calendar</p>
        <p className="t-caption mt-0.5 truncate text-ink-2">{label}</p>
      </div>
    </div>
  );
}
