// Push a grocery list to Instacart.
//
// This uses the Instacart Developer Platform "create shopping list page"
// endpoint (POST /idp/v1/products/products_link), which takes a title and
// line items and answers with a link to a shoppable list on Instacart. The
// user picks a store and checks out there. It needs an API key from
// https://www.instacart.com/company/business/developers
//
//   INSTACART_API_KEY   the key. Without it this route answers
//                       { source: "fallback", reason: "no_key" } and the
//                       screen offers copy and share instead.
//   INSTACART_API_URL   optional. Defaults to production. A development key
//                       needs https://connect.dev.instacart.tools
//
// Local mode has no data on the server, so the client sends the list.

import { requireAuth } from "@/lib/auth/server";

const PRODUCTION = "https://connect.instacart.com";
const PATH = "/idp/v1/products/products_link";

function key(): string | null {
  const k = process.env.INSTACART_API_KEY?.trim();
  return k && k.length > 0 ? k : null;
}

/** Is Instacart set up? The screen asks before showing the button. */
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  return Response.json({ connected: key() !== null });
}

interface Item {
  name: string;
  quantity: number;
  unit: string;
  display_text?: string;
}

function readItems(raw: unknown): Item[] {
  if (!Array.isArray(raw)) return [];
  const out: Item[] = [];
  for (const r of raw.slice(0, 200)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 120) : "";
    const quantity = typeof o.quantity === "number" && Number.isFinite(o.quantity) && o.quantity > 0 ? o.quantity : 1;
    const unit = typeof o.unit === "string" && o.unit.trim() ? o.unit.trim().slice(0, 24) : "each";
    if (!name) continue;
    out.push({ name, quantity, unit, ...(typeof o.display_text === "string" ? { display_text: o.display_text.slice(0, 160) } : {}) });
  }
  return out;
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const apiKey = key();
  if (!apiKey) return Response.json({ source: "fallback", reason: "no_key" });

  const body = (await request.json().catch(() => null)) as { title?: unknown; items?: unknown; linkback?: unknown } | null;
  const items = readItems(body?.items);
  if (items.length === 0) return Response.json({ error: "Send the list in items." }, { status: 400 });
  const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : "Groceries";
  const linkback = typeof body?.linkback === "string" && /^https:\/\//.test(body.linkback) ? body.linkback : null;

  const base = (process.env.INSTACART_API_URL?.trim() || PRODUCTION).replace(/\/+$/, "");
  try {
    const res = await fetch(base + PATH, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        title,
        link_type: "shopping_list",
        expires_in: 14,
        line_items: items,
        ...(linkback ? { landing_page_configuration: { partner_linkback_url: linkback } } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => null)) as { products_link_url?: unknown } | null;
    const url = typeof json?.products_link_url === "string" ? json.products_link_url : null;
    if (!res.ok || !url) return Response.json({ source: "fallback", reason: "error", status: res.status });
    return Response.json({ source: "instacart", url });
  } catch {
    return Response.json({ source: "fallback", reason: "error" });
  }
}
