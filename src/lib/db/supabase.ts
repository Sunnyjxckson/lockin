// Supabase backend. Server only: it uses the service role key, which must
// never reach the browser. The browser talks to it through /api/db (remote.ts).
// Kept thin: each method is one PostgREST call.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NewRow, Row, TableName } from "../types";
import { DbError, type Backend, type Query } from "./types";

function fail(table: string, op: string, error: { message: string }): never {
  throw new DbError(`${op} ${table} failed: ${error.message}`, error);
}

export class SupabaseBackend implements Backend {
  readonly name = "supabase" as const;

  constructor(private client: SupabaseClient) {}

  async list<K extends TableName>(table: K, query: Query<K> = {}): Promise<Row<K>[]> {
    let q = this.client.from(table).select("*");
    for (const [k, v] of Object.entries(query.eq ?? {})) {
      if (v === undefined) continue;
      q = v === null ? q.is(k, null) : q.eq(k, v as string | number | boolean);
    }
    const field = query.dateField ?? "date";
    if (query.from !== undefined) q = q.gte(field, query.from);
    if (query.to !== undefined) q = q.lte(field, query.to);
    if (query.orderBy) q = q.order(query.orderBy, { ascending: query.ascending !== false });
    else q = q.order("created_at", { ascending: true });
    if (query.limit !== undefined) q = q.limit(query.limit);
    const { data, error } = await q;
    if (error) fail(table, "list", error);
    return (data ?? []) as Row<K>[];
  }

  async get<K extends TableName>(table: K, id: string): Promise<Row<K> | null> {
    const { data, error } = await this.client.from(table).select("*").eq("id", id).maybeSingle();
    if (error) fail(table, "get", error);
    return (data as Row<K> | null) ?? null;
  }

  async insert<K extends TableName>(table: K, row: NewRow<K>): Promise<Row<K>> {
    const { data, error } = await this.client.from(table).insert(row).select("*").single();
    if (error) fail(table, "insert", error);
    return data as Row<K>;
  }

  async insertMany<K extends TableName>(table: K, rows: NewRow<K>[]): Promise<Row<K>[]> {
    if (rows.length === 0) return [];
    const { data, error } = await this.client.from(table).insert(rows).select("*");
    if (error) fail(table, "insertMany", error);
    return (data ?? []) as Row<K>[];
  }

  async update<K extends TableName>(table: K, id: string, patch: Partial<Row<K>>): Promise<Row<K>> {
    const clean: Record<string, unknown> = { ...patch };
    delete clean.id;
    delete clean.created_at;
    const { data, error } = await this.client.from(table).update(clean).eq("id", id).select("*").single();
    if (error) fail(table, "update", error);
    return data as Row<K>;
  }

  async upsert<K extends TableName>(table: K, row: NewRow<K>, conflict: (keyof Row<K> & string)[]): Promise<Row<K>> {
    if (conflict.length === 0) throw new DbError("upsert needs at least one conflict column");
    // The conflict columns need a unique index (see the migration). When the
    // conflict is not on id, id and created_at are left out so an update
    // keeps the existing ones and an insert takes the column defaults.
    const clean: Record<string, unknown> = { ...row };
    if (!conflict.includes("id" as keyof Row<K> & string)) {
      delete clean.id;
      delete clean.created_at;
    }
    const { data, error } = await this.client
      .from(table)
      .upsert(clean, { onConflict: conflict.join(",") })
      .select("*")
      .single();
    if (error) fail(table, "upsert", error);
    return data as Row<K>;
  }

  async remove<K extends TableName>(table: K, id: string): Promise<void> {
    const { error } = await this.client.from(table).delete().eq("id", id);
    if (error) fail(table, "remove", error);
  }

  async removeWhere<K extends TableName>(table: K, eq: Partial<Row<K>>): Promise<number> {
    const entries = Object.entries(eq).filter(([, v]) => v !== undefined);
    if (entries.length === 0) throw new DbError("removeWhere needs at least one column to match");
    let q = this.client.from(table).delete();
    for (const [k, v] of entries) q = v === null ? q.is(k, null) : q.eq(k, v as string | number | boolean);
    const { data, error } = await q.select("id");
    if (error) fail(table, "removeWhere", error);
    return (data ?? []).length;
  }
}

export function supabaseConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

let client: SupabaseClient | null = null;

/** The server side Supabase client. Throws when the env is not set. */
export function serverSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new DbError("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
