"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Download, Share } from "lucide-react";
import { Button, Card, Toggle, useToast } from "@/components/ui";
import { useChecklist, useList, useLogs, useMode } from "@/lib/db/hooks";
import { haptics } from "@/lib/haptics";
import { challengeItems } from "@/lib/logic/challenge";
import { addDays, weekStart } from "@/lib/logic/dates";
import { ongoingCardData } from "@/lib/logic/ongoing";
import { buildProgress, cardData } from "@/lib/logic/progress";
import { resolvePhoto } from "@/lib/storage";
import { CARD_H, CARD_W, canvasToPng, drawCard, loadImage, readTheme } from "./draw";

const noSubscribe = () => () => {};

function canShareFiles(file: File): boolean {
  try {
    return typeof navigator !== "undefined" && typeof navigator.share === "function" && !!navigator.canShare?.({ files: [file] });
  } catch {
    return false;
  }
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** The card preview with its photo switches and the share and save buttons. */
export function ShareCard() {
  const mode = useMode();
  const today = mode.today;
  const checklist = useChecklist();
  const c = mode.challenge;
  // A challenge card reads from its start. The ongoing card reads far enough back for streaks.
  const back = addDays(today, -400);
  const from = c && c.start_date < mode.historyStart ? c.start_date : mode.historyStart;
  const logs = useLogs(weekStart(from > back ? from : back), today);
  const body = useList("body_log", { orderBy: "date" });
  const toast = useToast();

  // Photos are personal, so both start off.
  const [showBefore, setShowBefore] = useState(false);
  const [showAfter, setShowAfter] = useState(false);
  const [busy, setBusy] = useState(false);
  const [painted, setPainted] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);

  // In a challenge: its day count and its grid. Otherwise: the last 30 days
  // and how many of them were full.
  const data = useMemo(() => {
    if (mode.loading || checklist.loading || logs.loading) return null;
    const { items, versions } = checklist.data;
    if (!c) {
      const start = mode.historyStart > back ? mode.historyStart : back;
      return ongoingCardData({ historyStart: start, today, items, versions, logs: logs.data }, body.data);
    }
    const model = buildProgress({
      startDate: c.start_date,
      lengthDays: c.length_days,
      streakFrom: mode.historyStart > back ? mode.historyStart : back,
      today,
      items: challengeItems(c, items),
      versions,
      logs: logs.data,
    });
    return cardData(model, c.start_date, today, body.data);
  }, [c, mode.loading, mode.historyStart, back, today, checklist.loading, checklist.data, logs.loading, logs.data, body.data]);

  const beforeRef = showBefore ? (data?.before?.ref ?? null) : null;
  const afterRef = showAfter ? (data?.after?.ref ?? null) : null;

  useEffect(() => {
    if (!data) return;
    let stale = false;
    (async () => {
      const load = async (ref: string | null) => {
        if (!ref) return null;
        const url = await resolvePhoto(ref).catch(() => null);
        return url ? loadImage(url) : null;
      };
      const [before, after] = await Promise.all([load(beforeRef), load(afterRef)]);
      await document.fonts?.ready?.catch(() => undefined);
      const el = canvas.current;
      const ctx = el?.getContext("2d");
      if (stale || !el || !ctx) return;
      drawCard(ctx, data, readTheme(), { before, after });
      setPainted((n) => n + 1);
      if ((beforeRef && !before) || (afterRef && !after)) toast("A photo could not be loaded, so it was left off.", { kind: "error" });
    })();
    return () => {
      stale = true;
    };
  }, [data, beforeRef, afterRef, toast]);

  // Find out once whether this browser can share an image file.
  const shareable = useSyncExternalStore(
    noSubscribe,
    () => canShareFiles(new File([new Blob([""], { type: "image/png" })], "card.png", { type: "image/png" })),
    () => false,
  );

  const fileName = `lock-in-${data?.fileTag ?? "card"}.png`;

  async function makeBlob(): Promise<Blob | null> {
    const el = canvas.current;
    if (!el || painted === 0) return null;
    try {
      return await canvasToPng(el);
    } catch {
      toast("Could not make the image.", { kind: "error" });
      return null;
    }
  }

  async function save() {
    setBusy(true);
    const blob = await makeBlob();
    setBusy(false);
    if (!blob) return;
    download(blob, fileName);
    haptics.done();
    toast("Saved to your downloads.", { kind: "done" });
  }

  async function share() {
    setBusy(true);
    const blob = await makeBlob();
    setBusy(false);
    if (!blob || !data) return;
    const file = new File([blob], fileName, { type: "image/png" });
    if (!canShareFiles(file)) {
      download(blob, fileName);
      toast("Saved to your downloads.", { kind: "done" });
      return;
    }
    try {
      await navigator.share({ files: [file], title: "Lock In", text: `${data.caption}.` });
      haptics.done();
    } catch (e) {
      // Closing the share sheet is not an error.
      if ((e as { name?: string })?.name !== "AbortError") {
        download(blob, fileName);
        toast("Sharing did not work, so it was saved instead.", { kind: "info" });
      }
    }
  }

  const hasBefore = !!data?.before;
  const hasAfter = !!data?.after;

  return (
    <div>
      <div className="mt-3 overflow-hidden rounded-[20px] border border-line bg-surface">
        <canvas
          ref={canvas}
          width={CARD_W}
          height={CARD_H}
          role="img"
          aria-label={data ? `Progress card. ${data.caption}, ${data.percent} percent complete.` : "Progress card"}
          className="block h-auto w-full"
          style={{ aspectRatio: `${CARD_W} / ${CARD_H}` }}
        />
      </div>

      <div className="mt-4 flex gap-2.5">
        {shareable ? (
          <>
            <Button full size="lg" onClick={share} loading={busy} disabled={painted === 0} icon={<Share size={18} aria-hidden />}>
              Share
            </Button>
            <Button variant="secondary" size="lg" onClick={save} disabled={busy || painted === 0} aria-label="Save image" icon={<Download size={18} aria-hidden />}>
              Save
            </Button>
          </>
        ) : (
          <Button full size="lg" onClick={save} loading={busy} disabled={painted === 0} icon={<Download size={18} aria-hidden />}>
            Save image
          </Button>
        )}
      </div>

      <Card padded={false} className="mt-5 overflow-hidden">
        <div className="divide-y divide-line">
          <div className="flex min-h-[64px] items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-medium text-ink">First photo</div>
              <div className="mt-0.5 text-[13px] text-ink-3">{hasBefore ? data?.before?.label : "No progress photo yet"}</div>
            </div>
            <Toggle checked={showBefore && hasBefore} onChange={setShowBefore} label="Show first photo" disabled={!hasBefore} />
          </div>
          <div className="flex min-h-[64px] items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-medium text-ink">Latest photo</div>
              <div className="mt-0.5 text-[13px] text-ink-3">{hasAfter ? data?.after?.label : hasBefore ? "Needs a second photo" : "No progress photo yet"}</div>
            </div>
            <Toggle checked={showAfter && hasAfter} onChange={setShowAfter} label="Show latest photo" disabled={!hasAfter} />
          </div>
        </div>
      </Card>
      <p className="t-sub mt-3 px-1">Photos stay off the card unless you turn them on. Add them on the Body tab.</p>
    </div>
  );
}
