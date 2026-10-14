// Eat out, local spots: one or two places near the person with an order that
// fits what is left of the day. The model searches the web and every number
// it gives is an estimate, flagged so. The chain orders on the screen never
// depend on this route.
//
// Without ANTHROPIC_API_KEY this answers the shared fallback and the screen
// shows only the chain options.

import { aiFallback, anthropicClient, anthropicModel } from "@/lib/ai/server";
import { requireAuth } from "@/lib/auth/server";
import { cleanLine } from "@/lib/logic/text";

const SYSTEM = [
  "You suggest one or two real places to eat near a location, with an order that fits the calories and protein the person has left.",
  "Use web search to find places that are open and have a menu with a protein heavy order. Prefer local independent spots over big chains.",
  "Estimate calories, protein, carbs and fat for the order from the menu. These are estimates, say so by keeping the numbers rounded.",
  "Answer with only a JSON array and nothing else. Each item: {\"place\": string, \"order\": string, \"calories\": number, \"protein\": number, \"carbs\": number, \"fat\": number, \"price\": number}.",
  "price is your best guess in dollars before tax. Never use an em dash or an en dash. Keep the order to one short plain line.",
].join(" ");

interface Suggestion {
  place: string;
  order: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  price: number;
  estimate: true;
}

function num(v: unknown, max: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 10) / 10 : null;
}

function parseSuggestions(text: string, calMax: number): Suggestion[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: Suggestion[] = [];
  for (const r of raw.slice(0, 2)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const place = cleanLine(o.place, 60);
    const order = cleanLine(o.order, 140);
    const calories = num(o.calories, 3000);
    const protein = num(o.protein, 250);
    const carbs = num(o.carbs, 400);
    const fat = num(o.fat, 250);
    const price = num(o.price, 100);
    if (!place || !order || calories === null || protein === null || carbs === null || fat === null) continue;
    // An order over what is left is not a fit. A little slack for an estimate.
    if (calMax > 0 && calories > calMax * 1.1) continue;
    out.push({ place, order, calories, protein, carbs, fat, price: price ?? 0, estimate: true });
  }
  return out;
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const client = anthropicClient({ timeout: 45_000 });
  if (!client) return aiFallback("no_key");

  const body = (await request.json().catch(() => null)) as { location?: unknown; calMax?: unknown; protein?: unknown; slot?: unknown; dislikes?: unknown } | null;
  const location = cleanLine(body?.location, 80) || "Charlotte, NC";
  const calMax = typeof body?.calMax === "number" && body.calMax > 0 ? Math.min(3000, Math.round(body.calMax)) : 0;
  const protein = typeof body?.protein === "number" && body.protein > 0 ? Math.min(250, Math.round(body.protein)) : 0;
  const slot = cleanLine(body?.slot, 12) || "dinner";
  const dislikes = Array.isArray(body?.dislikes) ? body.dislikes.filter((d): d is string => typeof d === "string").slice(0, 20).map((d) => cleanLine(d, 30)) : [];
  if (calMax <= 0) return aiFallback("empty");

  const ask = [
    `Location: ${location}.`,
    `Meal: ${slot}.`,
    `Calories left: at most ${calMax}.`,
    protein > 0 ? `Protein still needed: about ${protein} grams.` : "",
    dislikes.length > 0 ? `Foods to avoid: ${dislikes.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const message = await client.messages.create({
      model: anthropicModel(),
      max_tokens: 1200,
      system: SYSTEM,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: ask }],
    });
    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n");
    const suggestions = parseSuggestions(text, calMax);
    if (suggestions.length === 0) return aiFallback("no_read");
    return Response.json({ source: "ai", suggestions });
  } catch {
    return aiFallback("error");
  }
}
