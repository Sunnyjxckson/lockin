// The browser's door to Supabase. One POST per data call:
//   { op, table, args }  ->  { data } or { error }
// The service role key stays on the server and every call needs the passcode
// cookie, so the database is never open to the public anon key.

import { requireAuth, serverPasscode } from "@/lib/auth/server";
import { DB_OPS, type DbOp, type DbRequest } from "@/lib/db/remote";
import { SERVER_ONLY_TABLES, TABLE_NAMES, type TableName } from "@/lib/types";

export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return bad("Supabase is not configured. Data lives on the device.", 404);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return bad("Set SUPABASE_SERVICE_ROLE_KEY on the server.", 503);
  // Without a server passcode this route would be open to anyone with the URL.
  if (!serverPasscode()) return bad("Set LOCKIN_PASSCODE on the server before using Supabase.", 503);
  const denied = await requireAuth();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as Partial<DbRequest> | null;
  if (!body || typeof body.op !== "string" || typeof body.table !== "string" || !Array.isArray(body.args)) {
    return bad("Bad request.");
  }
  const op = body.op as DbOp;
  const table = body.table as TableName;
  if (!DB_OPS.includes(op)) return bad("Unknown operation.");
  if (!(TABLE_NAMES as readonly string[]).includes(table)) return bad("Unknown table.");
  if (SERVER_ONLY_TABLES.includes(table)) return bad("That table is server only.", 403);

  try {
    const { SupabaseBackend, serverSupabase } = await import("@/lib/db/supabase");
    const backend = new SupabaseBackend(serverSupabase());
    const run = backend[op] as (table: TableName, ...args: unknown[]) => Promise<unknown>;
    const data = await run.call(backend, table, ...body.args);
    return Response.json({ data: data ?? null });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Database error.", 500);
  }
}
