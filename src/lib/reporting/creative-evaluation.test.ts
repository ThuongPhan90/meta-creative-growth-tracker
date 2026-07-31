import { describe, expect, it } from "vitest";

import { evaluateCreative } from "./creative-evaluation";

const base = {
  resultKey: "lead",
  metricKey: "cost_per_lead",
  direction: "lower_is_better" as const,
  actualValue: 80,
  benchmarkValue: 100,
  peerGroupLabel: "Account · Leads · Lead · Video · VND",
  sampleSize: 24,
  impressions: 8_000,
  primaryResults: 10,
  spend: 800,
  dataConfidence: "high" as const,
  windowDays: 14,
};

describe("evaluateCreative", () => {
  it("marks a lower cost at least 15% better than benchmark", () => {
    const result = evaluateCreative(base);

    expect(result).toMatchObject({
      eligibility: "eligible",
      performanceStatus: "above_benchmark",
      deltaPercent: -20,
      recommendationKey: "scale_controlled",
    });
  });

  it("keeps insufficient delivery out of good and poor statuses", () => {
    const result = evaluateCreative({
      ...base,
      impressions: 999,
      primaryResults: 0,
      spend: 100,
    });

    expect(result.eligibility).toBe("not_eligible");
    expect(result.performanceStatus).toBe("not_eligible");
    expect(result.recommendationKey).toBe("continue_test");
  });

  it("flags zero-result delivery after the benchmark spend gate", () => {
    const result = evaluateCreative({
      ...base,
      metricKey: "cost_per_result",
      actualValue: null,
      impressions: 5_000,
      primaryResults: 0,
      spend: 500,
    });

    expect(result.eligibility).toBe("eligible");
    expect(result.performanceStatus).toBe("needs_review");
    expect(result.recommendationKey).toBe("inspect_distribution");
    expect(result.reasons.join(" ")).toContain(
      "chưa tạo kết quả",
    );
  });

  it("reverses the benchmark direction for higher-is-better metrics", () => {
    const result = evaluateCreative({
      ...base,
      metricKey: "result_rate",
      direction: "higher_is_better",
      actualValue: 12,
      benchmarkValue: 10,
    });

    expect(result.performanceStatus).toBe("above_benchmark");
    expect(result.deltaPercent).toBe(20);
  });

  it("does not apply a cost-denominated spend gate to rate metrics", () => {
    const result = evaluateCreative({
      ...base,
      metricKey: "rate",
      direction: "higher_is_better",
      actualValue: 12,
      benchmarkValue: 10,
      primaryResults: 0,
      spend: 10_000,
    });

    expect(result.performanceStatus).toBe("not_eligible");
    expect(result.eligibility).toBe("not_eligible");
  });

  it("does not fabricate fatigue for a date range under three days", () => {
    const result = evaluateCreative({
      ...base,
      windowDays: 2,
      fatigueTrend: {
        frequencyDeltaPercent: 40,
        ctrDeltaPercent: -30,
        costPerResultDeltaPercent: 50,
        resultVolumeDeltaPercent: -40,
      },
    });

    expect(result.fatigueStatus).toBe("insufficient");
  });

  it("detects fatigue only from multiple adverse trend signals", () => {
    const result = evaluateCreative({
      ...base,
      fatigueTrend: {
        frequencyDeltaPercent: 20,
        ctrDeltaPercent: -25,
        costPerResultDeltaPercent: 30,
        resultVolumeDeltaPercent: -20,
      },
    });

    expect(result.fatigueStatus).toBe("fatigue_risk");
    expect(result.recommendationKey).toBe("refresh_creative");
  });

  it("routes missing mappings to data remediation", () => {
    const result = evaluateCreative({
      ...base,
      mappingAvailable: false,
      dataConfidence: "low",
    });

    expect(result).toMatchObject({
      eligibility: "not_eligible",
      performanceStatus: "not_eligible",
      recommendationKey: "check_mapping_data",
    });
  });
});
