import { describe, expect, it } from "vitest";
import { LocalBackend, memoryStore } from "./local";
import { RemoteBackend, type DbRequest } from "./remote";
import { DbError } from "./types";
import type { TableName } from "../types";

// A stand-in for /api/db that runs each request on a memory backend, the same
// way the route runs it on Supabase. Proves the wire format carries every call.
function fakeServer() {
  const target = new LocalBackend(memoryStore(), "memory");
  const calls: DbRequest[] = [];
  const fetcher = async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as DbRequest;
    calls.push(body);
    try {
      const run = target[body.op] as (table: TableName, ...args: unknown[]) => Promise<unknown>;
      const data = await run.call(target, body.table, ...body.args);
      return new Response(JSON.stringify({ data: data ?? null }), { status: 200 });
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
  };
  return { remote: new RemoteBackend(fetcher), calls };
}

describe("remote backend", () => {
  it("round trips every operation", async () => {
    const { remote, calls } = fakeServer();
    const a = await remote.insert("earning", { date: "2026-10-05", amount: 30, app: "DoorDash", hours: 1.5, screenshot_url: null });
    expect(a.id).toBeTruthy();
    await remote.insertMany("earning", [{ date: "2026-10-06", amount: 10, app: "Uber Eats", hours: null, screenshot_url: null }]);
    expect(await remote.list("earning", { from: "2026-10-06" })).toHaveLength(1);
    expect(await remote.list("earning")).toHaveLength(2);
    expect((await remote.get("earning", a.id))?.amount).toBe(30);
    expect(await remote.get("earning", "nope")).toBeNull();
    expect((await remote.update("earning", a.id, { amount: 35 })).amount).toBe(35);
    const up = await remote.upsert("body_log", { date: "2026-10-09", weight: 182, photo_url: null }, ["date"]);
    const up2 = await remote.upsert("body_log", { date: "2026-10-09", weight: 181, photo_url: null }, ["date"]);
    expect(up2.id).toBe(up.id);
    expect(await remote.removeWhere("earning", { date: "2026-10-06" })).toBe(1);
    await remote.remove("earning", a.id);
    expect(await remote.list("earning")).toEqual([]);
    expect(calls.map((c) => c.op)).toEqual([
      "insert",
      "insertMany",
      "list",
      "list",
      "get",
      "get",
      "update",
      "upsert",
      "upsert",
      "removeWhere",
      "remove",
      "list",
    ]);
  });

  it("turns a server error into a DbError with its message", async () => {
    const { remote } = fakeServer();
    await expect(remote.update("earning", "nope", { amount: 1 })).rejects.toThrow(/no row/);
    await expect(remote.update("earning", "nope", { amount: 1 })).rejects.toBeInstanceOf(DbError);
  });

  it("turns a network failure into a DbError", async () => {
    const remote = new RemoteBackend(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(remote.list("earning")).rejects.toBeInstanceOf(DbError);
  });

  it("reports a locked server", async () => {
    const remote = new RemoteBackend(async () => new Response(JSON.stringify({ error: "Locked. Enter the passcode." }), { status: 401 }));
    await expect(remote.list("earning")).rejects.toThrow("Locked. Enter the passcode.");
  });
});
