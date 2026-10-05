"use client";

// Component gallery at /dev/ui. Every piece of the design system in the
// current look, with its name, so a screen can be built by pointing at it.
// docs/BUILD.md, "Design system", is the written half. Development only.

import { useState } from "react";
import { Camera, Inbox, Plus, Settings, Timer } from "lucide-react";
import {
  ActionButton,
  BigNumber,
  Button,
  Card,
  Checkbox,
  DateField,
  EmptyState,
  GlassCard,
  IconButton,
  IconLink,
  List,
  ListRow,
  NumberField,
  NumberTile,
  PageHeader,
  ProgressBar,
  ProgressRing,
  Screen,
  Section,
  SectionLabel,
  SegmentedControl,
  Select,
  Sheet,
  Stat,
  TextField,
  Tile,
  TimeField,
  Toggle,
  TopBar,
  TrackStat,
  useToast,
} from "@/components/ui";
import { ThemePicker } from "@/components/app/ThemePicker";
import { removePhoto, uploadPhoto } from "@/lib/storage";
import { usePhoto } from "@/lib/storage/hooks";

function Swatch({ name, className }: { name: string; className: string }) {
  return (
    <div className="min-w-0">
      <div className={`h-12 rounded-[14px] border border-glass-line ${className}`} />
      <p className="t-caption mt-1.5 truncate text-ink-2">{name}</p>
    </div>
  );
}

export default function Gallery() {
  const toast = useToast();
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  const [on, setOn] = useState(true);
  const [seg, setSeg] = useState<"day" | "week" | "all">("day");
  const [num, setNum] = useState<number | null>(185);
  const [hero, setHero] = useState<number | null>(42.5);
  const [protein, setProtein] = useState<number | null>(112);
  const [text, setText] = useState("");
  const [time, setTime] = useState("05:45");
  const [date, setDate] = useState("2026-10-08");
  const [pick, setPick] = useState("dd");
  const [sheet, setSheet] = useState(false);
  const [tick, setTick] = useState(false);
  const [track, setTrack] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const url = usePhoto(ref);

  return (
    <Screen>
      <PageHeader title="Design system" eyebrow="Dev only" subtitle="Every component in the current look. Switch the look at the bottom." back="/today" right={<IconLink href="/settings" label="Settings"><Settings size={20} strokeWidth={1.75} aria-hidden /></IconLink>} />

      <Section title="Headers">
        <Card>
          <TopBar as="p" title="TopBar" right={<span>6 days left</span>} />
          <p className="t-sub">A tab screen that leads with a hero uses TopBar. One that leads with its name uses PageHeader, as at the top of this page. Sub-screens always pass `back`.</p>
        </Card>
      </Section>

      <Section title="Type">
        <div className="flex flex-col gap-4 px-1">
          <BigNumber label="BigNumber, t-hero 84" prefix="$" value="140" sub="$123 a day gets you there." />
          <p className="t-display">64 t-display</p>
          <p className="t-greeting">t-greeting 38</p>
          <p className="t-num">40 t-num</p>
          <p className="t-title">t-title 28</p>
          <p className="t-h1">t-h1 26, the title in a card</p>
          <p className="t-stat">22 t-stat</p>
          <p className="t-h2">t-h2 20, headings</p>
          <p className="t-value">20 t-value</p>
          <p>Body 16, regular. Plain words, short.</p>
          <p className="t-sub">t-sub 13, secondary lines</p>
          <p className="t-caption text-ink-2">t-caption 12, tile labels</p>
          <p className="t-label">t-label 11, uppercase</p>
        </div>
      </Section>

      <Section title="Color tokens">
        <div className="grid grid-cols-4 gap-2.5">
          <Swatch name="bg" className="bg-bg" />
          <Swatch name="surface" className="bg-surface" />
          <Swatch name="surface-2" className="bg-surface-2" />
          <Swatch name="surface-3" className="bg-surface-3" />
          <Swatch name="glass" className="glass" />
          <Swatch name="tile" className="tile" />
          <Swatch name="grad" className="grad" />
          <Swatch name="ink" className="bg-ink" />
          <Swatch name="ink-2" className="bg-ink-2" />
          <Swatch name="ink-3" className="bg-ink-3" />
          <Swatch name="accent" className="bg-accent" />
          <Swatch name="accent-2" className="bg-accent-2" />
          <Swatch name="warn" className="bg-warn" />
          <Swatch name="warn-soft" className="bg-warn-soft" />
          <Swatch name="danger" className="bg-danger" />
          <Swatch name="hair" className="bg-hair" />
        </div>
      </Section>

      <Section title="GlassCard and Card">
        <GlassCard>
          <div className="flex items-baseline justify-between">
            <p className="t-label text-accent">Now</p>
            <p className="t-sub">30 min left</p>
          </div>
          <p className="t-h1 mt-1.5">GlassCard</p>
          <ProgressBar value={0.62} className="mt-3.5" label="Example" />
          <div className="t-sub mt-3 flex justify-between">
            <span>Next</span>
            <span>Class at 10:00 AM</span>
          </div>
        </GlassCard>
        <Card className="mt-3">
          <p className="t-h2">Card</p>
          <p className="t-sub mt-1">The standard card. Same glass, smaller radius and padding.</p>
          <Card raised className="mt-3">
            <p className="t-sub">Card raised: solid, for a card inside a card or a sheet.</p>
          </Card>
        </Card>
      </Section>

      <Section title="TrackStat" right="4 of 4">
        <div className="grid grid-cols-4 gap-3.5 px-1">
          {[
            ["3/4", "Body", 0.75, false],
            ["$40", "Money", 0.4, false],
            ["1/2", "Mind", 0.5, false],
            ["0d", "Clean", 0.66, true],
          ].map(([value, label, progress, attention]) => (
            <TrackStat key={String(label)} value={String(value)} label={String(label)} progress={Number(progress)} attention={Boolean(attention)} pressed={track === label} onClick={() => setTrack(track === label ? null : String(label))} />
          ))}
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3.5 px-1">
          <TrackStat value="$18.40" label="Per hour" />
          <TrackStat value="$0" label="Banked" />
          <TrackStat value="7.6h" label="Worked" />
        </div>
      </Section>

      <Section title="Tile">
        <div className="grid grid-cols-3 gap-2.5">
          <Tile value={tick ? "5:41" : "Wake"} label={tick ? "Up early" : "By 6:00 AM"} state={tick ? "done" : "off"} checked={tick} onClick={() => setTick(!tick)} aria-label="Wake" />
          <Tile value="Lift" label="Upper B" state="done" checked onClick={() => undefined} />
          <Tile value="Smoking" label="Not clean" state="attention" href="/dev/ui" />
          <NumberTile name="Protein" value={protein} onChange={setProtein} unit="g" label="180g or more" state={protein !== null && protein >= 180 ? "done" : "off"} />
          <Tile value="$40" label="of $100" onClick={() => toast("A tile can open a sheet")} />
          <Tile
            value="Study"
            label="Block done"
            checked={false}
            onClick={() => undefined}
            corner={
              <button type="button" aria-label="Timer" className="flex h-11 min-w-11 items-start justify-end pt-3 pr-3 text-current" onClick={() => toast("The corner has its own tap target")}>
                <Timer size={16} aria-hidden />
              </button>
            }
          />
          <Tile value="Gambling or sports betting" label="Clean today?" checked={false} onClick={() => undefined} />
          <Tile value="Locked" label="Disabled" disabled onClick={() => undefined} />
          <Tile value="182.4" label="Static, no tap" />
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-col gap-3">
          <Button full size="lg">
            Primary, one per screen
          </Button>
          <div className="flex gap-3">
            <Button variant="solid" full>
              Solid
            </Button>
            <Button variant="secondary" full>
              Secondary
            </Button>
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" full>
              Ghost
            </Button>
            <Button variant="danger" full>
              Danger
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="secondary" icon={<Plus size={16} aria-hidden />}>
              Small
            </Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex items-center gap-3">
            <ActionButton label="Add">
              <Plus size={24} strokeWidth={1.75} aria-hidden />
            </ActionButton>
            <IconButton filled label="Camera">
              <Camera size={19} strokeWidth={1.75} aria-hidden />
            </IconButton>
            <IconButton label="Plain icon button">
              <Settings size={20} strokeWidth={1.75} aria-hidden />
            </IconButton>
            <span className="t-sub">ActionButton, IconButton filled, IconButton</span>
          </div>
        </div>
      </Section>

      <Section title="Progress">
        <Card className="flex items-center gap-5">
          <ProgressRing value={0.62} label="Example">
            <span className="t-stat">62%</span>
          </ProgressRing>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <ProgressBar value={0.62} label="Hairline" />
            <ProgressBar value={0.4} tone="ink" label="Ink" />
            <ProgressBar value={0.9} tone="warn" height={6} marker={0.7} label="Warn with a marker" />
          </div>
        </Card>
      </Section>

      <Section title="Stat">
        <Card className="grid grid-cols-2 gap-4">
          <Stat label="Weight" value="182.4" unit="lb" sub="Down 1.2 this week" />
          <Stat label="Streak" value="12" unit="days" size="sm" done />
        </Card>
      </Section>

      <Section title="Lists">
        <SectionLabel right="2 entries">List, straight on the page</SectionLabel>
        <List className="mt-1.5">
          <ListRow title="DoorDash" sub="2h, $20/h" value="$40" onClick={() => undefined} />
          <ListRow title="Uber Eats" sub="3.1h, $20/h" value="$62" onClick={() => undefined} />
        </List>
        <Card padded={false} className="mt-5 overflow-hidden">
          <div className="divide-y divide-hair">
            <ListRow href="/dev/ui" left={<Settings size={20} strokeWidth={1.75} aria-hidden />} title="Rows in a card" sub="For settings and menus" />
            <ListRow title="Haptics" sub="A row with a control" right={<Toggle label="Haptics" checked={on} onChange={setOn} />} />
            <ListRow title="Done" left={<Checkbox label="Done" checked={a} onChange={setA} />} right={<Checkbox label="Off" checked={b} off onChange={setB} />} />
          </div>
        </Card>
      </Section>

      <Section title="Forms">
        <div className="flex flex-col gap-4">
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
          <TextField label="TextField" hint="A hint sits under the control." value={text} onChange={setText} placeholder="Read 20 pages" />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="NumberField" value={num} onChange={setNum} unit="g" />
            <Select
              label="Select"
              value={pick}
              onChange={setPick}
              options={[
                { value: "dd", label: "DoorDash" },
                { value: "ue", label: "Uber Eats" },
              ]}
            />
            <TimeField label="TimeField" value={time} onChange={setTime} />
            <DateField label="DateField" value={date} onChange={setDate} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[15px]">NumberField inline</span>
            <NumberField variant="inline" value={num} onChange={setNum} unit="g" aria-label="Inline" />
          </div>
          <NumberField variant="hero" label="NumberField hero" prefix="$" value={hero} onChange={setHero} />
        </div>
      </Section>

      <Section title="Sheet and toast">
        <div className="flex gap-3">
          <Button variant="secondary" full onClick={() => setSheet(true)}>
            Open a sheet
          </Button>
          <Button variant="secondary" full onClick={() => toast("Saved", { kind: "done" })}>
            Toast
          </Button>
          <Button variant="secondary" full onClick={() => toast("Could not save", { kind: "error" })}>
            Error
          </Button>
        </div>
      </Section>

      <Section title="EmptyState">
        <Card padded={false}>
          <EmptyState compact icon={<Inbox size={22} strokeWidth={1.75} aria-hidden />} title="Nothing here yet" body="One sentence on what goes here, and one way forward." action={<Button variant="secondary">Add the first</Button>} />
        </Card>
      </Section>

      <Section title="Look">
        <ThemePicker />
      </Section>

      <Section title="Photo storage">
        <Card>
          <label className="pressable glass flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full text-[15px] font-medium">
            <Camera size={18} aria-hidden />
            Pick a photo
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (ref) await removePhoto(ref);
                setRef(await uploadPhoto(file, { folder: "dev" }));
              }}
            />
          </label>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url ? <img src={url} alt="" className="mt-3 max-h-48 rounded-[16px]" /> : <p className="t-sub mt-3">Stored through lib/storage, shown through usePhoto.</p>}
        </Card>
      </Section>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Sheet"
        subtitle="Solid surface, hairline, one primary action pinned at the bottom."
        footer={
          <Button full size="lg" onClick={() => setSheet(false)}>
            Done
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <NumberField variant="hero" prefix="$" value={hero} onChange={setHero} />
          <TextField label="Note" value={text} onChange={setText} />
        </div>
      </Sheet>
    </Screen>
  );
}
