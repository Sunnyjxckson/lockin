import type { DateStr, NewRow, Row, TableName } from "../types";

/** Filters for list(). Everything is optional. */
export interface Query<K extends TableName> {
  /** Equality on any columns: { date: "2026-10-05", item_id: "..." }. */
  eq?: Partial<Row<K>>;
  /** Inclusive calendar date range on `dateField`. */
  from?: DateStr;
  to?: DateStr;
  /** Column the range applies to. Defaults to "date". */
  dateField?: keyof Row<K> & string;
  orderBy?: keyof Row<K> & string;
  /** Defaults to true. */
  ascending?: boolean;
  limit?: number;
}

/** The one interface both backends implement. */
export interface Backend {
  readonly name: "local" | "memory" | "supabase" | "remote";
  list<K extends TableName>(table: K, query?: Query<K>): Promise<Row<K>[]>;
  get<K extends TableName>(table: K, id: string): Promise<Row<K> | null>;
  insert<K extends TableName>(table: K, row: NewRow<K>): Promise<Row<K>>;
  insertMany<K extends TableName>(table: K, rows: NewRow<K>[]): Promise<Row<K>[]>;
  update<K extends TableName>(table: K, id: string, patch: Partial<Row<K>>): Promise<Row<K>>;
  /**
   * Insert, or update the row whose `conflict` columns all match.
   * On an update the existing id and created_at are kept.
   */
  upsert<K extends TableName>(table: K, row: NewRow<K>, conflict: (keyof Row<K> & string)[]): Promise<Row<K>>;
  remove<K extends TableName>(table: K, id: string): Promise<void>;
  /** Delete every row matching the equality filter. Returns how many went. */
  removeWhere<K extends TableName>(table: K, eq: Partial<Row<K>>): Promise<number>;
}

export class DbError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "DbError";
  }
}
