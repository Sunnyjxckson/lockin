// Slows down passcode guessing. After every 5 wrong tries in a row the login
// locks, for 1 minute the first time and twice as long each time after, up to
// an hour. A correct passcode clears it.
//
// Where the count lives:
// - Supabase mode: the login_attempt table, so it holds across serverless
//   instances and cold starts.
// - Local mode: this module's memory. There is one long lived server (or
//   none that matters, since a device passcode is checked on the device).

import { db, isSupabaseMode } from "../db";
import type { IsoStr } from "../types";

export const TRIES_PER_LOCK = 5;
const BASE_LOCK_MS = 60_000;
const MAX_LOCK_MS = 60 * 60_000;
const ROW_ID = "passcode";

export interface AttemptState {
  failures: number;
  locked_until: IsoStr | null;
}

const CLEAR: AttemptState = { failures: 0, locked_until: null };

/** Milliseconds left on the lock, 0 when it is open. */
export function lockRemaining(state: AttemptState, now: Date): number {
  if (!state.locked_until) return 0;
  return Math.max(0, new Date(state.locked_until).getTime() - now.getTime());
}

/** The state after one more wrong try. Pure. */
export function afterFailure(state: AttemptState, now: Date): AttemptState {
  const failures = state.failures + 1;
  if (failures % TRIES_PER_LOCK !== 0) return { failures, locked_until: state.locked_until };
  const round = failures / TRIES_PER_LOCK;
  const ms = Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** (round - 1));
  return { failures, locked_until: new Date(now.getTime() + ms).toISOString() };
}

/** "1 minute", "8 minutes". Rounded up. */
export function describeWait(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

export interface AttemptStore {
  read(): Promise<AttemptState>;
  write(state: AttemptState): Promise<void>;
}

let memory: AttemptState = CLEAR;

export const memoryAttempts: AttemptStore = {
  read: async () => memory,
  write: async (state) => {
    memory = state;
  },
};

export const tableAttempts: AttemptStore = {
  async read() {
    const row = await db.get("login_attempt", ROW_ID);
    return row ? { failures: Number(row.failures) || 0, locked_until: row.locked_until } : CLEAR;
  },
  async write(state) {
    await db.upsert("login_attempt", { id: ROW_ID, failures: state.failures, locked_until: state.locked_until }, ["id"]);
  },
};

export function attemptStore(): AttemptStore {
  return isSupabaseMode() && !!process.env.SUPABASE_SERVICE_ROLE_KEY ? tableAttempts : memoryAttempts;
}

/**
 * Run one login try through the limiter.
 * Returns { ok: true } on the right passcode, otherwise why not.
 * If the table cannot be reached the memory counter is used, so a database
 * problem never opens the door and never locks the owner out for good.
 */
export async function tryLogin(
  matches: () => boolean,
  now: Date = new Date(),
  store: AttemptStore = attemptStore(),
): Promise<{ ok: true } | { ok: false; locked: boolean; waitMs: number }> {
  let s = store;
  let state: AttemptState;
  try {
    state = await s.read();
  } catch {
    s = memoryAttempts;
    state = await s.read();
  }
  const wait = lockRemaining(state, now);
  if (wait > 0) return { ok: false, locked: true, waitMs: wait };

  if (matches()) {
    if (state.failures > 0 || state.locked_until) await s.write(CLEAR).catch(() => undefined);
    return { ok: true };
  }
  const next = afterFailure(state, now);
  await s.write(next).catch(() => memoryAttempts.write(next));
  const nowLocked = lockRemaining(next, now);
  return { ok: false, locked: nowLocked > 0, waitMs: nowLocked };
}

/** For tests. */
export function resetMemoryAttempts(): void {
  memory = CLEAR;
}
