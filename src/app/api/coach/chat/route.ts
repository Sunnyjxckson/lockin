// The coach answers a message.
//
// POST { context, turns, voice, used, library? }
// Answers { body, source: "ai" | "fallback", quote, mode?, notes?, reason? }.
//
// The browser sends everything (in local mode the server has no data): the
// snapshot and where today stands (`context`), the conversation so far ending
// with their message (`turns`), the voice, and the quote keys used this week.
// - With ANTHROPIC_API_KEY, Claude writes the reply. It is stripped of dashes
//   and checked: a number that is not in the data, a quote that is not in the
//   library or one already used this week gets one correction round. If it
//   still fails, the rule-based reply is used.
// - Without a key, or when the call fails, the rule-based reply comes back
//   with source "fallback". Never an error for a valid request.
// - `library` is a few lines from the Library the browser picked for what the
//   message is about ({ key, text, by }). They go into the prompt next to the
//   coach's own lines, and a quoted line has to be word for word from one or
//   the other. A careful reply (more than a bad day) never gets any.
// - Injury and emergency messages get the fixed line, with or without a key.
//   So does the question "are you a therapist".
// - `mode` is which one the message needed: "push", "support" or "unclear".
//   Unclear is never sent to the model: the answer is the question "you want
//   a push or you want to talk?" (source "fallback", reason "ask").
// - `context` may also carry `profile`, `commitments`, `moods`, `recurring` and
//   `now.block`. `turns` may carry a `trigger` on a coach turn. All optional.
// - `notes` (0 to 2 { kind, body }) are durable things worth keeping about the
//   person, read from their message by a small second call that runs beside
//   the reply. Only with a key, and never for a message that sounds like more
//   than a bad day.

import type Anthropic from "@anthropic-ai/sdk";
import { aiFallback, anthropicClient, anthropicModel, type FallbackReason } from "@/lib/ai/server";
import { requireAuth } from "@/lib/auth/server";
import { cleanCoachText } from "@/lib/logic/coach";
import {
  MAX_MESSAGE,
  MAX_TURNS,
  chatCorrection,
  chatFallback,
  careInPlay,
  chatPrompt,
  cleanContext,
  cleanTurns,
  classifyMessage,
  isChatContext,
  isTurns,
  quotedKey,
  replyProblem,
  voiceOf,
  type ChatContext,
  type ChatTurn,
  type CoachMode,
} from "@/lib/logic/coachChat";
import { extractPrompt, parseNotes, type ProfileNote } from "@/lib/logic/coachProfile";
import { cleanCandidates, isLibKey, type LibCandidate } from "@/lib/logic/coachLibrary";
import { QUOTES } from "@/lib/logic/coachQuotes";
import type { CoachVoice } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY = 300_000;

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

async function writeWithModel(
  client: Anthropic,
  ctx: ChatContext,
  turns: ChatTurn[],
  voice: CoachVoice,
  used: string[],
  library: LibCandidate[],
): Promise<{ body: string; mode: CoachMode } | { reason: FallbackReason }> {
  const prompt = chatPrompt(ctx, turns, voice, used, library);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt.user }];

  for (let attempt = 0; attempt < 2; attempt++) {
    const message = await client.messages.create({ model: anthropicModel(), max_tokens: prompt.maxTokens, system: prompt.system, messages });
    if (message.stop_reason === "refusal") return { reason: "refused" };
    const raw = textOf(message);
    const body = cleanCoachText(raw);
    const problem = replyProblem(body, ctx, turns, used, prompt.care, library, prompt.mode);
    if (!problem) return { body, mode: prompt.mode };
    if (problem.kind === "empty") return { reason: "empty" };
    if (attempt === 1) return { reason: problem.kind === "too_long" ? "too_long" : problem.kind === "numbers" ? "numbers_not_in_data" : "no_read" };
    messages.push({ role: "assistant", content: raw }, { role: "user", content: chatCorrection(problem) });
  }
  return { reason: "no_read" };
}

/** Messages shorter than this have nothing worth keeping, so the second call is not made. */
const MIN_EXTRACT = 25;
const EXTRACT_MS = 8000;

/**
 * Durable notes about the person from what they just said. Runs beside the
 * reply. Any failure, or a slow answer, is no notes: the reply never waits on
 * it for long and never fails because of it.
 */
async function extractNotes(client: Anthropic, message: string, turns: ChatTurn[], ctx: ChatContext): Promise<ProfileNote[]> {
  if (message.trim().length < MIN_EXTRACT) return [];
  const prompt = extractPrompt(message, turns.slice(0, -1), ctx.profile ?? []);
  const call = client.messages
    .create({ model: anthropicModel(), max_tokens: prompt.maxTokens, system: prompt.system, messages: [{ role: "user", content: prompt.user }] })
    .then((m) => (m.stop_reason === "refusal" ? [] : parseNotes(textOf(m))))
    .catch(() => []);
  return Promise.race([call, new Promise<ProfileNote[]>((resolve) => setTimeout(() => resolve([]), EXTRACT_MS))]);
}

interface ChatRequest {
  context?: unknown;
  turns?: unknown;
  voice?: unknown;
  used?: unknown;
  library?: unknown;
}

function readJson(text: string): ChatRequest | null {
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" ? (v as ChatRequest) : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY) return Response.json({ error: "That request is too large." }, { status: 413 });
  const parsed = readJson(text);
  if (!parsed || !isChatContext(parsed.context) || !isTurns(parsed.turns)) {
    return Response.json({ error: "Send { context, turns, voice, used }." }, { status: 400 });
  }
  const ctx = cleanContext(parsed.context);
  const turns = cleanTurns(parsed.turns.slice(-MAX_TURNS).map((t) => ({ ...t, body: t.body.slice(0, MAX_MESSAGE * 2) })));
  const last = turns[turns.length - 1];
  if (last.sender !== "me" || !last.body.trim()) return Response.json({ error: "The last turn has to be their message." }, { status: 400 });
  const voice = voiceOf(parsed.voice);
  const known = new Set(QUOTES.map((q) => q.key));
  const used = Array.isArray(parsed.used) ? parsed.used.filter((k): k is string => typeof k === "string" && (known.has(k) || isLibKey(k))) : [];
  // A conversation that has turned to something heavier gets no Library lines at all, whatever the browser sent.
  const library = careInPlay(turns.slice(-6)) ? [] : cleanCandidates(parsed.library);

  let fallback: ReturnType<typeof chatFallback>;
  try {
    fallback = chatFallback(last.body, ctx, voice, used, library, turns);
  } catch {
    return Response.json({ error: "That context is missing fields." }, { status: 400 });
  }
  const mode = fallback.mode;
  const rules = { body: fallback.body, quote: fallback.quote, ...(mode ? { mode } : {}) };

  // Stop and get it checked is not a matter of wording. It is the same line every time.
  if (fallback.topic === "injury" || fallback.topic === "emergency") return Response.json({ ...rules, source: "fallback", reason: "safety" });
  // So is "I am not a therapist". A real low goes to the careful prompt below, or to its fixed line with no key.
  if (fallback.topic === "therapist") return Response.json({ ...rules, source: "fallback", reason: "safety" });
  // When it cannot tell which one they need, it asks. No model call.
  if (mode === "unclear") return Response.json({ ...rules, source: "fallback", reason: "ask" });

  const client = anthropicClient();
  if (!client) return aiFallback("no_key", rules);

  // A message that sounds like more than a bad day is never mined for the profile.
  const mineable = classifyMessage(last.body) !== "care" && !careInPlay(turns.slice(-6));
  const notesCall = mineable ? extractNotes(client, last.body, turns, ctx) : Promise.resolve<ProfileNote[]>([]);

  try {
    const [result, notes] = await Promise.all([writeWithModel(client, ctx, turns, voice, used, library), notesCall]);
    const extra = notes.length > 0 ? { notes } : {};
    if ("body" in result) return Response.json({ body: result.body, quote: quotedKey(result.body, library), mode: result.mode, ...extra, source: "ai", model: anthropicModel() });
    return aiFallback(result.reason, { ...rules, ...extra });
  } catch (err) {
    console.error("coach chat failed", err instanceof Error ? err.message : err);
    return aiFallback("error", rules);
  }
}
