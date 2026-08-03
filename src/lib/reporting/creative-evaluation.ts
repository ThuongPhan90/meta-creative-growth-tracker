import type { CreativeFatigueStatus } from "./creative-fatigue";

export type EvaluationDirection =
  | "lower_is_better"
  | "higher_is_better";

export type EvaluationEligibility = "eligible" | "not_eligible";
export type EvaluationPerformanceStatus =
  | "above_benchmark"
  | "within_benchmark"
  | "needs_review"
  | "not_eligible";
export type EvaluationFatigueStatus = CreativeFatigueStatus;
export type EvaluationDataConfidence = "high" | "medium" | "low";

export type EvaluationExplanation = {
  resultKey: string;
  metricKey: string;
  actualValue: number | null;
  benchmarkValue: number | null;
  deltaPercent: number | null;
  peerGroupLabel: string;
  sampleSize: number;
  eligibility: EvaluationEligibility;
  dataConfidence: EvaluationDataConfidence;
  performanceStatus: EvaluationPerformanceStatus;
  fatigueStatus: EvaluationFatigueStatus;
  recommendationKey:
    | "scale_controlled"
    | "hold_monitor"
    | "continue_test"
    | "refresh_creative"
    | "inspect_distribution"
    | "check_mapping_data";
  reasons: string[];
};

export type CreativeEvaluationInput = {
  resultKey: string;
  metricKey: string;
  direction: EvaluationDirection;
  actualValue: number | null;
  benchmarkValue: number | null;
  peerGroupLabel: string;
  sampleSize: number;
  impressions: number;
  primaryResults: number;
  spend: number;
  minimumImpressions?: number;
  minimumResults?: number;
  dataConfidence: EvaluationDataConfidence;
  mappingAvailable?: boolean;
  /** Calculated by creative-fatigue from two auditable reporting windows. */
  fatigue?: {
    status: EvaluationFatigueStatus;
    adverseSignalCount: number;
  };
};

const PERFORMANCE_BAND_PERCENT = 20;

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function percentageDelta(
  actual: number | null,
  benchmark: number | null,
): number | null {
  if (actual === null || benchmark === null || benchmark <= 0) {
    return null;
  }
  return ((actual - benchmark) / benchmark) * 100;
}

/**
 * Evaluates one Creative only inside the supplied Objective/Result peer
 * group. The function is deterministic, read-only and returns every threshold
 * decision as an auditable explanation instead of hiding it in UI colors.
 */
export function evaluateCreative(
  input: CreativeEvaluationInput,
): EvaluationExplanation {
  const minimumImpressions = Math.max(
    0,
    Math.floor(input.minimumImpressions ?? 1_000),
  );
  const minimumResults = Math.max(
    1,
    Math.floor(input.minimumResults ?? 5),
  );
  const actualValue = finite(input.actualValue);
  const benchmarkValue = finite(input.benchmarkValue);
  const deltaPercent = percentageDelta(actualValue, benchmarkValue);
  const mappingAvailable = input.mappingAvailable !== false;
  const spendEligibilityThreshold =
    input.metricKey === "cost_per_result" &&
    benchmarkValue !== null &&
    benchmarkValue > 0
      ? benchmarkValue * minimumResults
      : null;
  const eligible =
    mappingAvailable &&
    input.impressions >= minimumImpressions &&
    (input.primaryResults >= minimumResults ||
      (spendEligibilityThreshold !== null &&
        input.spend >= spendEligibilityThreshold));
  // Missing fatigue input is intentionally not inferred from an arbitrary
  // report range. The dedicated engine requires two valid, equal windows.
  const fatigue = input.fatigue?.status ?? "insufficient";
  const reasons: string[] = [];

  let performanceStatus: EvaluationPerformanceStatus = "not_eligible";
  if (!mappingAvailable) {
    reasons.push("Chưa có mapping kết quả phù hợp cho Creative này.");
  }
  if (input.impressions < minimumImpressions) {
    reasons.push(
      `Cần tối thiểu ${minimumImpressions.toLocaleString("vi-VN")} lượt hiển thị để đánh giá.`,
    );
  }
  if (
    input.primaryResults < minimumResults &&
    (spendEligibilityThreshold === null ||
      input.spend < spendEligibilityThreshold)
  ) {
    reasons.push(
      `Cần tối thiểu ${minimumResults.toLocaleString("vi-VN")} kết quả hoặc mức chi tiêu tương đương ngưỡng kiểm tra.`,
    );
  }

  if (eligible) {
    if (deltaPercent === null) {
      const zeroResultSpendGateReached =
        input.metricKey === "cost_per_result" &&
        input.primaryResults <= 0 &&
        spendEligibilityThreshold !== null &&
        input.spend >= spendEligibilityThreshold;
      if (zeroResultSpendGateReached) {
        performanceStatus = "needs_review";
        reasons.push(
          "Creative chưa tạo kết quả dù Spend đã đạt ngưỡng kiểm tra theo benchmark.",
        );
      } else {
        performanceStatus = "not_eligible";
        reasons.push("Chưa có benchmark hợp lệ cho peer group đã chọn.");
      }
    } else {
      const favorableDelta =
        input.direction === "lower_is_better"
          ? -deltaPercent
          : deltaPercent;
      performanceStatus =
        favorableDelta >= PERFORMANCE_BAND_PERCENT
          ? "above_benchmark"
          : favorableDelta >= -PERFORMANCE_BAND_PERCENT
            ? "within_benchmark"
            : "needs_review";
      reasons.push(
        `${input.metricKey} ${
          Math.abs(deltaPercent) < 0.05
            ? "bằng"
            : deltaPercent < 0
              ? "thấp hơn"
              : "cao hơn"
        } benchmark ${Math.abs(deltaPercent).toLocaleString("vi-VN", {
          maximumFractionDigits: 1,
        })}%.`,
      );
    }
  }

  if (fatigue === "fatigue_risk") {
    reasons.push(
      `Có ${input.fatigue?.adverseSignalCount ?? 0} tín hiệu xu hướng, gồm Frequency và ít nhất một chỉ số hiệu quả xấu đi.`,
    );
  } else if (fatigue === "monitor") {
    reasons.push("Có tín hiệu xu hướng cần theo dõi thêm.");
  } else if (fatigue === "insufficient") {
    reasons.push("Chưa đủ dữ liệu xu hướng để đánh giá độ mỏi.");
  }

  const recommendationKey: EvaluationExplanation["recommendationKey"] =
    !mappingAvailable || input.dataConfidence === "low"
      ? "check_mapping_data"
      : performanceStatus === "not_eligible"
        ? "continue_test"
        : fatigue === "fatigue_risk"
          ? "refresh_creative"
          : performanceStatus === "above_benchmark"
            ? "scale_controlled"
            : performanceStatus === "within_benchmark"
              ? "hold_monitor"
              : "inspect_distribution";

  return {
    resultKey: input.resultKey,
    metricKey: input.metricKey,
    actualValue,
    benchmarkValue,
    deltaPercent,
    peerGroupLabel: input.peerGroupLabel,
    sampleSize: Math.max(0, Math.floor(input.sampleSize)),
    eligibility:
      performanceStatus === "not_eligible" ? "not_eligible" : "eligible",
    dataConfidence: input.dataConfidence,
    performanceStatus,
    fatigueStatus: fatigue,
    recommendationKey,
    reasons,
  };
}
