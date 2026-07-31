import { describe, expect, it } from "vitest";

import {
  baselineKey,
  computeScopedCpiBaselines,
  computeOsCpiBaselines,
  explainCreativeRating,
  rateCreativeCpi,
  scopedBaselineKey,
} from "./creative-rating";

describe("rateCreativeCpi", () => {
  it.each([
    [{ installs: 0, cpi: null, osBaselineCpi: 10 }, "KHÔNG INSTALL"],
    [{ installs: 19, cpi: 7, osBaselineCpi: 10 }, "ÍT DỮ LIỆU"],
    [{ installs: 20, cpi: 8, osBaselineCpi: 10 }, "TỐT"],
    [{ installs: 20, cpi: 12, osBaselineCpi: 10 }, "ỔN"],
    [{ installs: 20, cpi: 12.01, osBaselineCpi: 10 }, "KÉM"],
  ] as const)("rates the sheet thresholds", (input, expected) => {
    expect(rateCreativeCpi(input)).toBe(expected);
  });
});

describe("computeOsCpiBaselines", () => {
  it("separates OS and currency", () => {
    const result = computeOsCpiBaselines([
      { operatingSystem: "ANDROID", currency: "USD", spend: 100, installs: 10 },
      { operatingSystem: "ANDROID", currency: "USD", spend: 50, installs: 5 },
      { operatingSystem: "IOS", currency: "USD", spend: 200, installs: 10 },
      { operatingSystem: "ANDROID", currency: "VND", spend: 250_000, installs: 5 },
    ]);

    expect(result.get(baselineKey("ANDROID", "USD"))).toBe(10);
    expect(result.get(baselineKey("IOS", "USD"))).toBe(20);
    expect(result.get(baselineKey("ANDROID", "VND"))).toBe(50_000);
  });
});

describe("V2 rating explanation", () => {
  it("does not turn insufficient sample size into a watch performance status", () => {
    const explanation = explainCreativeRating({
      installs: 2,
      cpi: 100,
      osBaselineCpi: 90,
      minimumInstalls: 5,
      os: "android",
      format: "video",
      currency: "USD",
      windowDays: 30,
      benchmarkSampleSize: 2,
    });

    expect(explanation.performanceStatus).toBe("not_eligible");
    expect(explanation.confidence.dataStatus).not.toBe("complete");
  });

  it("returns benchmark scope, thresholds, action, reasons and confidence", () => {
    const result = explainCreativeRating({
      installs: 30,
      cpi: 8,
      osBaselineCpi: 10,
      os: "android",
      format: "video",
      currency: "vnd",
      windowDays: 30,
      benchmarkSampleSize: 42,
      additionalReasons: ["Hold thấp hơn nhóm cùng format 12%"],
    });

    expect(result).toMatchObject({
      rating: "TỐT",
      performanceStatus: "good",
      recommendedAction: "scale",
      deltaPercent: -20,
      benchmarkScope: {
        os: "android",
        format: "video",
        currency: "VND",
        windowDays: 30,
        sampleSize: 42,
      },
      thresholds: {
        minimumSampleSize: 20,
        goodMaxRatio: 0.8,
        withinRangeMaxRatio: 1.2,
      },
      confidence: {
        dataStatus: "ready",
        confidence: "high",
      },
    });
    expect(result.reasons).toContain("Hold thấp hơn nhóm cùng format 12%");
  });

  it("keeps format cohorts separate", () => {
    const result = computeScopedCpiBaselines([
      {
        operatingSystem: "ANDROID",
        format: "video",
        currency: "VND",
        spend: 100,
        installs: 10,
      },
      {
        operatingSystem: "ANDROID",
        format: "image",
        currency: "VND",
        spend: 200,
        installs: 10,
      },
    ]);

    expect(result.get(scopedBaselineKey("ANDROID", "video", "VND"))).toBe(10);
    expect(result.get(scopedBaselineKey("ANDROID", "image", "VND"))).toBe(20);
  });
});
