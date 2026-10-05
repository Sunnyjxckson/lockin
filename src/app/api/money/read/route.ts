// Reads an earnings screenshot. The browser sends the image as a data URL
// and gets back { source: "ai", amount, app, hours } to prefill the quick add
// form. With no ANTHROPIC_API_KEY, or when the read fails, it answers
// { source: "fallback" } and the form opens empty.

import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "@/lib/auth/server";
import { parseEarningRead } from "@/lib/logic/money";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MODEL = "claude-sonnet-5-5";
const MAX_BASE64 = 7_000_000;
const MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type Media = (typeof MEDIA)[number];

const PROMPT = [
  "This is a screenshot from a delivery driver app showing earnings.",
  "Read it and call record_earning once.",
  "amount: the total earned shown for the shift, dash, trip set or day, in dollars, tips included. If several totals show, use the one for the single shift or day, not a weekly or lifetime total.",
  "app: which app the screen is from. One of DoorDash, Uber Eats, Instacart. Use null if you cannot tell.",
  "hours: time worked as decimal hours, for example 2 hr 30 min is 2.5. Prefer active or dash time when both active and total time show. Use null if no time is shown.",
  "Use null for anything that is not on the screen. Do not guess. Do not use em dashes or en dashes anywhere.",
].join("\n");

const TOOL: Anthropic.Tool = {
  name: "record_earning",
  description: "Record the earnings read from the screenshot.",
  input_schema: {
    type: "object",
    properties: {
      amount: { type: ["number", "null"], description: "Total earned in dollars." },
      app: { type: ["string", "null"], enum: ["DoorDash", "Uber Eats", "Instacart", null] },
      hours: { type: ["number", "null"], description: "Time worked in decimal hours." },
    },
    required: ["amount", "app", "hours"],
  },
};

function fallback(reason: string) {
  return Response.json({ source: "fallback", reason });
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return fallback("no_key");

  const body = (await request.json().catch(() => null)) as { image?: unknown } | null;
  const image = typeof body?.image === "string" ? body.image : "";
  const match = /^data:([a-z/+.-]+);base64,(.+)$/i.exec(image);
  if (!match) return Response.json({ error: "Send the screenshot as a data URL in image." }, { status: 400 });
  const media = match[1].toLowerCase() as Media;
  const data = match[2];
  if (!MEDIA.includes(media)) return Response.json({ error: "That image type cannot be read." }, { status: 400 });
  if (data.length > MAX_BASE64) return Response.json({ error: "Screenshot is too large." }, { status: 413 });

  try {
    const client = new Anthropic({ apiKey: key });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: media, data } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });
    const use = message.content.find((b) => b.type === "tool_use");
    if (!use || use.type !== "tool_use") return fallback("no_read");
    const read = parseEarningRead(use.input);
    if (read.amount === null && read.app === null && read.hours === null) return fallback("no_read");
    return Response.json({ source: "ai", ...read });
  } catch (err) {
    console.error("money/read failed", err instanceof Error ? err.message : err);
    return fallback("error");
  }
}
