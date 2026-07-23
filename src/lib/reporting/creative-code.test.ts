import { describe, expect, it } from "vitest";

import { normalizeCreativeCode } from "./creative-code";

describe("normalizeCreativeCode", () => {
  it("removes Copy suffixes and normalizes a known monthly code", () => {
    expect(normalizeCreativeCode("Launch_V12-2606 - Copy 3").code).toBe(
      "V12-2606-VA",
    );
  });

  it("keeps physical identity out of the business alias", () => {
    const result = normalizeCreativeCode("NEW APP PROMOTION AD");
    expect(result.code).toBe("CHƯA RÕ MÃ – NEW APP");
    expect(result.reason).toBe("known_promotion_alias");
  });

  it("uses the cleaned ad name as a transparent fallback", () => {
    expect(normalizeCreativeCode("Banner_A - Copy").code).toBe("Banner-A");
  });
});
