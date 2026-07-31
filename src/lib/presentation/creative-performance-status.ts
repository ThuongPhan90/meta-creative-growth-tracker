import type { ResultMetricValueType } from "@/lib/reporting/result-metrics";
import type { CreativePerformanceSummary } from "@/types/view-models";

export const CREATIVE_PERFORMANCE_STATUSES = [
  {
    key: "good",
    label: "Tốt hơn benchmark",
    tone: "success",
  },
  {
    key: "stable",
    label: "Trong ngưỡng",
    tone: "accent",
  },
  {
    key: "poor",
    label: "Cần theo dõi",
    tone: "danger",
  },
  {
    key: "limited",
    label: "Chưa thể đánh giá",
    tone: "warning",
  },
] as const;

export type CreativePerformanceStatusKey =
  (typeof CREATIVE_PERFORMANCE_STATUSES)[number]["key"];

const STATUS_BY_KEY = Object.fromEntries(
  CREATIVE_PERFORMANCE_STATUSES.map((status) => [
    status.key,
    status,
  ]),
) as Record<
  CreativePerformanceStatusKey,
  (typeof CREATIVE_PERFORMANCE_STATUSES)[number]
>;

export function creativePerformanceStatusKey(
  performance: CreativePerformanceSummary | null | undefined,
  resultKey?: string | null,
): CreativePerformanceStatusKey {
  const evaluation = performance?.evaluation;
  if (
    !evaluation ||
    (resultKey && evaluation.resultKey !== resultKey)
  ) {
    return "limited";
  }
  if (evaluation.performanceStatus === "above_benchmark") {
    return "good";
  }
  if (evaluation.performanceStatus === "within_benchmark") {
    return "stable";
  }
  if (evaluation.performanceStatus === "needs_review") {
    return "poor";
  }
  return "limited";
}

export function creativePerformanceStatus(
  performance: CreativePerformanceSummary | null | undefined,
  resultKey?: string | null,
) {
  return STATUS_BY_KEY[
    creativePerformanceStatusKey(performance, resultKey)
  ];
}

function scatterMetricUnit(
  valueType: ResultMetricValueType,
  currency: string | null | undefined,
) {
  if (valueType === "currency") {
    return currency?.trim() || "tiền tệ";
  }
  if (valueType === "percent") return "%";
  if (valueType === "ratio") return "×";
  return "số lượng";
}

export function scatterAxisLabel({
  axis,
  label,
  valueType,
  currency,
  direction,
}: {
  axis: "X" | "Y";
  label: string;
  valueType: ResultMetricValueType;
  currency?: string | null;
  direction?: string;
}) {
  const unit = scatterMetricUnit(valueType, currency);
  return `Trục ${axis} · ${label} (${unit})${
    direction ? ` · ${direction}` : ""
  }`;
}

export function scatterBubbleAriaLabel({
  name,
  statusLabel,
  spend,
  efficiencyLabel,
  efficiencyValue,
  resultLabel,
  resultValue,
  confidenceLabel,
  benchmarkDeltaLabel,
}: {
  name: string;
  statusLabel: string;
  spend: string;
  efficiencyLabel: string;
  efficiencyValue: string;
  resultLabel: string;
  resultValue: string;
  confidenceLabel?: string | null;
  benchmarkDeltaLabel?: string | null;
}) {
  return [
    name,
    `Trạng thái: ${statusLabel}`,
    `Spend: ${spend}`,
    `${efficiencyLabel}: ${efficiencyValue}`,
    `${resultLabel}: ${resultValue}`,
    ...(confidenceLabel
      ? [`Độ tin cậy: ${confidenceLabel}`]
      : []),
    ...(benchmarkDeltaLabel
      ? [`So với benchmark: ${benchmarkDeltaLabel}`]
      : []),
  ].join(". ");
}
