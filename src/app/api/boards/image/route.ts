// Fetches an image from the web for a mood board. The browser cannot read
// another site's image into a canvas (CORS), so it asks this route, which
// returns the bytes and the browser stores them like any other photo.
//
// POST { url } answers the image itself, or JSON { error, problem } with 400
// when the link is refused and 502 when the other site did not deliver.
// A link to a page works too: the page's own share image is used.

import { requireAuth } from "@/lib/auth/server";
import { FETCH_MESSAGE, type FetchProblem } from "@/lib/logic/boardsFetch";
import { fetchWebImage } from "./fetcher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const REFUSED: readonly FetchProblem[] = ["bad_url", "bad_scheme", "has_credentials", "bad_port", "private_address"];

function problem(p: FetchProblem): Response {
  return Response.json({ error: FETCH_MESSAGE[p], problem: p }, { status: REFUSED.includes(p) ? 400 : 502 });
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const result = await fetchWebImage(body?.url);
  if (!result.ok) return problem(result.problem);

  return new Response(result.bytes as BodyInit, {
    status: 200,
    headers: {
      "content-type": result.type,
      "content-length": String(result.bytes.byteLength),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-disposition": "attachment",
      "x-image-source": encodeURI(result.url).slice(0, 2048),
    },
  });
}
