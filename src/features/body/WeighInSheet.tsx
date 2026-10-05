"use client";

import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { Button, DateField, NumberField, Sheet, useToast } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { useObjectUrl, usePhoto } from "@/lib/storage/hooks";
import type { BodyLog, DateStr } from "@/lib/types";
import { removeProgressPhoto, removeWeighIn, saveWeighIn } from "./data";

/** Log a weigh-in, with an optional progress photo. Mount with a fresh key. */
export function WeighInSheet({
  logs,
  initialDate,
  today,
  minDate,
  unit,
  onClose,
}: {
  logs: BodyLog[];
  initialDate: DateStr;
  today: DateStr;
  minDate?: DateStr;
  unit: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [date, setDate] = useState(initialDate);
  const existing = logs.find((l) => l.date === date) ?? null;
  const [weight, setWeight] = useState<number | null>(existing?.weight ?? null);
  const [photo, setPhoto] = useState<File | null>(null);
  const preview = useObjectUrl(photo);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const stored = usePhoto(existing?.photo_url);

  const changeDate = (d: DateStr) => {
    setDate(d);
    setWeight(logs.find((l) => l.date === d)?.weight ?? null);
  };

  const canSave = !busy && (weight !== null || photo !== null);
  const image = preview ?? stored;

  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await work();
      haptics.done();
      toast(done, { kind: "done" });
      onClose();
    } catch (e) {
      haptics.error();
      toast(e instanceof Error ? e.message : "Could not save", { kind: "error" });
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Weigh-in"
      subtitle="Friday morning, before you eat."
      footer={
        <div className="flex gap-2.5">
          {existing && existing.weight !== null ? (
            <Button variant="danger" disabled={busy} icon={<Trash2 size={18} aria-hidden />} onClick={() => run(() => removeWeighIn(date), "Weigh-in removed")}>
              Delete
            </Button>
          ) : null}
          <Button full disabled={!canSave} loading={busy} onClick={() => run(() => saveWeighIn(date, weight, photo), "Weigh-in saved")}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <NumberField variant="hero" label="Weight" unit={unit} value={weight} onChange={setWeight} live max={999} placeholder="0" autoFocus={!existing} />
        <DateField label="Date" value={date} onChange={changeDate} max={today} min={minDate} />
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink-2">Progress photo</p>
          {image ? (
            <div className="flex items-center gap-3 rounded-[14px] border border-line bg-surface-2 p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="Progress photo" className="h-24 w-[72px] rounded-[10px] object-cover" />
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                <Button size="sm" variant="secondary" onClick={() => file.current?.click()}>
                  Replace
                </Button>
                {photo ? (
                  <Button size="sm" variant="ghost" onClick={() => setPhoto(null)}>
                    Remove
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => removeProgressPhoto(date), "Photo removed")}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <Button variant="secondary" full icon={<Camera size={18} aria-hidden />} onClick={() => file.current?.click()}>
              Add a photo
            </Button>
          )}
          <p className="mt-1.5 text-[13px] text-ink-3">Same spot, same light, same pose each week.</p>
          <input
            ref={file}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Progress photo"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) setPhoto(f);
            }}
          />
        </div>
      </div>
    </Sheet>
  );
}
