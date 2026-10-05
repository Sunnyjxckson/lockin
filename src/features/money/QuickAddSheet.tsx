"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, X } from "lucide-react";
import { Button, DateField, NumberField, SegmentedControl, Sheet, cn, useToast, Chip } from "@/components/ui";
import { useInstalledOn, useToday } from "@/lib/db/hooks";
import { haptics } from "@/lib/haptics";
import { formatDateShort, isDayLocked } from "@/lib/logic/dates";
import { APPS, formatMoney, normalizeApp, type DeliveryApp } from "@/lib/logic/money";
import { usePhoto } from "@/lib/storage/hooks";
import type { DateStr, Earning } from "@/lib/types";
import { addEarning, deleteEarning, readScreenshot, saveEarning, storeScreenshot } from "./actions";

const APP_OPTIONS = APPS.map((a) => ({ value: a, label: a }));
const HOUR_CHIPS = [1, 1.5, 2, 3, 4, 5];

type ReadState = "none" | "reading" | "ai" | "fallback";

export interface QuickAddProps {
  open: boolean;
  onClose: () => void;
  /** The app to preselect, usually the last one used. */
  defaultApp?: DeliveryApp;
  /** Edit this entry instead of adding one. */
  editing?: Earning | null;
  /** The day to add to. Defaults to today. */
  date?: DateStr;
  /** A screenshot picked before the sheet opened. It is read on open. */
  file?: File | null;
}

/** The quick add sheet. Mounted fresh each time it opens, so state never leaks between uses. */
export function QuickAddSheet(props: QuickAddProps) {
  if (!props.open) return null;
  return <Form key={props.editing?.id ?? "new"} {...props} />;
}

function Form({ onClose, defaultApp = "DoorDash", editing, date: firstDate, file: firstFile }: QuickAddProps) {
  const toast = useToast();
  const today = useToday();
  const installedOn = useInstalledOn();
  const [amount, setAmount] = useState<number | null>(editing?.amount ?? null);
  const [app, setApp] = useState<DeliveryApp>(normalizeApp(editing?.app) ?? defaultApp);
  const [hours, setHours] = useState<number | null>(editing?.hours ?? null);
  const [date, setDate] = useState<DateStr>(editing?.date ?? firstDate ?? today);
  const [showDate, setShowDate] = useState(!!editing || (!!firstDate && firstDate !== today));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [keptRef, setKeptRef] = useState<string | null>(editing?.screenshot_url ?? null);
  const [read, setRead] = useState<ReadState>("none");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const readId = useRef(0);
  const keptUrl = usePhoto(keptRef);

  const attach = (f: File) => {
    setFile(f);
    setKeptRef(null);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
    setRead("reading");
    const id = ++readId.current;
    void readScreenshot(f).then((r) => {
      if (id !== readId.current) return;
      if (r.source === "ai") {
        if (r.amount !== null) setAmount(r.amount);
        if (r.app) setApp(r.app);
        if (r.hours !== null) setHours(r.hours);
        setRead("ai");
        haptics.tap();
      } else {
        setRead("fallback");
      }
    });
  };

  // Read the screenshot that opened the sheet, once.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !firstFile) return;
    started.current = true;
    attach(firstFile);
  }, [firstFile]);

  const detach = () => {
    readId.current += 1;
    setFile(null);
    setKeptRef(null);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setRead("none");
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) attach(f);
  };

  const locked = isDayLocked(date, new Date(), installedOn);
  const wasLocked = editing ? isDayLocked(editing.date, new Date(), installedOn) : false;
  const future = date > today;
  const valid = amount !== null && amount > 0 && !locked && !wasLocked && !future;
  const thumb = preview ?? keptUrl;

  const save = async () => {
    if (!valid || amount === null) return;
    setSaving(true);
    try {
      let screenshot_url = keptRef;
      if (file) {
        // A photo that will not store should not block the money from being logged.
        screenshot_url = await storeScreenshot(file).catch(() => null);
        if (!screenshot_url) toast("Saved without the screenshot", { kind: "info" });
      }
      const input = { date, amount, app, hours: hours && hours > 0 ? hours : null, screenshot_url };
      if (editing) await saveEarning(editing, input);
      else await addEarning(input);
      haptics.done();
      toast(editing ? "Saved" : `${formatMoney(amount)} added`, { kind: "done" });
      onClose();
    } catch {
      haptics.error();
      toast("Could not save", { kind: "error" });
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await deleteEarning(editing);
      toast("Entry deleted", { kind: "info" });
      onClose();
    } catch {
      toast("Could not delete", { kind: "error" });
      setSaving(false);
    }
  };

  const note =
    read === "reading"
      ? "Reading the screenshot."
      : read === "ai"
        ? "Filled in from the screenshot. Check the numbers."
        : read === "fallback"
          ? "Auto-read is off. Enter the numbers yourself."
          : "Screenshot attached.";

  return (
    <Sheet
      open
      onClose={saving ? () => {} : onClose}
      title={editing ? "Edit entry" : "Add earnings"}
      footer={
        confirmDelete ? (
          <div className="flex gap-2">
            <Button variant="secondary" size="lg" full onClick={() => setConfirmDelete(false)} disabled={saving}>
              Keep
            </Button>
            <Button variant="danger" size="lg" full loading={saving} onClick={() => void remove()}>
              Delete entry
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            {editing && !wasLocked ? (
              <Button variant="danger" size="lg" onClick={() => setConfirmDelete(true)} disabled={saving}>
                Delete
              </Button>
            ) : null}
            <Button size="lg" full disabled={!valid || read === "reading"} loading={saving} onClick={() => void save()}>
              {editing ? "Save" : amount && amount > 0 ? `Add ${formatMoney(amount)}` : "Add"}
            </Button>
          </div>
        )
      }
    >
      <input ref={picker} type="file" accept="image/*" className="hidden" onChange={onPick} aria-hidden tabIndex={-1} />

      {thumb || read !== "none" ? (
        <div className="mb-1 flex items-center gap-3 rounded-[14px] border border-line bg-surface-2 p-2.5">
          <div className="size-14 shrink-0 overflow-hidden rounded-[10px] bg-surface-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {thumb ? <img src={thumb} alt="Earnings screenshot" className="size-full object-cover" /> : null}
          </div>
          <p className={cn("min-w-0 flex-1 text-[14px] leading-snug", read === "ai" ? "text-ink" : "text-ink-2")} role="status">
            {read === "reading" ? <span className="mr-2 inline-block size-3 animate-spin rounded-full border-2 border-ink-3 border-t-transparent align-[-1px]" aria-hidden /> : null}
            {note}
          </p>
          <button type="button" aria-label="Remove screenshot" onClick={detach} className="pressable flex size-11 shrink-0 items-center justify-center rounded-full text-ink-3">
            <X size={18} aria-hidden />
          </button>
        </div>
      ) : null}

      <NumberField
        variant="hero"
        prefix="$"
        aria-label="Amount"
        value={amount}
        onChange={setAmount}
        live
        max={99999}
        autoFocus={!editing && !firstFile}
      />

      <SegmentedControl label="App" options={APP_OPTIONS} value={app} onChange={setApp} />

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink-2">Hours worked</span>
          <span className="text-[13px] text-ink-3">{amount && hours && hours > 0 ? `${formatMoney(amount / hours)} an hour` : "Optional"}</span>
        </div>
        <div className="flex items-center gap-2">
          <NumberField value={hours} onChange={setHours} live unit="h" max={24} aria-label="Hours worked" className="w-[92px] shrink-0" />
          <div className="no-scrollbar -mr-5 flex min-w-0 flex-1 gap-1.5 overflow-x-auto pr-5">
            {HOUR_CHIPS.map((h) => {
              const on = hours === h;
              return (
                <Chip key={h} on={on} onClick={() => setHours(on ? null : h)} className="min-w-11 justify-center px-3.5">
                  {h}
                </Chip>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-5">
        {showDate ? (
          <DateField
            label="Day"
            value={date}
            max={today}
            onChange={(v) => setDate(v as DateStr)}
            hint={
              wasLocked
                ? "This day is locked. It can no longer be changed."
                : locked
                  ? "That day is locked. Days close at noon the next day."
                  : future
                    ? "That day has not happened yet."
                    : undefined
            }
          />
        ) : (
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setShowDate(true)} className="pressable h-11 rounded-[12px] px-1 text-[14px] font-medium text-ink-2">
              Today, {formatDateShort(today)}. <span className="text-ink underline underline-offset-4">Change day</span>
            </button>
            {!thumb && read === "none" ? (
              <Button variant="secondary" size="sm" icon={<Camera size={16} aria-hidden />} onClick={() => picker.current?.click()}>
                Screenshot
              </Button>
            ) : null}
          </div>
        )}
        {showDate && !thumb && read === "none" && !wasLocked ? (
          <Button className="mt-3" variant="secondary" size="sm" icon={<Camera size={16} aria-hidden />} onClick={() => picker.current?.click()}>
            Attach a screenshot
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}
