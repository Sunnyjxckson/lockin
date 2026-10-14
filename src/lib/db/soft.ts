// Columns a migration adds that the app must live without until the
// migration has been run by hand in the Supabase SQL editor. Pure.
//
// Reading is always safe: `select *` simply has no such column. Writing is
// the problem: PostgREST refuses a whole insert, update or upsert that names
// a column the table does not have, so a settings save from any screen would
// fail just because the Library migration is still waiting. The server side
// backend (supabase.ts) takes a soft column out of a refused write and tries
// again, so everything else in the row is still saved.

import type { TableName } from "../types";

/** Columns of 0015_library.sql and 0016_food_goal.sql on tables that exist already. */
export const SOFT_COLUMNS: { [K in TableName]?: readonly string[] } = {
  app_settings: ["library_position", "drops_enabled", "drops_per_day", "cook_minutes", "food_onboarded", "goal", "pinned_quote", "lockscreen_token"],
  // 0017_recipe_source.sql
  recipe: ["source_url", "source_name", "minutes"],
};

/**
 * The column a "no such column" error is about, or null for any other error.
 * Reads both shapes: PostgREST's schema cache message (PGRST204) and
 * Postgres's own (42703).
 */
export function missingColumn(message: string): string | null {
  const cache = /Could not find the '([^']+)' column of '[^']+' in the schema cache/i.exec(message);
  if (cache) return cache[1];
  const pg = /column "?([a-z0-9_]+)"? (?:of relation "?[a-z0-9_]+"? )?does not exist/i.exec(message);
  return pg ? pg[1] : null;
}

/** True when an error says a table or column is not there yet: the migration has not been run. */
export function isMissingSchema(message: string): boolean {
  return /schema cache|does not exist|could not find the (table|column)|relation .* does not exist/i.test(message);
}

/** The row without the soft column, or null when it is not soft or not in the row. */
export function withoutSoftColumn<T extends Record<string, unknown>>(table: TableName, row: T, column: string): T | null {
  if (!(SOFT_COLUMNS[table] ?? []).includes(column)) return null;
  if (!(column in row)) return null;
  const copy = { ...row };
  delete copy[column];
  return copy;
}
