"use client";

// The lock screen: the pinned quote in a phone preview, the look, saving the
// wallpaper, and the optional morning automation. One panel, shown on its own
// screen (/library/lockscreen) and in the sheet Today opens.

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, PenLine, RefreshCw } from "lucide-react";
import { Button, ButtonLink, Card, EmptyState, SectionLabel, SegmentedControl, cn, useToast } from "@/components/ui";
import { db } from "@/lib/db";
import { haptics } from "@/lib/haptics";
import { nowIso, nyParts } from "@/lib/logic/dates";
import { WALLPAPER_STYLES, lookFor, wallpaperName, wallpaperPath } from "@/lib/logic/lockscreen";
import { buildTheme } from "@/lib/logic/theme";
import { useTheme } from "@/lib/theme";
import type { WallpaperStyle } from "@/lib/types";
import { makeLockscreenToken, setPinnedStyle, unpinQuote, usePinned } from "./pin";
import { drawWallpaper, loadFont, pageFamily, renderWallpaper, saveWallpaper } from "./render";

const WriteSheet = dynamic(() => import("./WriteSheet").then((m) => m.WriteSheet), { ssr: false });

const PREVIEW_SCALE = 0.3;
const CONTRAST = buildTheme("contrast", null);

export function LockScreenPanel() {
  const toast = useToast();
  const { theme } = useTheme();
  const { pinned, token, loading } = usePinned();
  const [writing, setWriting] = useState(false);
  const [saving, setSaving] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  const style: WallpaperStyle = pinned?.wallpaper_style ?? "plain";
  const look = useMemo(() => lookFor(style, theme, CONTRAST), [style, theme]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !pinned) return;
    let live = true;
    const family = pageFamily();
    void loadFont(family).then(() => {
      if (live && canvas.current) drawWallpaper(canvas.current, { pinned, look, family, scale: PREVIEW_SCALE, clock: true });
    });
    return () => {
      live = false;
    };
  }, [pinned, look]);

  const save = async () => {
    if (!pinned || saving) return;
    setSaving(true);
    try {
      const blob = await renderWallpaper({ pinned, look, family: pageFamily() });
      const result = await saveWallpaper(blob, wallpaperName(style, nyParts(nowIso()).date));
      if (result === "shared") toast("Choose Save Image", { kind: "done" });
      else if (result === "downloaded") toast("Saved to your downloads", { kind: "done" });
    } catch {
      haptics.error();
      toast("Could not make the picture. Try again.", { kind: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-[420px]" aria-busy="true" />;

  if (!pinned) {
    return (
      <>
        <EmptyState
          title="Nothing on your lock screen"
          body="Tap Put on lock screen under any quote, or write your own."
          action={
            <div className="flex flex-col gap-3">
              <Button icon={<PenLine size={18} strokeWidth={1.75} aria-hidden />} onClick={() => setWriting(true)}>
                Write your own
              </Button>
              <ButtonLink href="/library" variant="secondary">
                Open the library
              </ButtonLink>
            </div>
          }
        />
        {writing ? <WriteSheet onClose={() => setWriting(false)} /> : null}
      </>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col items-center pt-1">
        <div className="overflow-hidden rounded-[34px] border border-glass-line">
          <canvas ref={canvas} role="img" aria-label={`Lock screen preview: ${pinned.text}${pinned.by ? `, ${pinned.by}` : ""}`} className="block h-auto w-[168px]" />
        </div>
      </div>

      <div className="mt-6">
        <SegmentedControl
          label="Style"
          options={WALLPAPER_STYLES.map((s) => ({ value: s.id, label: s.label }))}
          value={style}
          onChange={(s) => void setPinnedStyle(s)}
        />
      </div>

      <div className="mt-4">
        <Button size="lg" full loading={saving} icon={<Download size={18} strokeWidth={1.75} aria-hidden />} onClick={() => void save()}>
          Save wallpaper
        </Button>
        <ol className="t-sub mt-3 list-none space-y-1 px-1">
          <li>Tap Save wallpaper, then Save Image.</li>
          <li>Open the photo, tap Share, then Use as Wallpaper.</li>
          <li>Pick Lock Screen. The words sit low, clear of the clock.</li>
        </ol>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button variant="secondary" icon={<PenLine size={18} strokeWidth={1.75} aria-hidden />} onClick={() => setWriting(true)}>
          Write your own
        </Button>
        <Button variant="ghost" onClick={() => void unpinQuote()}>
          Take it off
        </Button>
      </div>

      <Morning token={token} style={style} />

      <p className="t-caption mt-7 px-1 text-ink-2">The lock screen widget that shows it all day comes with the native app.</p>
      {writing ? <WriteSheet onClose={() => setWriting(false)} /> : null}
    </div>
  );
}

/** The optional morning automation: an iOS Shortcut that opens a link and gets today's picture. */
function Morning({ token, style }: { token: string | null; style: WallpaperStyle }) {
  const toast = useToast();
  const [local, setLocal] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void db.backendName().then((n) => live && setLocal(n === "local" || n === "memory"));
    return () => {
      live = false;
    };
  }, []);

  const make = async () => {
    setBusy(true);
    try {
      const t = await makeLockscreenToken();
      if (!t) toast("Could not make the link. Run supabase/migrations/0018_pinned_quote.sql first.", { kind: "error" });
    } finally {
      setBusy(false);
    }
  };
  const link = token && typeof window !== "undefined" ? `${window.location.origin}${wallpaperPath(token, style)}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copied", { kind: "done" });
    } catch {
      toast("Press and hold the link to copy it", { kind: "info" });
    }
  };

  return (
    <section className="mt-7" aria-label="Change it every morning">
      <SectionLabel>Change it every morning</SectionLabel>
      {local === null ? null : local ? (
        <p className="t-sub mt-3 px-1">This needs sync set up, so the app can reach your quote while your phone is locked. Connect Supabase first.</p>
      ) : (
        <>
          <p className="t-sub mt-3 px-1">In Shortcuts, add an automation at the time you wake up. Use Get Contents of URL with your link, then Save to Photo Album. Where your iOS has Set Wallpaper, add that last.</p>
          {token ? (
            <Card className={cn("mt-3")}>
              <p className="t-caption break-all text-ink-2 select-all">{link}</p>
              <div className="mt-3 flex gap-3">
                <Button size="sm" variant="secondary" icon={<Copy size={16} strokeWidth={1.75} aria-hidden />} onClick={() => void copy()}>
                  Copy link
                </Button>
                <Button size="sm" variant="ghost" loading={busy} icon={<RefreshCw size={16} strokeWidth={1.75} aria-hidden />} onClick={() => void make()}>
                  New link
                </Button>
              </div>
              <p className="t-caption mt-3 text-ink-2">The link shows your pinned quote to anyone who has it. A new link stops the old one.</p>
            </Card>
          ) : (
            <div className="mt-3">
              <Button variant="secondary" loading={busy} onClick={() => void make()}>
                Make my link
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
