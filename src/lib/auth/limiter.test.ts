import { beforeEach, describe, expect, it } from "vitest";
import { afterFailure, describeWait, lockRemaining, memoryAttempts, resetMemoryAttempts, tryLogin, type AttemptState, type AttemptStore } from "./limiter";

const T0 = new Date("2026-10-05T12:00:00.000Z");
const later = (ms: number) => new Date(T0.getTime() + ms);

function tableLike(): AttemptStore & { state: AttemptState } {
  const s = {
    state: { failures: 0, locked_until: null } as AttemptState,
    read: async () => s.state,
    write: async (next: AttemptState) => {
      s.state = next;
    },
  };
  return s;
}

describe("passcode limiter", () => {
  beforeEach(() => resetMemoryAttempts());

  it("locks for a minute on the fifth wrong try", () => {
    let s: AttemptState = { failures: 0, locked_until: null };
    for (let i = 0; i < 4; i++) s = afterFailure(s, T0);
    expect(lockRemaining(s, T0)).toBe(0);
    s = afterFailure(s, T0);
    expect(s.failures).toBe(5);
    expect(lockRemaining(s, T0)).toBe(60_000);
    expect(lockRemaining(s, later(60_000))).toBe(0);
  });

  it("doubles the lock each round and stops at an hour", () => {
    let s: AttemptState = { failures: 5, locked_until: null };
    for (let i = 0; i < 5; i++) s = afterFailure(s, T0);
    expect(lockRemaining(s, T0)).toBe(120_000);
    s = { failures: 5 * 20 - 1, locked_until: null };
    s = afterFailure(s, T0);
    expect(lockRemaining(s, T0)).toBe(60 * 60_000);
  });

  it("refuses even the right passcode while locked, then lets it in", async () => {
    const store = tableLike();
    for (let i = 0; i < 5; i++) await tryLogin(() => false, T0, store);
    expect(await tryLogin(() => true, later(1000), store)).toEqual({ ok: false, locked: true, waitMs: 59_000 });
    expect(await tryLogin(() => true, later(61_000), store)).toEqual({ ok: true });
    expect(store.state).toEqual({ failures: 0, locked_until: null });
  });

  it("keeps the count in the store, so a fresh server instance still sees it", async () => {
    const store = tableLike();
    for (let i = 0; i < 4; i++) await tryLogin(() => false, T0, store);
    // A new instance has empty memory but reads the same table.
    resetMemoryAttempts();
    const out = await tryLogin(() => false, T0, store);
    expect(out).toEqual({ ok: false, locked: true, waitMs: 60_000 });
  });

  it("falls back to memory when the table cannot be reached", async () => {
    const broken: AttemptStore = {
      read: async () => {
        throw new Error("down");
      },
      write: async () => {
        throw new Error("down");
      },
    };
    for (let i = 0; i < 5; i++) await tryLogin(() => false, T0, broken);
    expect((await memoryAttempts.read()).failures).toBe(5);
    expect(await tryLogin(() => true, T0, broken)).toMatchObject({ ok: false, locked: true });
  });

  it("describes the wait in whole minutes", () => {
    expect(describeWait(59_000)).toBe("1 minute");
    expect(describeWait(61_000)).toBe("2 minutes");
  });
});
