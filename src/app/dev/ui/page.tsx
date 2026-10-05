"use client";

// Component gallery at /dev/ui. A live reference for the design system and a
// place to check photo storage. Not linked from the app.

import { useState } from "react";
import { Camera, Inbox } from "lucide-react";
import {
  Button,
  Card,
  Checkbox,
  DateField,
  EmptyState,
  ListRow,
  NumberField,
  PageHeader,
  ProgressBar,
  ProgressRing,
  Screen,
  Section,
  SegmentedControl,
  Select,
  Sheet,
  Stat,
  TextField,
  TimeField,
  Toggle,
  useToast,
} from "@/components/ui";
import { removePhoto, uploadPhoto } from "@/lib/storage";
import { usePhoto } from "@/lib/storage/hooks";

export default function Gallery() {
  const toast = useToast();
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  const [on, setOn] = useState(true);
  const [seg, setSeg] = useState<"day" | "week" | "all">("day");
  const [num, setNum] = useState<number | null>(185);
  const [hero, setHero] = useState<number | null>(42.5);
  const [text, setText] = useState("");
  const [time, setTime] = useState("06:30");
  const [date, setDate] = useState("2026-10-05");
  const [app, setApp] = useState("DoorDash");
  const [sheet, setSheet] = useState(false);
  const [ring, setRing] = useState(0.58);
  const [ref, setRef] = useState<string | null>(null);
  const photo = usePhoto(ref);

  return (
    <Screen className="pb-16">
      <PageHeader eyebrow="Design system" title="Components" subtitle="Everything in src/components/ui." />

      <Section title="Type">
        <Card className="flex flex-col gap-3">
          <p className="t-display">12</p>
          <p className="t-num">$640</p>
          <p className="t-num-sm">182.4</p>
          <p className="t-title">Page title</p>
          <p className="t-h2">Card heading</p>
          <p>Body text at 16px.</p>
          <p className="t-sub">Secondary line.</p>
          <p className="t-label">Eyebrow label</p>
        </Card>
      </Section>

      <Section title="Stat">
        <Card className="grid grid-cols-2 gap-5">
          <Stat label="Earned" value="$640" sub="of $1,000" />
          <Stat label="Streak" value="7" unit="days" done />
          <Stat label="Weight" value="182.4" unit="lb" size="sm" />
          <Stat label="Left" value="360" unit="kcal" size="sm" />
        </Card>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-col gap-3">
          <Button full size="lg">Primary large</Button>
          <div className="flex gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
          <div className="flex gap-3">
            <Button variant="danger">Danger</Button>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
          </div>
        </div>
      </Section>

      <Section title="Checkbox and toggle">
        <Card padded={false} className="overflow-hidden">
          <div className="divide-y divide-line">
            <ListRow left={<Checkbox label="Done item" checked={a} onChange={setA} />} title="Checkbox" sub="Tap to see the done animation" />
            <ListRow left={<Checkbox label="Late item" checked={b} off onChange={setB} />} title="Checkbox, off state" sub="Ticked but does not count" />
            <ListRow title="Toggle" right={<Toggle label="Toggle" checked={on} onChange={setOn} />} />
            <ListRow title="Row with a link" sub="Chevron added" href="/dev/ui" />
          </div>
        </Card>
      </Section>

      <Section title="Progress">
        <Card className="flex flex-col gap-5">
          <div className="flex items-center gap-5">
            <ProgressRing value={ring} label="Demo">
              <span className="tnum text-[22px] font-semibold">{Math.round(ring * 100)}%</span>
            </ProgressRing>
            <ProgressRing value={0.8} size={56} tone="ink" />
            <ProgressRing value={1} size={56} />
            <ProgressRing value={0.9} size={56} tone="warn" />
          </div>
          <ProgressBar value={ring} marker={0.5} label="Demo bar" />
          <ProgressBar value={0.3} tone="ink" height={4} />
          <Button variant="secondary" size="sm" onClick={() => setRing((r) => (r >= 1 ? 0.1 : Math.min(1, r + 0.2)))}>
            Advance
          </Button>
        </Card>
      </Section>

      <Section title="Fields">
        <Card className="flex flex-col gap-4">
          <SegmentedControl
            label="Range"
            value={seg}
            onChange={setSeg}
            options={[
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
              { value: "all", label: "All" },
            ]}
          />
          <NumberField label="Protein" unit="g" value={num} onChange={setNum} hint="Fires on blur or Enter" />
          <NumberField variant="hero" label="Amount" prefix="$" value={hero} onChange={setHero} />
          <div className="flex items-center justify-between">
            <span>Inline in a row</span>
            <NumberField variant="inline" unit="g" value={num} onChange={setNum} done={(num ?? 0) >= 180} aria-label="Inline protein" />
          </div>
          <TextField label="Text" value={text} onChange={setText} placeholder="What did you do?" />
          <div className="grid grid-cols-2 gap-3">
            <TimeField label="Time" value={time} onChange={setTime} />
            <DateField label="Date" value={date} onChange={setDate} />
          </div>
          <Select
            label="App"
            value={app}
            onChange={setApp}
            options={["DoorDash", "Uber Eats", "Instacart"].map((v) => ({ value: v, label: v }))}
          />
        </Card>
      </Section>

      <Section title="Sheet and toast">
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setSheet(true)}>Open sheet</Button>
          <Button variant="secondary" onClick={() => toast("Saved", { kind: "done" })}>Done toast</Button>
          <Button variant="secondary" onClick={() => toast("Could not save", { kind: "error" })}>Error</Button>
        </div>
      </Section>

      <Section title="Empty state">
        <Card padded={false}>
          <EmptyState compact icon={<Inbox size={24} aria-hidden />} title="Nothing here yet" body="A short line on what will show up and how to add it." action={<Button size="sm">Add one</Button>} />
        </Card>
      </Section>

      <Section title="Photo storage">
        <Card className="flex flex-col gap-3">
          <label className="pressable flex h-12 cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-line bg-surface-2 font-semibold">
            <Camera size={18} aria-hidden />
            Pick a photo
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              data-testid="photo-input"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  setRef(await uploadPhoto(file, { folder: "dev" }));
                  toast("Stored", { kind: "done" });
                } catch (err) {
                  toast(err instanceof Error ? err.message : "Upload failed", { kind: "error" });
                }
              }}
            />
          </label>
          {ref ? <p className="t-sub break-all" data-testid="photo-ref">{ref}</p> : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo ? <img src={photo} alt="Stored" data-testid="photo-img" className="w-full rounded-[14px]" /> : null}
          {ref ? (
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                await removePhoto(ref);
                setRef(null);
              }}
            >
              Remove
            </Button>
          ) : null}
        </Card>
      </Section>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Bottom sheet"
        subtitle="Closes on backdrop tap, Escape, or a swipe down on the handle."
        footer={<Button full onClick={() => setSheet(false)}>Done</Button>}
      >
        <div className="flex flex-col gap-4">
          <NumberField variant="hero" prefix="$" value={hero} onChange={setHero} label="Amount" />
          <TextField label="Note" value={text} onChange={setText} />
        </div>
      </Sheet>
    </Screen>
  );
}
