import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COLUMNS, UNIQUE_KEYS } from "./schema";
import { TABLE_NAMES } from "../types";

const sql = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/0001_init.sql", import.meta.url)), "utf8");

interface ParsedTable {
  columns: Record<string, string>;
  unique: string[];
}

function parse(): Record<string, ParsedTable> {
  const out: Record<string, ParsedTable> = {};
  const re = /create table (\w+) \(([\s\S]*?)\n\);/g;
  for (let m = re.exec(sql); m; m = re.exec(sql)) {
    const table: ParsedTable = { columns: {}, unique: [] };
    for (const raw of m[2].split("\n")) {
      const line = raw.trim().replace(/,$/, "");
      if (!line) continue;
      const tableUnique = /^unique \(([^)]+)\)/.exec(line);
      if (tableUnique) {
        table.unique.push(tableUnique[1].replace(/\s/g, ""));
        continue;
      }
      const col = /^"?(\w+)"? (\w+)/.exec(line);
      if (!col) continue;
      table.columns[col[1]] = col[2];
      if (/\bunique\b/.test(line) || /primary key/.test(line)) table.unique.push(col[1]);
    }
    out[m[1]] = table;
  }
  return out;
}

describe("0001_init.sql matches types.ts", () => {
  const parsed = parse();

  it("has exactly the tables in TABLE_NAMES", () => {
    expect(Object.keys(parsed).sort()).toEqual([...TABLE_NAMES].sort());
  });

  it.each(TABLE_NAMES)("%s has the same columns and types", (table) => {
    expect(parsed[table].columns).toEqual(COLUMNS[table]);
  });

  it.each(TABLE_NAMES)("%s has row level security on", (table) => {
    expect(sql).toContain(`alter table ${table} enable row level security;`);
  });

  it("has a unique constraint for every upsert conflict target", () => {
    for (const [table, keys] of Object.entries(UNIQUE_KEYS)) {
      for (const cols of keys ?? []) expect(parsed[table].unique, `${table} (${cols.join(",")})`).toContain(cols.join(","));
    }
  });

  it("gives no access to the anon key", () => {
    expect(sql).not.toMatch(/create policy/i);
  });
});
