// The lines the coach can quote, by school. The coach quotes these word for
// word and nothing else, so a quote on screen is always one that is in here.
//
// Pure. No dashes other than the plain hyphen.

export type QuoteSchool = "stoic" | "arrow" | "why" | "athlete" | "samurai";

export interface Quote {
  /** Stable id, saved on the message that used it. */
  key: string;
  school: QuoteSchool;
  text: string;
  by: string;
}

export const SCHOOL_LABEL: Record<QuoteSchool, string> = {
  stoic: "Stoics",
  arrow: "The second arrow",
  why: "Having a why",
  athlete: "Athletes",
  samurai: "Samurai discipline",
};

/** What each school is for, in a line. Goes into the prompt. */
export const SCHOOL_IDEA: Record<QuoteSchool, string> = {
  stoic: "You do not control the pain or the event. You control your read on it and what you do next.",
  arrow: "The pain is the first arrow. Complaining about it and dreading it is the second arrow, and that one you shoot yourself.",
  why: "A person with a reason can carry almost anything. Point them back at their own reason.",
  athlete: "The work that counts starts where it gets uncomfortable. Being done in your head is not being done.",
  samurai: "Do the thing today whether you feel like it or not. Beat who you were yesterday.",
};

export const QUOTES: readonly Quote[] = [
  { key: "seneca_imagination", school: "stoic", text: "We suffer more often in imagination than in reality.", by: "Seneca" },
  { key: "epictetus_views", school: "stoic", text: "People are disturbed not by things, but by the views they take of them.", by: "Epictetus" },
  { key: "marcus_endure", school: "stoic", text: "If it is endurable, then endure it. Stop complaining.", by: "Marcus Aurelius" },
  { key: "marcus_obstacle", school: "stoic", text: "What stands in the way becomes the way.", by: "Marcus Aurelius" },
  { key: "marcus_dawn", school: "stoic", text: "At dawn, when you have trouble getting out of bed, tell yourself: I have to go to work, as a human being.", by: "Marcus Aurelius" },
  { key: "epictetus_master", school: "stoic", text: "No man is free who is not master of himself.", by: "Epictetus" },
  { key: "seneca_time", school: "stoic", text: "It is not that we have a short time to live, but that we waste a lot of it.", by: "Seneca" },
  { key: "seneca_difficulties", school: "stoic", text: "Difficulties strengthen the mind, as labor does the body.", by: "Seneca" },
  { key: "pain_optional", school: "arrow", text: "Pain is inevitable. Suffering is optional.", by: "Buddhist saying" },
  { key: "second_arrow", school: "arrow", text: "The first arrow is the pain. The second arrow is the one you shoot yourself.", by: "The teaching of the two arrows" },
  { key: "nietzsche_why", school: "why", text: "He who has a why to live for can bear almost any how.", by: "Nietzsche" },
  { key: "frankl_change", school: "why", text: "When we are no longer able to change a situation, we are challenged to change ourselves.", by: "Viktor Frankl" },
  { key: "nietzsche_stronger", school: "why", text: "What does not kill me makes me stronger.", by: "Nietzsche" },
  { key: "ali_count", school: "athlete", text: "I don't count my sit-ups. I only start counting when it starts hurting.", by: "Muhammad Ali" },
  { key: "ali_champion", school: "athlete", text: "Suffer now and live the rest of your life as a champion.", by: "Muhammad Ali" },
  { key: "goggins_forty", school: "athlete", text: "When your mind is telling you that you're done, you're only 40 percent done.", by: "David Goggins" },
  { key: "kobe_rest", school: "athlete", text: "Rest at the end, not in the middle.", by: "Kobe Bryant" },
  { key: "jordan_fail", school: "athlete", text: "I've failed over and over and over again in my life. And that is why I succeed.", by: "Michael Jordan" },
  { key: "musashi_yesterday", school: "samurai", text: "Today is victory over yourself of yesterday.", by: "Miyamoto Musashi" },
  { key: "musashi_difficult", school: "samurai", text: "It may seem difficult at first, but everything is difficult at first.", by: "Miyamoto Musashi" },
  { key: "musashi_use", school: "samurai", text: "Do nothing which is of no use.", by: "Miyamoto Musashi" },
];

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** The first words of a quote, enough to tell it from the others. */
function opening(q: Quote): string {
  return norm(q.text).split(" ").slice(0, 6).join(" ");
}

/** Keys of the library lines a text quotes. */
export function quotesIn(text: string): string[] {
  const t = norm(text);
  return QUOTES.filter((q) => t.includes(opening(q))).map((q) => q.key);
}

export function quoteByKey(key: string | null | undefined): Quote | null {
  return QUOTES.find((q) => q.key === key) ?? null;
}

/** "Pain is inevitable. Suffering is optional." Buddhist saying. */
export function quoteLine(q: Quote): string {
  return `"${q.text}" ${q.by}.`;
}

/**
 * One line from the first school in `schools` that still has a line not used
 * this week. `turn` moves through a school's lines so two asks in a row do not
 * land on the same one. Null when every line in those schools was used.
 */
export function pickQuote(schools: readonly QuoteSchool[], used: readonly string[], turn = 0): Quote | null {
  const taken = new Set(used);
  for (const school of schools) {
    const free = QUOTES.filter((q) => q.school === school && !taken.has(q.key));
    if (free.length > 0) return free[Math.abs(turn) % free.length];
  }
  return null;
}
