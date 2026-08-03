import { describe, expect, it } from "vitest";

import {
  isUiV3,
  isUiV3Route,
  resolveUiVersion,
  shouldUseUiV3Shell,
} from "./ui-version";

describe("resolveUiVersion", () => {
  it("uses V3 as the safe server-side default", () => {
    expect(resolveUiVersion(undefined)).toBe("v3");
    expect(resolveUiVersion("unexpected")).toBe("v3");
  });

  it("accepts V3 and requires an explicit V2 rollback flag", () => {
    expect(resolveUiVersion("v3")).toBe("v3");
    expect(resolveUiVersion(" V3 ")).toBe("v3");
    expect(resolveUiVersion("v2")).toBe("v2");
    expect(resolveUiVersion(" V2 ")).toBe("v2");
    expect(isUiV3("v3")).toBe(true);
    expect(isUiV3("v2")).toBe(false);
  });

  it("matches only the released V3 routes and their explicit detail routes", () => {
    expect(isUiV3Route("/overview")).toBe(true);
    expect(isUiV3Route("/overview/")).toBe(true);
    expect(isUiV3Route("/creatives")).toBe(true);
    expect(isUiV3Route("/creatives/cf_123")).toBe(true);
    expect(isUiV3Route("/campaigns/cmp_123")).toBe(true);
    expect(isUiV3Route("/sources/ad-accounts/act_123")).toBe(true);
    expect(isUiV3Route("/sources/unknown/asset_123")).toBe(false);
    expect(isUiV3Route("/creatives/cf_123/unknown")).toBe(false);
    expect(isUiV3Route(null)).toBe(false);

    expect(shouldUseUiV3Shell("/overview", true)).toBe(true);
    expect(shouldUseUiV3Shell("/creatives", true)).toBe(true);
    expect(shouldUseUiV3Shell("/overview", false)).toBe(false);
  });
});
