import type {
  CreativePerformanceSummary,
  CreativeRow,
  RatingExplanation,
} from "@/types/view-models";

import type { EvaluationExplanation } from "./creative-evaluation";
import type { ReportingContext } from "./report-context";
import type { ResultDefinition } from "./result-definition";

type LegacyDeliveryMetrics = {
  spend: number;
  impressions: number;
  linkClicks: number;
  installs: number;
  registrations: number;
};

export type CanonicalResultTrendPoint = {
  date: string;
  currency: string;
  spend: number;
  resultValues: Record<string, number | null>;
  efficiencyValues: Record<string, number | null>;
};

function finite(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

/**
 * Compatibility mapping for delivery columns that predate the Result
 * registry. Shared UI must never call this function or inspect those columns.
 */
export function legacyDeliveryResultValue(
  metrics: LegacyDeliveryMetrics,
  canonicalResultKey: string,
) {
  if (canonicalResultKey === "impressions") {
    return finite(metrics.impressions);
  }
  if (canonicalResultKey === "link_click") {
    return finite(metrics.linkClicks);
  }
  if (canonicalResultKey === "install") {
    return finite(metrics.installs);
  }
  if (canonicalResultKey === "complete_registration") {
    return finite(metrics.registrations);
  }
  return null;
}

function applicableDefinitions(
  definitions: readonly ResultDefinition[],
  context: ReportingContext,
) {
  return definitions.filter(
    (definition) =>
      definition.enabled &&
      (context.objectiveKey === "all" ||
        definition.objectiveKeys.includes(context.objectiveKey)),
  );
}

function metricKey(definition: ResultDefinition) {
  if (definition.efficiencyMetric === "cost_per_result") {
    return "cost_per_result";
  }
  if (definition.efficiencyMetric === "rate") {
    return "result_rate";
  }
  if (definition.efficiencyMetric === "roas") return "roas";
  return "result";
}

function evaluationStatus(
  status: RatingExplanation["performanceStatus"],
): EvaluationExplanation["performanceStatus"] {
  if (status === "good") return "above_benchmark";
  if (status === "within_range") return "within_benchmark";
  if (status === "watch" || status === "poor") {
    return "needs_review";
  }
  return "not_eligible";
}

function recommendationKey(
  action: RatingExplanation["recommendedAction"],
): EvaluationExplanation["recommendationKey"] {
  if (action === "scale") return "scale_controlled";
  if (action === "hold") return "hold_monitor";
  if (action === "continue_test") return "continue_test";
  return "inspect_distribution";
}

function legacyInstallEvaluation({
  performance,
  definition,
}: {
  performance: CreativePerformanceSummary;
  definition: ResultDefinition | undefined;
}): EvaluationExplanation | null {
  const explanation = performance.ratingExplanation;
  if (!definition || !explanation) return null;
  const status = evaluationStatus(explanation.performanceStatus);
  return {
    resultKey: definition.canonicalKey,
    metricKey: metricKey(definition),
    actualValue: explanation.actualValue,
    benchmarkValue: explanation.benchmarkValue,
    deltaPercent: explanation.deltaPercent,
    peerGroupLabel: [
      explanation.benchmarkScope.os,
      explanation.benchmarkScope.format,
      explanation.benchmarkScope.currency,
      `${explanation.benchmarkScope.windowDays} days`,
    ].join(" · "),
    sampleSize: explanation.benchmarkScope.sampleSize,
    eligibility:
      status === "not_eligible" ? "not_eligible" : "eligible",
    dataConfidence: explanation.confidence.confidence,
    performanceStatus: status,
    fatigueStatus: "insufficient",
    recommendationKey: recommendationKey(
      explanation.recommendedAction,
    ),
    reasons: explanation.reasons,
  };
}

function creativeMetrics(
  performance: CreativePerformanceSummary,
): LegacyDeliveryMetrics {
  return {
    spend: performance.spend,
    impressions: performance.impressions,
    linkClicks:
      performance.linkCtr === null
        ? 0
        : (performance.linkCtr / 100) * performance.impressions,
    installs: performance.installs,
    registrations: performance.registrations,
  };
}

/**
 * Ensures every reporting Creative row has an authoritative canonical Result
 * container. Demo-only legacy values and its CPI rating are translated here,
 * before any shared component sees them.
 */
export function withCanonicalCreativeResultValues({
  rows,
  context,
  definitions,
  legacyBridge,
}: {
  rows: readonly CreativeRow[];
  context: ReportingContext;
  definitions: readonly ResultDefinition[];
  legacyBridge: boolean;
}): CreativeRow[] {
  const applicable = applicableDefinitions(definitions, context);
  const selectedDefinition = context.primaryResultKey
    ? applicable.find(
        (definition) =>
          definition.canonicalKey === context.primaryResultKey,
      )
    : undefined;

  return rows.map((row) => {
    const performance = row.performance;
    if (!performance) return row;
    const values: Record<string, number | null> = {
      ...(performance.resultValues ?? {}),
    };
    const metrics = creativeMetrics(performance);
    for (const definition of applicable) {
      const deliveryValue = legacyDeliveryResultValue(
        metrics,
        definition.canonicalKey,
      );
      const isExactDeliveryField =
        definition.canonicalKey === "impressions" ||
        definition.canonicalKey === "link_click";
      const isDemoCompatibilityField =
        legacyBridge &&
        (definition.canonicalKey === "install" ||
          definition.canonicalKey === "complete_registration");
      if (isExactDeliveryField || isDemoCompatibilityField) {
        values[definition.canonicalKey] = deliveryValue;
      }
    }

    const evaluation =
      performance.evaluation ??
      (legacyBridge &&
      context.primaryResultKey === "install" &&
      selectedDefinition?.canonicalKey === "install"
        ? legacyInstallEvaluation({
            performance,
            definition: selectedDefinition,
          })
        : null);

    return {
      ...row,
      performance: {
        ...performance,
        resultValues: values,
        evaluation,
      },
    };
  });
}

function efficiencyValue({
  definition,
  result,
  metrics,
}: {
  definition: ResultDefinition;
  result: number | null;
  metrics: LegacyDeliveryMetrics;
}) {
  if (result === null) return null;
  if (definition.efficiencyMetric === "cost_per_result") {
    return result > 0 ? metrics.spend / result : null;
  }
  if (definition.efficiencyMetric === "rate") {
    return metrics.linkClicks > 0
      ? (result / metrics.linkClicks) * 100
      : null;
  }
  if (definition.efficiencyMetric === "roas") {
    return metrics.spend > 0 ? result / metrics.spend : null;
  }
  return null;
}

export function bridgeLegacyTrendPoints({
  points,
  context,
  definitions,
}: {
  points: readonly (LegacyDeliveryMetrics & {
    date: string;
    currency: string;
  })[];
  context: ReportingContext | undefined;
  definitions: readonly ResultDefinition[];
}): CanonicalResultTrendPoint[] {
  const applicable = context
    ? applicableDefinitions(definitions, context)
    : [];
  return points.map((point) => {
    const resultValues: Record<string, number | null> = {};
    const efficiencyValues: Record<string, number | null> = {};
    for (const definition of applicable) {
      const result = legacyDeliveryResultValue(
        point,
        definition.canonicalKey,
      );
      if (result === null) continue;
      resultValues[definition.canonicalKey] = result;
      efficiencyValues[definition.canonicalKey] = efficiencyValue({
        definition,
        result,
        metrics: point,
      });
    }
    return {
      date: point.date,
      currency: point.currency,
      spend: point.spend,
      resultValues,
      efficiencyValues,
    };
  });
}
