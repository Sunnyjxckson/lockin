// The data layer. Every read and write in the app goes through `db`.
//
// Backends
// - Browser, NEXT_PUBLIC_SUPABASE_URL unset: localStorage.
// - Browser, NEXT_PUBLIC_SUPABASE_URL set: /api/db, which runs Supabase on the
//   server behind the passcode cookie.
// - Server, Supabase configured: Supabase with the service role key.
// - Server, no Supabase: an empty in-memory store. The data lives in the
//   browser in that mode, so API routes must be sent what they need.
//
// Writes notify subscribers of the table, which is what keeps the hooks live.

import type { NewRow, Row, TableName } from "../types";
import { LocalBackend, memoryStore, STORAGE_PREFIX } from "./local";
import { RemoteBackend } from "./remote";
import type { Backend, Query } from "./types";

export type { Backend, Query } from "./types";
export { DbError, isUniqueViolation } from "./types";

// ---------- subscribe / notify ----------

type Listener = () => void;
const listeners = new Map<TableName, Set<Listener>>();
const anyListeners = new Set<(table: TableName) => void>();

/** Call `fn` after any write to `table`. Returns the unsubscribe function. */
export function subscribe(table: TableName, fn: Listener): () => void {
  let set = listeners.get(table);
  if (!set) listeners.set(table, (set = new Set()));
  set.add(fn);
  return () => void set.delete(fn);
}

/** Call `fn` after a write to any table. */
export function subscribeAll(fn: (table: TableName) => void): () => void {
  anyListeners.add(fn);
  return () => void anyListeners.delete(fn);
}

/** Tell subscribers a table changed. Writes through `db` do this for you. */
export function notify(table: TableName): void {
  for (const fn of Array.from(listeners.get(table) ?? [])) fn();
  for (const fn of Array.from(anyListeners)) fn(table);
}

// ---------- backend selection ----------

let backend: Promise<Backend> | null = null;

export function isSupabaseMode(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL;
}

async function pickBackend(): Promise<Backend> {
  if (typeof window === "undefined") {
    if (isSupabaseMode()) {
      const { SupabaseBackend, serverSupabase } = await import("./supabase");
      return new SupabaseBackend(serverSupabase());
    }
    return new LocalBackend(memoryStore(), "memory");
  }
  if (isSupabaseMode()) return new RemoteBackend();
  const local = new LocalBackend(window.localStorage, "local");
  // Another tab wrote: drop the parsed copy and refresh anything on screen.
  window.addEventListener("storage", (e) => {
    if (e.key === null) {
      local.invalidate();
      return;
    }
    if (!e.key.startsWith(STORAGE_PREFIX)) return;
    const table = e.key.slice(STORAGE_PREFIX.length) as TableName;
    local.invalidate(table);
    notify(table);
  });
  return local;
}

function current(): Promise<Backend> {
  if (!backend) backend = pickBackend();
  return backend;
}

/** Swap the backend. For tests. Pass null to go back to the default. */
export function setBackend(b: Backend | null): void {
  backend = b ? Promise.resolve(b) : null;
}

// ---------- the interface ----------

export const db = {
  /** "local", "remote", "supabase" or "memory". */
  async backendName(): Promise<Backend["name"]> {
    return (await current()).name;
  },

  async list<K extends TableName>(table: K, query?: Query<K>): Promise<Row<K>[]> {
    return (await current()).list(table, query);
  },

  async get<K extends TableName>(table: K, id: string): Promise<Row<K> | null> {
    return (await current()).get(table, id);
  },

  /** First row matching the query, or null. */
  async first<K extends TableName>(table: K, query?: Query<K>): Promise<Row<K> | null> {
    const rows = await (await current()).list(table, { ...query, limit: 1 });
    return rows[0] ?? null;
  },

  async insert<K extends TableName>(table: K, row: NewRow<K>): Promise<Row<K>> {
    const made = await (await current()).insert(table, row);
    notify(table);
    return made;
  },

  async insertMany<K extends TableName>(table: K, rows: NewRow<K>[]): Promise<Row<K>[]> {
    if (rows.length === 0) return [];
    const made = await (await current()).insertMany(table, rows);
    notify(table);
    return made;
  },

  async update<K extends TableName>(table: K, id: string, patch: Partial<Row<K>>): Promise<Row<K>> {
    const row = await (await current()).update(table, id, patch);
    notify(table);
    return row;
  },

  /** Insert, or update the row whose `conflict` columns all match. */
  async upsert<K extends TableName>(table: K, row: NewRow<K>, conflict: (keyof Row<K> & string)[]): Promise<Row<K>> {
    const out = await (await current()).upsert(table, row, conflict);
    notify(table);
    return out;
  },

  async remove<K extends TableName>(table: K, id: string): Promise<void> {
    await (await current()).remove(table, id);
    notify(table);
  },

  async removeWhere<K extends TableName>(table: K, eq: Partial<Row<K>>): Promise<number> {
    const n = await (await current()).removeWhere(table, eq);
    if (n > 0) notify(table);
    return n;
  },
};

export type Db = typeof db;
