import {
  BedDouble,
  Bike,
  BookOpen,
  CalendarDays,
  Circle,
  Dumbbell,
  GraduationCap,
  House,
  MapPin,
  Sunrise,
  Tv,
  Volleyball,
  type LucideIcon,
} from "lucide-react";
import type { BlockKind } from "@/lib/types";

export const KIND_LABEL: Record<BlockKind, string> = {
  wake: "Wake",
  workout: "Workout",
  home: "Home",
  class: "Class",
  delivery: "Delivery",
  basketball: "Basketball",
  study: "Study",
  bed: "Bed",
  free: "Free time",
  errand: "Errand",
  other: "Other",
};

export const KIND_ICON: Record<BlockKind, LucideIcon> = {
  wake: Sunrise,
  workout: Dumbbell,
  home: House,
  class: GraduationCap,
  delivery: Bike,
  basketball: Volleyball,
  study: BookOpen,
  bed: BedDouble,
  free: Tv,
  errand: MapPin,
  other: Circle,
};

export const CALENDAR_ICON = CalendarDays;

export const KIND_OPTIONS: { value: BlockKind; label: string }[] = (Object.keys(KIND_LABEL) as BlockKind[]).map((value) => ({
  value,
  label: KIND_LABEL[value],
}));

/** Guess the kind from what the user typed, so "TV" is free time without asking. */
export function kindForName(name: string): BlockKind {
  const n = name.toLowerCase();
  if (/\b(tv|show|movie|netflix|youtube|game|games|gaming|scroll|scrolling|tiktok|instagram|free time|nap|chill)\b/.test(n)) return "free";
  if (/\b(deliver|delivery|doordash|uber|instacart|dash)\b/.test(n)) return "delivery";
  if (/\b(study|homework|read|reading|business|work)\b/.test(n)) return "study";
  if (/\b(lift|workout|gym|run|jump rope|core)\b/.test(n)) return "workout";
  if (/\b(basketball|hoop|hoops)\b/.test(n)) return "basketball";
  if (/\b(class|lecture|lab)\b/.test(n)) return "class";
  if (/\b(errand|clock in|clock-in)\b/.test(n)) return "errand";
  return "other";
}
