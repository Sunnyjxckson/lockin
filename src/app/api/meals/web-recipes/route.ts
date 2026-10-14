// "Find recipes online": the model searches the web for real recipes that fit
// what the person likes, dislikes, can spend and can cook, and sends them back
// as plain ingredient lists. It never gives a number we use. Calories, macros
// and cost are worked out here from the food table (logic/mealsWeb), and a
// recipe whose calories mostly cannot be worked out is dropped.
//
// The client sends its own likes, dislikes, targets and food names, since local
// mode keeps the data in the browser. Without ANTHROPIC_API_KEY this answers
// the shared fallback and the screen says web search needs the key.

import type Anthropic from "@anthropic-ai/sdk";
import { aiFallback, anthropicClient, anthropicModel } from "@/lib/ai/server";
import { requireAuth } from "@/lib/auth/server";
import { indexFoods, SLOTS } from "@/lib/logic/meals";
import { FOODS } from "@/lib/logic/mealsFoods";
import { cleanLine } from "@/lib/logic/text";
import { cleanWebRecipes, extractJson } from "@/lib/logic/mealsWeb";
import type { MealSlot } from "@/lib/types";

export const maxDuration = 120;

const INDEX = indexFoods(FOODS);

const SYSTEM = [
  "You find real recipes on the web for a person who cooks on a budget and tracks calories and protein.",
  "Search for recipes on real recipe sites. Every recipe must come from a page you actually found, and source_url must be that page's address.",
  "Match the person's likes, leave out anything with their dislikes, and fit the cooking time and the budget.",
  "Describe each recipe with a list of ingredients for the whole batch, each with a quantity and a unit (g, oz, lb, ml, tsp, tbsp, cup or each).",
  "For each ingredient, use the exact name from the food list when one fits, such as chicken breast or white rice. Only use another name when nothing on the list is close.",
  "Write the steps in your own short words. Do not copy the page's text. Four to eight steps.",
  "Do not give calories, macros or prices. They are worked out elsewhere.",
  "When you have enough, answer with only a JSON array and nothing else. Each item: name, slot (breakfast, lunch, dinner or snack), servings, minutes (total time, a number), source_url, source_name (the site), ingredients [{name, quantity, unit}], steps [string].",
  "Never use an em dash or an en dash.",
].join(" ");

function strings(v: unknown, max: number, each: number): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max).map((x) => cleanLine(x, each)).filter(Boolean) : [];
}

function positive(v: unknown, max: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(v, max) : null;
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const client = anthropicClient({ timeout: 100_000 });
  if (!client) return aiFallback("no_key");

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Send the request as JSON." }, { status: 400 });

  const likes = strings(body.likes, 30, 40);
  const dislikes = strings(body.dislikes, 30, 40);
  const slots = strings(body.slots, 4, 20).filter((s): s is MealSlot => (SLOTS as readonly string[]).includes(s));
  const calories = positive(body.calories, 6000);
  const protein = positive(body.protein, 500);
  const budget = positive(body.budget, 5000);
  const cookMinutes = positive(body.cook_minutes, 600);
  const count = Math.round(positive(body.count, 10) ?? 6);
  const known = strings(body.foods, 300, 40);
  const foods = known.length > 0 ? known : FOODS.map((f) => f.name);
  const knownNames = strings(body.known_names, 400, 80);
  const knownUrls = strings(body.known_urls, 400, 300);

  const ask = [
    `Find ${count + 3} real recipes.`,
    slots.length > 0 ? `Meals wanted: ${slots.join(", ")}.` : "Meals wanted: a mix of breakfast, lunch and dinner.",
    likes.length > 0 ? `Likes: ${likes.join(", ")}.` : "",
    dislikes.length > 0 ? `Dislikes, leave these out completely: ${dislikes.join(", ")}.` : "",
    calories ? `Daily target: about ${Math.round(calories)} calories${protein ? ` and ${Math.round(protein)} g protein` : ""}, so a main meal should be roughly a third of that per serving.` : "",
    budget ? `Weekly food budget: $${Math.round(budget)} for one person, so favor cheap everyday ingredients.` : "",
    cookMinutes ? `Cooking time: ${Math.round(cookMinutes)} minutes or less.` : "",
    `Food list: ${foods.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const tools: Anthropic.Messages.ToolUnion[] = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
    const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: ask }];
    let answer = "";
    // A long search can pause the turn. Hand it back up to three times.
    for (let turn = 0; turn < 4; turn += 1) {
      const message = await client.messages.create({ model: anthropicModel(), max_tokens: 8000, system: SYSTEM, tools, messages });
      if (message.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: message.content });
        continue;
      }
      if (message.stop_reason === "refusal") return aiFallback("refused");
      answer = message.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      break;
    }
    if (!answer.trim()) return aiFallback("no_read");
    const recipes = cleanWebRecipes(extractJson(answer), INDEX, { likes, dislikes, knownNames, knownUrls, maxMinutes: cookMinutes, max: count });
    if (recipes.length === 0) return aiFallback("empty");
    return Response.json({ source: "ai", recipes });
  } catch {
    return aiFallback("error");
  }
}
