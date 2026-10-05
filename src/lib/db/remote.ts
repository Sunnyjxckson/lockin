// Browser backend used when Supabase is on. Every call is one POST to
// /api/db, which checks the passcode cookie and runs the same method on the
// server side Supabase backend.

import type { NewRow, Row, TableName } from "../types";
import { DbError, type Backend, type Query } from "./types";

export type DbOp = "list" | "get" | "insert" | "insertMany" | "update" | "upsert" | "remove" | "removeWhere";

export const DB_OPS: readonly DbOp[] = ["list", "get", "insert", "insertMany", "update", "upsert", "remove", "removeWhere"];

export interface DbRequest {
  op: DbOp;
  table: TableName;
  args: unknown[];
}

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export class RemoteBackend implements Backend {
  readonly name = "remote" as const;

  constructor(
    private fetcher: Fetcher = (input, init) => fetch(input, init),
    private url = "/api/db",
  ) {}

  private async call<T>(op: DbOp, table: TableName, ...args: unknown[]): Promise<T> {
    const body: DbRequest = { op, table, args };
    let res: Response;
    try {
      res = await this.fetcher(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new DbError("Could not reach the server.", e);
    }
    const json = (await res.json().catch(() => null)) as { data?: T; error?: string } | null;
    if (!res.ok || !json) throw new DbError(json?.error ?? `${op} ${table} failed (${res.status})`);
    return json.data as T;
  }

  list<K extends TableName>(table: K, query?: Query<K>) {
    return this.call<Row<K>[]>("list", table, query ?? {});
  }
  get<K extends TableName>(table: K, id: string) {
    return this.call<Row<K> | null>("get", table, id);
  }
  insert<K extends TableName>(table: K, row: NewRow<K>) {
    return this.call<Row<K>>("insert", table, row);
  }
  insertMany<K extends TableName>(table: K, rows: NewRow<K>[]) {
    return this.call<Row<K>[]>("insertMany", table, rows);
  }
  update<K extends TableName>(table: K, id: string, patch: Partial<Row<K>>) {
    return this.call<Row<K>>("update", table, id, patch);
  }
  upsert<K extends TableName>(table: K, row: NewRow<K>, conflict: (keyof Row<K> & string)[]) {
    return this.call<Row<K>>("upsert", table, row, conflict);
  }
  async remove<K extends TableName>(table: K, id: string) {
    await this.call<null>("remove", table, id);
  }
  removeWhere<K extends TableName>(table: K, eq: Partial<Row<K>>) {
    return this.call<number>("removeWhere", table, eq);
  }
}
