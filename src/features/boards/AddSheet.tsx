"use client";

// Everything that can go on a board, from one sheet: the camera, the photo
// library (screenshots live there too), the clipboard, a web link, a color
// and a note.

import { useRef, useState } from "react";
import { Camera, ClipboardPaste, Globe, Images, Palette, Type } from "lucide-react";
import { Button, Sheet, TextField, cn } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { cleanLink, inkOnColor } from "@/lib/logic/boards";
import { normalizeHex } from "@/lib/logic/theme";
import type { BoardItemSource } from "@/lib/types";

export interface AddSheetProps {
  open: boolean;
  onClose: () => void;
  /** Add image files. Resolves when they are stored. */
  onFiles: (files: Blob[], source: BoardItemSource) => Promise<void>;
  /** Fetch a web image and add it. Rejects with a message to show. */
  onWeb: (url: string) => Promise<void>;
  onColor: (hex: string, name: string) => Promise<void>;
  onNote: (text: string, link: string) => Promise<void>;
  /** Colors already on the board, offered as quick picks. */
  suggestions: string[];
}

type Mode = "menu" | "web" | "color" | "note";

export function AddSheet(props: AddSheetProps) {
  const { open, onClose } = props;
  const [mode, setMode] = useState<Mode>("menu");
  const close = () => {
    setMode("menu");
    onClose();
  };
  const title = mode === "web" ? "From the web" : mode === "color" ? "Add a color" : mode === "note" ? "Add a note" : "Add to board";
  return (
    <Sheet open={open} onClose={close} title={title}>
      {mode === "menu" ? <Menu {...props} onClose={close} go={setMode} /> : null}
      {mode === "web" ? <WebForm onWeb={props.onWeb} done={close} back={() => setMode("menu")} /> : null}
      {mode === "color" ? <ColorForm onColor={props.onColor} suggestions={props.suggestions} done={close} back={() => setMode("menu")} /> : null}
      {mode === "note" ? <NoteForm onNote={props.onNote} done={close} back={() => setMode("menu")} /> : null}
    </Sheet>
  );
}

function Option({ icon, label, sub, onClick }: { icon: React.ReactNode; label: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        haptics.tap();
        onClick();
      }}
      className="pressable tile flex min-h-[92px] flex-col justify-between rounded-[20px] p-3.5 text-left"
    >
      <span className="text-ink-2">{icon}</span>
      <span>
        <span className="t-value block">{label}</span>
        <span className="t-caption mt-1 block text-ink-2">{sub}</span>
      </span>
    </button>
  );
}

function Menu({ onFiles, onClose, go }: AddSheetProps & { go: (m: Mode) => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const take = (source: BoardItemSource) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    onClose();
    void onFiles(files, source);
  };

  const paste = async () => {
    setProblem(null);
    try {
      const entries = await navigator.clipboard.read();
      const blobs: Blob[] = [];
      for (const entry of entries) {
        const type = entry.types.find((t) => t.startsWith("image/"));
        if (type) blobs.push(await entry.getType(type));
      }
      if (blobs.length > 0) {
        onClose();
        void onFiles(blobs, "screenshot");
        return;
      }
      setProblem("No image on the clipboard.");
    } catch {
      setProblem("The clipboard is blocked here. Paste straight onto the board instead.");
    }
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5">
        <Option icon={<Camera size={20} strokeWidth={1.75} aria-hidden />} label="Camera" sub="Shoot it now" onClick={() => camera.current?.click()} />
        <Option icon={<Images size={20} strokeWidth={1.75} aria-hidden />} label="Photos" sub="And screenshots" onClick={() => library.current?.click()} />
        <Option icon={<ClipboardPaste size={20} strokeWidth={1.75} aria-hidden />} label="Paste" sub="What you copied" onClick={() => void paste()} />
        <Option icon={<Globe size={20} strokeWidth={1.75} aria-hidden />} label="Web" sub="A link" onClick={() => go("web")} />
        <Option icon={<Palette size={20} strokeWidth={1.75} aria-hidden />} label="Color" sub="A swatch" onClick={() => go("color")} />
        <Option icon={<Type size={20} strokeWidth={1.75} aria-hidden />} label="Note" sub="Words or a link" onClick={() => go("note")} />
      </div>
      {problem ? (
        <p role="alert" className="t-sub mt-3 text-warn">
          {problem}
        </p>
      ) : null}
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={take("camera")} aria-label="Take a photo" />
      <input ref={library} type="file" accept="image/*" multiple className="hidden" onChange={take("upload")} aria-label="Choose photos" />
    </div>
  );
}

function FormButtons({ back, label, busy, disabled, onSubmit }: { back: () => void; label: string; busy?: boolean; disabled?: boolean; onSubmit: () => void }) {
  return (
    <div className="mt-5 flex gap-2.5">
      <Button variant="secondary" onClick={back}>
        Back
      </Button>
      <Button full loading={busy} disabled={disabled} onClick={onSubmit}>
        {label}
      </Button>
    </div>
  );
}

function WebForm({ onWeb, done, back }: { onWeb: (url: string) => Promise<void>; done: () => void; back: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    const link = cleanLink(url);
    if (!link) return setError("That does not look like a link.");
    setBusy(true);
    setError(null);
    try {
      await onWeb(link);
      setUrl("");
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fetch that image.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <TextField
        label="Link"
        value={url}
        onChange={(v) => {
          setUrl(v);
          setError(null);
        }}
        placeholder="https://"
        error={error}
        hint="An image address, or a page. A page gives its main image."
        autoFocus
      />
      <FormButtons back={back} label="Fetch image" busy={busy} disabled={!url.trim()} onSubmit={() => void submit()} />
    </div>
  );
}

function ColorForm({ onColor, suggestions, done, back }: { onColor: (hex: string, name: string) => Promise<void>; suggestions: string[]; done: () => void; back: () => void }) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const hex = normalizeHex(text);
  const typed = text.trim() !== "";
  return (
    <div>
      <div className="flex items-stretch gap-3">
        <label
          className={cn("relative flex h-[104px] w-[104px] shrink-0 cursor-pointer items-end overflow-hidden rounded-[20px] p-3", hex ? "" : "tile text-ink-2")}
          style={hex ? { backgroundColor: hex, color: inkOnColor(hex) } : undefined}
        >
          <span className="tnum text-[11px] font-medium tracking-[0.12em] uppercase">{hex ? hex.replace("#", "") : "Pick"}</span>
          {/* The system color picker. It sits over the swatch, invisible, so a tap on the swatch opens it. */}
          <input type="color" aria-label="Pick a color" value={hex ?? "#808080"} onChange={(e) => setText(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
        </label>
        <div className="min-w-0 flex-1 space-y-2.5">
          <TextField aria-label="Hex code" value={text} onChange={setText} placeholder="Hex, like 1b1b1b" maxLength={9} error={typed && !hex ? "Six letters and numbers, like c8f73a." : null} />
          <TextField aria-label="Name" value={name} onChange={setName} placeholder="Name it (optional)" maxLength={40} />
        </div>
      </div>
      {suggestions.length > 0 ? (
        <div className="mt-4">
          <p className="t-label mb-2">From this board</p>
          <div className="no-scrollbar -mx-5 flex gap-2.5 overflow-x-auto px-5 py-1">
            {suggestions.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Use ${c}`}
                onClick={() => {
                  haptics.tap();
                  setText(c);
                }}
                className={cn("pressable size-11 shrink-0 rounded-full border", hex === c ? "border-ink outline outline-[1.5px] outline-offset-2 outline-ink" : "border-hair")}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      ) : null}
      <FormButtons
        back={back}
        label="Keep color"
        disabled={!hex}
        onSubmit={() => {
          if (!hex) return;
          void onColor(hex, name).then(done);
        }}
      />
    </div>
  );
}

function NoteForm({ onNote, done, back }: { onNote: (text: string, link: string) => Promise<void>; done: () => void; back: () => void }) {
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const badLink = link.trim() !== "" && !cleanLink(link);
  return (
    <div className="space-y-3">
      <TextField label="Note" value={text} onChange={setText} rows={3} maxLength={600} placeholder="A line, a reference, a rule for the work" autoFocus />
      <TextField label="Link (optional)" value={link} onChange={setLink} placeholder="https://" error={badLink ? "That does not look like a link." : null} />
      <FormButtons back={back} label="Add note" disabled={badLink || (!text.trim() && !link.trim())} onSubmit={() => void onNote(text, link).then(done)} />
    </div>
  );
}
