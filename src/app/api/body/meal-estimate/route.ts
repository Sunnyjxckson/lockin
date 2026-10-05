// Reads a meal photo and returns an estimate of its calories and macros.
// POST { image: "data:image/jpeg;base64,..." }
// 200 { source: "ai", estimate: { name, calories, protein, carbs, fat, note } }
// 200 { source: "fallback", reason } when ANTHROPIC_API_KEY is unset or the
// read fails. The client then opens the form empty with the photo attached.

import type Anthropic from "@anthropic-ai/sdk";
import { aiFallback, anthropicClient, anthropicModel, readImageDataUrl } from "@/lib/ai/server";
import { requireAuth } from "@/lib/auth/server";
import { cleanLine } from "@/lib/logic/text";

export const dynamic = "force-dynamic";
export const maxDuration = 60;


const SYSTEM = [
  "You estimate the nutrition of a meal from one photo for a personal food log.",
  "Judge portion sizes from the plate, utensils and packaging you can see. Give one best estimate for the whole meal as pictured, not a range.",
  "Name the meal in plain words, six words or fewer, for example: Chicken, rice and broccoli.",
  "Never use an em dash or an en dash anywhere. Use a comma or the word to.",
  "If the photo does not show food, set every number to 0 and say so in the note.",
  "Always answer by calling the log_meal tool.",
].join(" ");

const TOOL: Anthropic.Tool = {
  name: "log_meal",
  description: "Record the estimated nutrition for the meal in the photo.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short plain name of the meal." },
      calories: { type: "number", description: "Total kilocalories." },
      protein: { type: "number", description: "Protein in grams." },
      carbs: { type: "number", description: "Carbohydrate in grams." },
      fat: { type: "number", description: "Fat in grams." },
      note: { type: "string", description: "One short sentence on what the estimate assumes. No dashes." },
    },
    required: ["name", "calories", "protein", "carbs", "fat"],
  },
};

function amount(n: unknown, max: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(max, Math.round(v));
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const client = anthropicClient();
  if (!client) return aiFallback("no_key");

  const body = (await request.json().catch(() => null)) as { image?: unknown } | null;
  const img = readImageDataUrl(body?.image);
  if ("error" in img) return img.error;

  try {
    const message = await client.messages.create({
      model: anthropicModel(),
      max_tokens: 400,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } },
            { type: "text", text: "Estimate this meal." },
          ],
        },
      ],
    });
    const call = message.content.find((b) => b.type === "tool_use");
    if (!call || call.type !== "tool_use") return aiFallback("no_read");
    const input = call.input as Record<string, unknown>;
    return Response.json({
      source: "ai",
      estimate: {
        name: cleanLine(input.name, 80),
        calories: amount(input.calories, 5000),
        protein: amount(input.protein, 500),
        carbs: amount(input.carbs, 800),
        fat: amount(input.fat, 400),
        note: cleanLine(input.note, 160),
      },
    });
  } catch (e) {
    console.error("meal-estimate failed", e instanceof Error ? e.message : e);
    return aiFallback("error");
  }
}
