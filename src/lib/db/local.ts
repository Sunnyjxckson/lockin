// Local backend. One JSON array per table in a key value store. In the
// browser the store is localStorage. Tests and the server pass a memory store.

import type { NewRow, Row, TableName } from "../types";
import { UNIQUE_KEYS } from "./schema";
import { DbError, UNIQUE_VIOLATION, type Backend, type Query } from "./types";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_PREFIX = "lockin:v1:";

export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

type AnyRow = Record<string, unknown> & { id: string; created_at: string };

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : 1;
}

export function matchesEq(row: Record<string, unknown>, eq: Record<string, unknown> | undefined): boolean {
  if (!eq) return true;
  for (const [k, v] of Object.entries(eq)) {
    if (v === undefined) continue;
    if ((row[k] ?? null) !== (v ?? null)) return false;
  }
  return true;
}

/** Apply a Query to rows in memory. Shared by the local and memory backends. */
export function applyQuery<T extends Record<string, unknown>>(rows: T[], q: Query<TableName> | undefined): T[] {
  if (!q) return rows.slice();
  const field = (q.dateField as string | undefined) ?? "date";
  let out = rows.filter((r) => {
    if (!matchesEq(r, q.eq as Record<string, unknown> | undefined)) return false;
    if (q.from !== undefined || q.to !== undefined) {
      const d = r[field];
      if (typeof d !== "string") return false;
      if (q.from !== undefined && d < q.from) return false;
      if (q.to !== undefined && d > q.to) return false;
    }
    return true;
  });
  if (q.orderBy) {
    const key = q.orderBy as string;
    const dir = q.ascending === false ? -1 : 1;
    out = out
      .map((r, i) => ({ r, i }))
      .sort((a, b) => dir * compare(a.r[key], b.r[key]) || a.i - b.i)
      .map((x) => x.r);
  }
  if (q.limit !== undefined) out = out.slice(0, q.limit);
  return out;
}

export class LocalBackend implements Backend {
  readonly name: "local" | "memory";
  private cache = new Map<string, AnyRow[]>();

  constructor(
    private store: KeyValueStore,
    name: "local" | "memory" = "local",
    private now: () => string = () => new Date().toJSON(),
  ) {
    this.name = name;
  }

  /** Forget parsed tables, for example after another tab wrote. */
  invalidate(table?: TableName): void {
    if (table) this.cache.delete(table);
    else this.cache.clear();
  }

  private read(table: TableName): AnyRow[] {
    const hit = this.cache.get(table);
    if (hit) return hit;
    let rows: AnyRow[] = [];
    const raw = this.store.getItem(STORAGE_PREFIX + table);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) rows = parsed as AnyRow[];
      } catch {
        rows = [];
      }
    }
    this.cache.set(table, rows);
    return rows;
  }

  private write(table: TableName, rows: AnyRow[]): void {
    this.cache.set(table, rows);
    try {
      this.store.setItem(STORAGE_PREFIX + table, JSON.stringify(rows));
    } catch (e) {
      this.cache.delete(table);
      throw new DbError(`Could not save ${table}. Storage may be full.`, e);
    }
  }

  private make(row: Record<string, unknown>): AnyRow {
    return { ...clone(row), id: (row.id as string | undefined) ?? newId(), created_at: (row.created_at as string | undefined) ?? this.now() };
  }

  async list<K extends TableName>(table: K, query?: Query<K>): Promise<Row<K>[]> {
    return clone(applyQuery(this.read(table), query as Query<TableName> | undefined)) as unknown as Row<K>[];
  }

  async get<K extends TableName>(table: K, id: string): Promise<Row<K> | null> {
    const row = this.read(table).find((r) => r.id === id);
    return row ? (clone(row) as unknown as Row<K>) : null;
  }

  async insert<K extends TableName>(table: K, row: NewRow<K>): Promise<Row<K>> {
    const [made] = await this.insertMany(table, [row]);
    return made;
  }

  async insertMany<K extends TableName>(table: K, rows: NewRow<K>[]): Promise<Row<K>[]> {
    const current = this.read(table);
    const made = rows.map((r) => this.make(r as Record<string, unknown>));
    const ids = new Set(current.map((r) => r.id));
    for (const m of made) {
      if (ids.has(m.id)) throw new DbError(`${table} already has a row with id ${m.id}`);
      ids.add(m.id);
    }
    // Same rule the unique indexes enforce in Postgres.
    const all = [...current];
    for (const m of made) {
      for (const cols of (UNIQUE_KEYS[table] ?? []) as string[][]) {
        const eq: Record<string, unknown> = {};
        for (const c of cols) eq[c] = m[c] ?? null;
        if (cols.every((c) => m[c] !== null && m[c] !== undefined) && all.some((r) => matchesEq(r, eq))) {
          throw new DbError(`${table} already has a row with the same ${cols.join(", ")}`, { code: UNIQUE_VIOLATION });
        }
      }
      all.push(m);
    }
    this.write(table, [...current, ...made]);
    return clone(made) as unknown as Row<K>[];
  }

  async update<K extends TableName>(table: K, id: string, patch: Partial<Row<K>>): Promise<Row<K>> {
    const current = this.read(table);
    const i = current.findIndex((r) => r.id === id);
    if (i === -1) throw new DbError(`${table} has no row with id ${id}`);
    const next = { ...current[i], ...clone(patch as Record<string, unknown>), id: current[i].id, created_at: current[i].created_at };
    const rows = current.slice();
    rows[i] = next;
    this.write(table, rows);
    return clone(next) as unknown as Row<K>;
  }

  async upsert<K extends TableName>(table: K, row: NewRow<K>, conflict: (keyof Row<K> & string)[]): Promise<Row<K>> {
    if (conflict.length === 0) throw new DbError("upsert needs at least one conflict column");
    const data = row as Record<string, unknown>;
    const eq: Record<string, unknown> = {};
    for (const k of conflict) eq[k] = data[k] ?? null;
    const existing = this.read(table).find((r) => matchesEq(r, eq));
    if (!existing) return this.insert(table, row);
    const patch = { ...data };
    delete patch.id;
    delete patch.created_at;
    return this.update(table, existing.id, patch as Partial<Row<K>>);
  }

  async remove<K extends TableName>(table: K, id: string): Promise<void> {
    const current = this.read(table);
    const rows = current.filter((r) => r.id !== id);
    if (rows.length !== current.length) this.write(table, rows);
  }

  async removeWhere<K extends TableName>(table: K, eq: Partial<Row<K>>): Promise<number> {
    const filter = eq as Record<string, unknown>;
    if (Object.values(filter).every((v) => v === undefined)) {
      throw new DbError("removeWhere needs at least one column to match");
    }
    const current = this.read(table);
    const rows = current.filter((r) => !matchesEq(r, filter));
    if (rows.length !== current.length) this.write(table, rows);
    return current.length - rows.length;
  }
}
