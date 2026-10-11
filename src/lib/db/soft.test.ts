import { describe, expect, it } from "vitest";
import { isMissingSchema, missingColumn, withoutSoftColumn } from "./soft";

describe("columns the migration has not added yet", () => {
  it("finds the column in either kind of error", () => {
    expect(missingColumn("update app_settings failed: Could not find the 'library_position' column of 'app_settings' in the schema cache")).toBe("library_position");
    expect(missingColumn('column "drops_enabled" of relation "app_settings" does not exist')).toBe("drops_enabled");
    expect(missingColumn("duplicate key value violates unique constraint")).toBeNull();
  });

  it("takes only a soft column out of a write", () => {
    const row = { quiet_start: "23:00", library_position: null };
    expect(withoutSoftColumn("app_settings", row, "library_position")).toEqual({ quiet_start: "23:00" });
    expect(withoutSoftColumn("app_settings", row, "quiet_start")).toBeNull();
    expect(withoutSoftColumn("app_settings", { quiet_start: "23:00" }, "library_position")).toBeNull();
    expect(withoutSoftColumn("day_log", { library_position: 1 }, "library_position")).toBeNull();
  });

  it("tells a missing table from any other failure", () => {
    expect(isMissingSchema("list quote_state failed: Could not find the table 'public.quote_state' in the schema cache")).toBe(true);
    expect(isMissingSchema('relation "quote_state" does not exist')).toBe(true);
    expect(isMissingSchema("list quote_state failed: JWT expired")).toBe(false);
  });
});
