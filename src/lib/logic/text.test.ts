import { describe, expect, it } from "vitest";
import { cleanLine, stripDashes } from "./text";

describe("stripDashes", () => {
  it("turns a dash between numbers into to and any other into a comma", () => {
    const out = stripDashes("Protein held \u2014 money slipped. Oct 5\u20139. 1,900 \u2013 2,100 kcal.");
    expect(out).toBe("Protein held, money slipped. Oct 5 to 9. 1,900 to 2,100 kcal.");
    expect(/[\u2012-\u2015]/.test(out)).toBe(false);
  });
  it("keeps plain hyphens and fixes the minus sign", () => {
    expect(stripDashes("re-log \u22125")).toBe("re-log -5");
  });
  it("cleanLine folds whitespace and cuts to length", () => {
    expect(cleanLine("  Chicken \u2014 rice\n and broccoli  ", 80)).toBe("Chicken, rice and broccoli");
    expect(cleanLine("abcdef", 3)).toBe("abc");
    expect(cleanLine(42, 10)).toBe("");
  });
});
