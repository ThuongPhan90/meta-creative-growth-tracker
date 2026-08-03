import {
  resolveMetricEligibility,
  type MetricCoverage,
  type MetricDefinition,
  type MetricEligibilityContext,
  type MetricState,
  type MetricValue,
} from "./metric-registry";

export type MetricDataState = Exclude<MetricState, "zero">;

export type MetricAvailabilityInput = MetricEligibilityContext & {
  value: number | null | undefined;
  denominator?: number | null | undefined;
  dataState?: MetricDataState;
  currencyMode?: "single" | "split";
  coverage?: MetricCoverage;
  dataThrough?: string | null;
  /**
   * A partial value is hidden by default because it is unsafe to treat as a
   * complete total. Callers may opt in only when their UI explicitly labels
   * the value as partial.
   */
  partialValueIsUsable?: boolean;
};

export type MetricAvailabilityReasonCode =
  | "OBJECTIVE_NOT_ELIGIBLE"
  | "PRIMARY_RESULT_REQUIRED"
  | "PRIMARY_RESULT_NOT_ELIGIBLE"
  | "DATA_UNAVAILABLE"
  | "PARTIAL_DATA"
  | "SPLIT_CURRENCY"
  | "MISSING_DENOMINATOR"
  | "INVALID_VALUE";

function metricValue(
  definition: MetricDefinition,
  input: MetricAvailabilityInput,
  value: number | null,
  state: MetricState,
  reasonCode?: MetricAvailabilityReasonCode,
): MetricValue {
  return {
    value,
    state,
    ...(reasonCode ? { reasonCode } : {}),
    formula: definition.formula,
    source: definition.source,
    ...(input.coverage ? { coverage: input.coverage } : {}),
    ...(input.dataThrough !== undefined
      ? { dataThrough: input.dataThrough }
      : {}),
  };
}

function hasPartialCoverage(coverage: MetricCoverage | undefined) {
  return Boolean(
    coverage &&
      coverage.selectedAccounts > 0 &&
      coverage.includedAccounts < coverage.selectedAccounts,
  );
}

function resolvedDataState(input: MetricAvailabilityInput): MetricDataState {
  if (input.dataState) return input.dataState;
  return hasPartialCoverage(input.coverage) ? "partial" : "ready";
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Converts a computed metric into the presentation-safe MetricValue contract.
 * It never invents a zero for a missing, partial, mixed-currency, or
 * denominator-less aggregate.
 */
export function resolveMetricAvailability(
  definition: MetricDefinition,
  input: MetricAvailabilityInput,
): MetricValue {
  const eligibility = resolveMetricEligibility(definition, input);
  if (!eligibility.eligible) {
    return metricValue(
      definition,
      input,
      null,
      "unavailable",
      eligibility.reasonCode,
    );
  }

  if (definition.requiresSingleCurrency && input.currencyMode === "split") {
    return metricValue(
      definition,
      input,
      null,
      "unavailable",
      "SPLIT_CURRENCY",
    );
  }

  const dataState = resolvedDataState(input);
  if (dataState === "unavailable") {
    return metricValue(
      definition,
      input,
      null,
      "unavailable",
      "DATA_UNAVAILABLE",
    );
  }

  if (!isFiniteNumber(input.value)) {
    return metricValue(
      definition,
      input,
      null,
      "unavailable",
      input.value === null || input.value === undefined
        ? "DATA_UNAVAILABLE"
        : "INVALID_VALUE",
    );
  }

  if (dataState === "partial" && !input.partialValueIsUsable) {
    return metricValue(
      definition,
      input,
      null,
      "partial",
      "PARTIAL_DATA",
    );
  }

  if (
    definition.denominator !== null &&
    (!isFiniteNumber(input.denominator) || input.denominator <= 0)
  ) {
    return metricValue(
      definition,
      input,
      null,
      "unavailable",
      "MISSING_DENOMINATOR",
    );
  }

  if (dataState === "partial") {
    return metricValue(definition, input, input.value, "partial", "PARTIAL_DATA");
  }

  return metricValue(
    definition,
    input,
    input.value,
    input.value === 0 ? "zero" : "ready",
  );
}
