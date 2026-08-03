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
};

describe("evaluateCreative", () => {
  it("marks a lower cost at least 20% better than benchmark", () => {
    const result = evaluateCreative(base);

    expect(result).toMatchObject({
      eligibility: "eligible",
      performanceStatus: "above_benchmark",
      deltaPercent: -20,
      recommendationKey: "scale_controlled",
    });
  });

  it("keeps the 1.2x cost boundary within benchmark", () => {
    const result = evaluateCreative({
      ...base,
      actualValue: 120,
    });

    expect(result).toMatchObject({
      deltaPercent: 20,
      performanceStatus: "within_benchmark",
    });
  });

  it("marks cost above 1.2x benchmark as needs review", () => {
    const result = evaluateCreative({
      ...base,
      actualValue: 120.01,
    });

    expect(result.performanceStatus).toBe("needs_review");
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

  it("keeps fatigue insufficient when the dedicated fatigue engine has no result", () => {
    const result = evaluateCreative({
      ...base,
    });

    expect(result.fatigueStatus).toBe("insufficient");
  });

  it("uses the dedicated fatigue decision for a valid frequency-led warning", () => {
    const result = evaluateCreative({
      ...base,
      fatigue: {
        status: "fatigue_risk",
        adverseSignalCount: 2,
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
