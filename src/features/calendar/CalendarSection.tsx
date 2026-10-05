"use client";

import { useEffect, useState } from "react";
import { CalendarCheck2, CalendarOff, RefreshCw } from "lucide-react";
import { Button, Card, Select, useToast } from "@/components/ui";
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

  if (loading) return <Card className="h-[120px]" aria-busy="true" />;

  if (!status) {
    return (
      <Card>
        <Head on={false} label="Not connected" />
        <p className="t-sub mt-3">Could not check the calendar connection. The schedule works without it.</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => void calendar.refresh()}>
          Try again
        </Button>
      </Card>
    );
  }

  if (!status.configured) {
    return (
      <Card>
        <Head on={false} label="Not connected" />
        <p className="t-sub mt-3">
          Class times come in from Google Calendar and your blocks go out to a calendar named Lock In. To turn it on, set these on the
          server and restart:
        </p>
        <ul className="mt-3 flex flex-col gap-1.5">
          {status.missing.map((name) => (
            <li key={name} className="rounded-[10px] bg-surface-2 px-3 py-2 font-mono text-[13px] text-ink">
              {name}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] text-ink-3">
          Add this redirect URI to the Google OAuth client, or set GOOGLE_REDIRECT_URI to your own:
        </p>
        <p className="mt-1.5 rounded-[10px] bg-surface-2 px-3 py-2 font-mono text-[12px] break-all text-ink-2">{status.redirectUri}</p>
        <p className="mt-3 text-[13px] text-ink-3">Everything else on this screen works without it.</p>
      </Card>
    );
  }

  if (!connected) {
    return (
      <Card>
        <Head on={false} label="Not connected" />
        <p className="t-sub mt-3">
          Connect once and class times come in as fixed blocks. Your blocks go out to a calendar named Lock In, and a move on either side
          shows up on the other.
        </p>
        {/* An API route that answers with a redirect to Google, so a plain link. */}
        <a
          href="/api/calendar/start"
          className="pressable mt-4 flex h-12 w-full items-center justify-center rounded-[14px] bg-ink px-5 text-[16px] font-semibold tracking-[-0.01em] text-bg select-none"
        >
          Connect Google Calendar
        </a>
        <p className="mt-3 text-[13px] text-ink-3">
          {status.storage === "cookie"
            ? "Data is on this device, so the Google sign in is kept here too, in an encrypted cookie the page cannot read. Connect once on each device. With Supabase on, it is stored in the database instead."
            : "The Google sign in is stored in the database, on the server only."}
        </p>
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

  return (
    <Card>
      <Head on label="Connected" />
      <div className="mt-4">
        <Select
          label="Class times come from"
          value={status.calendarId ?? NONE}
          options={options}
          disabled={busy || syncing}
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
      {status.calendarId && status.importWritable === false ? (
        <p className="mt-2 text-[13px] text-ink-3">This calendar is read only. Its events can be seen here but not moved from here.</p>
      ) : null}
      <p className="mt-3 text-[13px] text-ink-3">
        Blocks for the next {EXPORT_DAYS} days, and any day you have edited, go out to the Lock In calendar.
      </p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="tnum text-[15px] font-medium text-ink">{syncing ? "Syncing" : when(status.lastSyncAt, today)}</p>
          <p className={error ? "mt-0.5 truncate text-[13px] text-danger" : "mt-0.5 truncate text-[13px] text-ink-3"}>
            {error ?? (last && !last.skipped ? summary(last.stats.pulled, last.stats.pushed, last.stats.removed) : "Syncs when you open this screen and after each change")}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={syncing}
          icon={<RefreshCw size={16} aria-hidden />}
          onClick={() => {
            void calendar.sync().then((out) => {
              if (out?.ok) toast(out.skipped ? "The challenge is over, nothing to sync" : summary(out.stats.pulled, out.stats.pushed, out.stats.removed), { kind: "done" });
              else if (out) toast("Some changes did not go through. They will be tried again.", { kind: "error" });
            });
          }}
        >
          Sync now
        </Button>
      </div>

      <div className="mt-3 border-t border-line pt-1">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-4"
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
      </div>
    </Card>
  );
}

function Head({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-surface-2 text-ink-2">
          {on ? <CalendarCheck2 size={20} aria-hidden /> : <CalendarOff size={20} aria-hidden />}
        </span>
        <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">Google Calendar</p>
      </div>
      <span
        className={
          on
            ? "shrink-0 rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent"
            : "shrink-0 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[12px] font-semibold text-ink-2"
        }
      >
        {label}
      </span>
    </div>
  );
}
