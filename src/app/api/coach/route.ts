// Writes a coach note from a snapshot.
//
// POST { kind: "morning" | "weekly", snapshot }
// Answers { body, source: "ai" | "fallback", reason? }.
//
// The browser builds the snapshot (in local mode the server has no data) with
// the pure functions in src/lib/logic/coach.ts, flags included. This route
// only does the wording:
// - With ANTHROPIC_API_KEY, Claude writes it from the snapshot. The reply is
//   stripped of dashes and checked: any number that is not in the snapshot
//   gets one correction round, and if it still fails the rule-based text is
//   used instead.
// - Without a key, or when the call fails, the rule-based text is returned
//   with source "fallback". Never an error for a valid snapshot.

import type Anthropic from "@anthropic-ai/sdk";
import { aiFallback, anthropicClient, anthropicModel, type FallbackReason } from "@/lib/ai/server";
import { requireAuth } from "@/lib/auth/server";
import { cleanCoachText, unknownNumbers, wordCount, type CoachSnapshot } from "@/lib/logic/coach";
import { coachPrompt, correctionPrompt, fallbackFor, isSnapshot, type CoachKind } from "@/lib/logic/coachWrite";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY = 200_000;
/** Hard ceilings, well above what the prompt asks for. Past these the reply is not a brief. */
const MAX_WORDS: Record<CoachKind, number> = { morning: 130, weekly: 220 };

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

async function writeWithModel(client: Anthropic, kind: CoachKind, snapshot: CoachSnapshot): Promise<{ body: string } | { reason: FallbackReason }> {
  const prompt = coachPrompt(kind, snapshot);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt.user }];

  for (let attempt = 0; attempt < 2; attempt++) {
    const message = await client.messages.create({
      model: anthropicModel(),
      max_tokens: prompt.maxTokens,
      system: prompt.system,
      messages,
    });
    if (message.stop_reason === "refusal") return { reason: "refused" };
    const raw = textOf(message);
    const body = cleanCoachText(raw);
    if (!body) return { reason: "empty" };
    if (wordCount(body) > MAX_WORDS[kind]) return { reason: "too_long" };
    const invented = unknownNumbers(body, snapshot);
    if (invented.length === 0) return { body };
    if (attempt === 1) return { reason: "numbers_not_in_data" };
    messages.push({ role: "assistant", content: raw }, { role: "user", content: correctionPrompt(invented) });
  }
  return { reason: "numbers_not_in_data" };
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY) return Response.json({ error: "Snapshot is too large." }, { status: 413 });
  let parsed: { kind?: unknown; snapshot?: unknown } | null = null;
  try {
    parsed = JSON.parse(text) as { kind?: unknown; snapshot?: unknown };
  } catch {
    parsed = null;
  }
  const kind: CoachKind | null = parsed?.kind === "morning" || parsed?.kind === "weekly" ? parsed.kind : null;
  if (!kind || !isSnapshot(parsed?.snapshot)) {
    return Response.json({ error: "Send { kind: \"morning\" or \"weekly\", snapshot }." }, { status: 400 });
  }
  const snapshot = parsed.snapshot;

  let fallback: string;
  try {
    fallback = fallbackFor(kind, snapshot);
  } catch {
    return Response.json({ error: "That snapshot is missing fields." }, { status: 400 });
  }

  // The rule-based text rides along on every fallback, so the screen always has a note.
  const client = anthropicClient();
  if (!client) return aiFallback("no_key", { body: fallback });

  try {
    const result = await writeWithModel(client, kind, snapshot);
    if ("body" in result) return Response.json({ body: result.body, source: "ai", model: anthropicModel() });
    return aiFallback(result.reason, { body: fallback });
  } catch (err) {
    console.error("coach failed", err instanceof Error ? err.message : err);
    return aiFallback("error", { body: fallback });
  }
}
