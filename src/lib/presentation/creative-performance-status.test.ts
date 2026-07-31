import { describe, expect, it } from "vitest";

import type { CreativePerformanceSummary } from "@/types/view-models";

import {
  CREATIVE_PERFORMANCE_STATUSES,
  creativePerformanceStatus,
  scatterAxisLabel,
  scatterBubbleAriaLabel,
} from "./creative-performance-status";

function performance(
  performanceStatus:
    | "above_benchmark"
    | "within_benchmark"
    | "needs_review"
    | "not_eligible",
  resultKey = "lead",
) {
  return {
    evaluation: {
      resultKey,
      performanceStatus,
    },
  } as CreativePerformanceSummary;
}

describe("creative performance presentation status", () => {
  it("keeps one stable, text-labelled status mapping", () => {
    expect(
      CREATIVE_PERFORMANCE_STATUSES.map((status) => [
        status.key,
        status.label,
      ]),
    ).toEqual([
      ["good", "Tốt hơn benchmark"],
      ["stable", "Trong ngưỡng"],
      ["poor", "Cần theo dõi"],
      ["limited", "Chưa thể đánh giá"],
    ]);
    expect(
      creativePerformanceStatus(
        performance("above_benchmark"),
        "lead",
      ).key,
    ).toBe("good");
    expect(
      creativePerformanceStatus(
        performance("within_benchmark"),
        "lead",
      ).key,
    ).toBe("stable");
    expect(
      creativePerformanceStatus(
        performance("needs_review"),
        "lead",
      ).key,
    ).toBe("poor");
    expect(
      creativePerformanceStatus(
        performance("above_benchmark", "purchase"),
        "lead",
      ).key,
    ).toBe("limited");
  });

  it("builds generic unit-aware axes and complete bubble labels", () => {
    expect(
      scatterAxisLabel({
        axis: "X",
        label: "Spend",
        valueType: "currency",
        currency: "VND",
      }),
    ).toBe("Trục X · Spend (VND)");
    expect(
      scatterAxisLabel({
        axis: "Y",
        label: "Cost/Lead",
        valueType: "currency",
        currency: "VND",
        direction: "thấp hơn tốt hơn",
      }),
    ).toBe("Trục Y · Cost/Lead (VND) · thấp hơn tốt hơn");
    expect(
      scatterBubbleAriaLabel({
        name: "Creative A",
        statusLabel: "Trong ngưỡng",
        spend: "1.000 VND",
        efficiencyLabel: "Cost/Lead",
        efficiencyValue: "100 VND",
        resultLabel: "Meta-attributed Lead",
        resultValue: "10",
        confidenceLabel: "Cao",
        benchmarkDeltaLabel: "-12%",
      }),
    ).toContain(
      "Trạng thái: Trong ngưỡng. Spend: 1.000 VND. Cost/Lead: 100 VND. Meta-attributed Lead: 10. Độ tin cậy: Cao. So với benchmark: -12%",
    );
  });
});
