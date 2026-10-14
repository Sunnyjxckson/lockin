import { describe, expect, it } from "vitest";
import { cleanCookMinutes, cleanTerms, cookLabel, cookPrefs, needsFoodOnboarding, withCookPrefs } from "./mealsOnboarding";

describe("food onboarding", () => {
  it("asks only on a first run", () => {
    expect(needsFoodOnboarding(false, false)).toBe(true);
    expect(needsFoodOnboarding(undefined, false)).toBe(true);
    expect(needsFoodOnboarding(true, false)).toBe(false);
    expect(needsFoodOnboarding(false, true)).toBe(false);
  });

  it("snaps cook time to a choice", () => {
    expect(cleanCookMinutes(20)).toBe(15);
    expect(cleanCookMinutes(40)).toBe(45);
    expect(cleanCookMinutes(120)).toBe(60);
    expect(cleanCookMinutes(null)).toBe(30);
    expect(cookLabel(60)).toBe("60+ min");
    expect(cookLabel(15)).toBe("15 min");
  });

  it("leans toward quick recipes on a short evening only", () => {
    expect(cookPrefs(15)?.boost).toEqual(["quick", "nocook"]);
    expect(cookPrefs(30)?.boost).toEqual(["quick"]);
    expect(cookPrefs(45)).toBeUndefined();
    expect(cookPrefs(60)).toBeUndefined();
  });

  it("keeps the request's words when merging", () => {
    expect(withCookPrefs(undefined, 45)).toBeUndefined();
    expect(withCookPrefs({ boost: ["chicken"], avoid: ["fish"] }, 30)).toEqual({ boost: ["chicken", "quick"], avoid: ["fish"] });
    expect(withCookPrefs({ boost: ["quick"] }, 30)?.boost).toEqual(["quick"]);
  });

  it("cleans terms", () => {
    expect(cleanTerms([" Rice ", "rice", "", "EGGS"])).toEqual(["rice", "eggs"]);
  });
});
