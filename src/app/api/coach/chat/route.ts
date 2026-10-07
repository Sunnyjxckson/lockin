// The coach answers a message.
//
// POST { context, turns, voice, used }
// Answers { body, source: "ai" | "fallback", quote, reason? }.
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
// - Injury and emergency messages get the fixed line, with or without a key.

import type Anthropic from "@anthropic-ai/sdk";
import { aiFallback, anthropicClient, anthropicModel, type FallbackReason } from "@/lib/ai/server";
import { requireAuth } from "@/lib/auth/server";
import { cleanCoachText } from "@/lib/logic/coach";
import {
  MAX_MESSAGE,
  MAX_TURNS,
  chatCorrection,
  chatFallback,
  chatPrompt,
  isChatContext,
  isTurns,
  replyProblem,
  voiceOf,
  type ChatContext,
  type ChatTurn,
} from "@/lib/logic/coachChat";
import { QUOTES, quotesIn } from "@/lib/logic/coachQuotes";
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

async function writeWithModel(client: Anthropic, ctx: ChatContext, turns: ChatTurn[], voice: CoachVoice, used: string[]): Promise<{ body: string } | { reason: FallbackReason }> {
  const prompt = chatPrompt(ctx, turns, voice, used);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt.user }];

  for (let attempt = 0; attempt < 2; attempt++) {
    const message = await client.messages.create({ model: anthropicModel(), max_tokens: prompt.maxTokens, system: prompt.system, messages });
    if (message.stop_reason === "refusal") return { reason: "refused" };
    const raw = textOf(message);
    const body = cleanCoachText(raw);
    const problem = replyProblem(body, ctx, turns, used, prompt.care);
    if (!problem) return { body };
    if (problem.kind === "empty") return { reason: "empty" };
    if (attempt === 1) return { reason: problem.kind === "too_long" ? "too_long" : problem.kind === "numbers" ? "numbers_not_in_data" : "no_read" };
    messages.push({ role: "assistant", content: raw }, { role: "user", content: chatCorrection(problem) });
  }
  return { reason: "no_read" };
}

interface ChatRequest {
  context?: unknown;
  turns?: unknown;
  voice?: unknown;
  used?: unknown;
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
  const ctx = parsed.context;
  const turns = parsed.turns.slice(-MAX_TURNS).map((t) => ({ sender: t.sender, body: t.body.slice(0, MAX_MESSAGE * 2) }));
  const last = turns[turns.length - 1];
  if (last.sender !== "me" || !last.body.trim()) return Response.json({ error: "The last turn has to be their message." }, { status: 400 });
  const voice = voiceOf(parsed.voice);
  const known = new Set(QUOTES.map((q) => q.key));
  const used = Array.isArray(parsed.used) ? parsed.used.filter((k): k is string => typeof k === "string" && known.has(k)) : [];

  let fallback: ReturnType<typeof chatFallback>;
  try {
    fallback = chatFallback(last.body, ctx, voice, used);
  } catch {
    return Response.json({ error: "That context is missing fields." }, { status: 400 });
  }
  const rules = { body: fallback.body, quote: fallback.quote };

  // Stop and get it checked is not a matter of wording. It is the same line every time.
  if (fallback.topic === "injury" || fallback.topic === "emergency") return Response.json({ ...rules, source: "fallback", reason: "safety" });

  const client = anthropicClient();
  if (!client) return aiFallback("no_key", rules);

  try {
    const result = await writeWithModel(client, ctx, turns, voice, used);
    if ("body" in result) return Response.json({ body: result.body, quote: quotesIn(result.body)[0] ?? null, source: "ai", model: anthropicModel() });
    return aiFallback(result.reason, rules);
  } catch (err) {
    console.error("coach chat failed", err instanceof Error ? err.message : err);
    return aiFallback("error", rules);
  }
}
