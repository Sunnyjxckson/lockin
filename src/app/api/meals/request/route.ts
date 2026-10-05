// "More chicken, no fish, cheaper breakfasts": turn a plain request into
// planner inputs. The model only picks from the words the library knows
// (sent by the client, since local mode has no data on the server) and a few
// fixed options. It never writes a plan or a number on a recipe: the
// deterministic planner does all of that from what comes back, after the
// client runs it through cleanRequest.
//
// Without ANTHROPIC_API_KEY this answers the shared fallback and the client
// reads the request with its own rules.

import { aiFallback, anthropicClient, anthropicModel } from "@/lib/ai/server";
import { requireAuth } from "@/lib/auth/server";
import { cleanLine } from "@/lib/logic/text";

const SYSTEM = [
  "You turn a short request about a week of meals into settings for a meal planner.",
  "Only use food words from the list you are given. If the request names a food that is not on the list, leave it out of boost and avoid and put it in unknown.",
  "boost: foods the person wants more of. avoid: foods to leave out completely.",
  "cheaper_slots: meals the person wants made cheaper. If they ask for a cheaper week in general, list all four.",
  "budget: a weekly dollar amount, only if they state one. variety: only if they ask for more or less repetition.",
  "Do not plan meals. Do not invent recipes. Never use an em dash or an en dash.",
].join(" ");

const TOOL = {
  name: "set_plan_inputs",
  description: "Set what the meal planner should lean toward, leave out, and economize on.",
  input_schema: {
    type: "object" as const,
    properties: {
      boost: { type: "array", items: { type: "string" }, description: "Food words from the list to lean toward." },
      avoid: { type: "array", items: { type: "string" }, description: "Food words from the list to leave out." },
      cheaper_slots: { type: "array", items: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] } },
      budget: { type: ["number", "null"], description: "Weekly budget in dollars, or null." },
      variety: { type: ["string", "null"], enum: ["batch", "balanced", "varied", null] },
      unknown: { type: "array", items: { type: "string" }, description: "Foods the person named that are not on the list." },
    },
    required: ["boost", "avoid", "cheaper_slots"],
  },
};

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const client = anthropicClient({ timeout: 20_000 });
  if (!client) return aiFallback("no_key");

  const body = (await request.json().catch(() => null)) as { text?: unknown; words?: unknown } | null;
  const text = cleanLine(body?.text, 400);
  if (!text) return aiFallback("empty");
  const words = Array.isArray(body?.words) ? body.words.filter((w): w is string => typeof w === "string").slice(0, 300).map((w) => cleanLine(w, 40)) : [];

  try {
    const message = await client.messages.create({
      model: anthropicModel(),
      max_tokens: 400,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: `Food words the library knows: ${words.join(", ")}\n\nRequest: ${text}` }],
    });
    const call = message.content.find((b) => b.type === "tool_use");
    if (!call || call.type !== "tool_use") return aiFallback("no_read");
    const input = call.input as Record<string, unknown>;
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 12).map((x) => cleanLine(x, 40)) : []);
    return Response.json({
      source: "ai",
      request: {
        boost: list(input.boost),
        avoid: list(input.avoid),
        cheaper_slots: list(input.cheaper_slots),
        budget: typeof input.budget === "number" ? input.budget : null,
        variety: typeof input.variety === "string" ? input.variety : null,
        unknown: list(input.unknown),
      },
    });
  } catch {
    return aiFallback("error");
  }
}
