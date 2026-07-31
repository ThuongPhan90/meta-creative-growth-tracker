export type BenchmarkDirection =
  | "lower_is_better"
  | "higher_is_better";

export type BenchmarkAggregationMethod =
  | "cost_per_result"
  | "weighted_mean";

export type BenchmarkPeerGroupMethod =
  | "exact"
  | "account_objective_result_format"
  | "account_objective_result"
  | "selected_business_objective_result_format"
  | "selected_scope_objective_result"
  | "none";

type ComparableBenchmarkMethod = Exclude<
  BenchmarkPeerGroupMethod,
  "none"
>;

export type BenchmarkReason =
  | "exact_peer_group_sufficient"
  | "exact_peer_group_insufficient"
  | "account_format_peer_group_insufficient"
  | "account_result_peer_group_insufficient"
  | "business_format_peer_group_insufficient"
  | "insufficient_comparable_sample"
  | "no_aggregatable_value";

export type BenchmarkMetricDefinition = {
  metricKey: string;
  direction: BenchmarkDirection;
  aggregation: BenchmarkAggregationMethod;
};

/**
 * One row may represent a day, placement or other additive slice. sampleKey
 * identifies the peer Creative so sample size is not inflated by those rows.
 */
export type BenchmarkObservation = {
  sampleKey: string;
  adAccountId: string;
  businessId?: string | null;
  objectiveKey: string;
  resultKey: string;
  format: string;
  currency: string;
  spend?: number | null;
  results?: number | null;
  value?: number | null;
  weight?: number | null;
};

export type BenchmarkTarget = {
  sampleKey?: string | null;
  adAccountId: string;
  selectedBusinessIds: readonly string[];
  selectedAdAccountIds: readonly string[];
  objectiveKey: string;
  resultKey: string;
  format: string;
  currency: string;
  labels?: {
    adAccount?: string;
    selectedBusiness?: string;
    selectedScope?: string;
    objective?: string;
    result?: string;
    format?: string;
  };
};

/**
 * The exact pool can be narrower than the default account/format pool (for
 * example when the caller has a sufficiently large placement/device cohort).
 * Every pool is still validated against Objective, Result and Currency here.
 */
export type BenchmarkCandidatePools = Partial<
  Record<ComparableBenchmarkMethod, readonly BenchmarkObservation[]>
>;

export type BenchmarkSelection = {
  label: string;
  sampleSize: number;
  value: number | null;
  method: BenchmarkPeerGroupMethod;
  reason: BenchmarkReason;
  metricKey: string;
  direction: BenchmarkDirection;
  aggregation: BenchmarkAggregationMethod;
};

export type SelectBenchmarkInput = {
  target: BenchmarkTarget;
  metric: BenchmarkMetricDefinition;
  candidatePools: BenchmarkCandidatePools;
  minimumSampleSize: number;
};

const BENCHMARK_METHOD_ORDER: readonly ComparableBenchmarkMethod[] = [
  "exact",
  "account_objective_result_format",
  "account_objective_result",
  "selected_business_objective_result_format",
  "selected_scope_objective_result",
];

const SUCCESS_REASONS: Record<
  ComparableBenchmarkMethod,
  BenchmarkReason
> = {
  exact: "exact_peer_group_sufficient",
  account_objective_result_format:
    "exact_peer_group_insufficient",
  account_objective_result:
    "account_format_peer_group_insufficient",
  selected_business_objective_result_format:
    "account_result_peer_group_insufficient",
  selected_scope_objective_result:
    "business_format_peer_group_insufficient",
};

function normalized(value: string): string {
  return value.trim();
}

function normalizedCurrency(value: string): string {
  return normalized(value).toUpperCase();
}

function finiteNonNegative(
  value: number | null | undefined,
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
    ? value
    : null;
}

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function requiredTargetDimensions(target: BenchmarkTarget): string[] {
  return [
    target.adAccountId,
    target.objectiveKey,
    target.resultKey,
    target.format,
    target.currency,
  ].map(normalized);
}

function comparableInvariant(
  observation: BenchmarkObservation,
  target: BenchmarkTarget,
): boolean {
  return (
    normalized(observation.objectiveKey) ===
      normalized(target.objectiveKey) &&
    normalized(observation.resultKey) === normalized(target.resultKey) &&
    normalizedCurrency(observation.currency) ===
      normalizedCurrency(target.currency) &&
    normalized(observation.sampleKey) !==
      normalized(target.sampleKey ?? "")
  );
}

function methodMatches(
  observation: BenchmarkObservation,
  target: BenchmarkTarget,
  method: ComparableBenchmarkMethod,
): boolean {
  if (!comparableInvariant(observation, target)) return false;

  const accountMatches =
    normalized(observation.adAccountId) ===
    normalized(target.adAccountId);
  const formatMatches =
    normalized(observation.format) === normalized(target.format);

  if (
    method === "exact" ||
    method === "account_objective_result_format"
  ) {
    return accountMatches && formatMatches;
  }
  if (method === "account_objective_result") {
    return accountMatches;
  }
  if (method === "selected_business_objective_result_format") {
    const selectedBusinessIds = new Set(
      target.selectedBusinessIds.map(normalized).filter(Boolean),
    );
    return (
      !!observation.businessId &&
      selectedBusinessIds.has(normalized(observation.businessId)) &&
      formatMatches
    );
  }

  const selectedAdAccountIds = new Set(
    target.selectedAdAccountIds.map(normalized).filter(Boolean),
  );
  return selectedAdAccountIds.has(
    normalized(observation.adAccountId),
  );
}

function aggregate(
  observations: readonly BenchmarkObservation[],
  method: BenchmarkAggregationMethod,
): { sampleSize: number; value: number | null } {
  const sampleKeys = new Set<string>();

  if (method === "cost_per_result") {
    let totalSpend = 0;
    let totalResults = 0;
    for (const observation of observations) {
      const spend = finiteNonNegative(observation.spend);
      const results = finiteNonNegative(observation.results);
      const sampleKey = normalized(observation.sampleKey);
      if (!sampleKey || spend === null || results === null) continue;
      sampleKeys.add(sampleKey);
      totalSpend += spend;
      totalResults += results;
    }
    return {
      sampleSize: sampleKeys.size,
      value: totalResults > 0 ? totalSpend / totalResults : null,
    };
  }

  let weightedTotal = 0;
  let totalWeight = 0;
  for (const observation of observations) {
    const value = finite(observation.value);
    const weight = finiteNonNegative(observation.weight);
    const sampleKey = normalized(observation.sampleKey);
    if (
      !sampleKey ||
      value === null ||
      weight === null ||
      weight === 0
    ) {
      continue;
    }
    sampleKeys.add(sampleKey);
    weightedTotal += value * weight;
    totalWeight += weight;
  }
  return {
    sampleSize: sampleKeys.size,
    value: totalWeight > 0 ? weightedTotal / totalWeight : null,
  };
}

function peerGroupLabel(
  target: BenchmarkTarget,
  method: ComparableBenchmarkMethod,
): string {
  const labels = target.labels ?? {};
  const account = normalized(labels.adAccount ?? target.adAccountId);
  const business = normalized(
    labels.selectedBusiness ?? "Selected Business",
  );
  const scope = normalized(labels.selectedScope ?? "Selected Scope");
  const objective = normalized(
    labels.objective ?? target.objectiveKey,
  );
  const result = normalized(labels.result ?? target.resultKey);
  const format = normalized(labels.format ?? target.format);
  const currency = normalizedCurrency(target.currency);

  if (
    method === "exact" ||
    method === "account_objective_result_format"
  ) {
    return [account, objective, result, format, currency].join(
      " · ",
    );
  }
  if (method === "account_objective_result") {
    return [account, objective, result, currency].join(" · ");
  }
  if (method === "selected_business_objective_result_format") {
    return [business, objective, result, format, currency].join(
      " · ",
    );
  }
  return [scope, objective, result, currency].join(" · ");
}

/**
 * Selects the first sufficiently large comparable peer group. Objective,
 * Result and Currency are immutable invariants at every fallback tier.
 */
export function selectBenchmark({
  target,
  metric,
  candidatePools,
  minimumSampleSize,
}: SelectBenchmarkInput): BenchmarkSelection {
  if (
    requiredTargetDimensions(target).some((dimension) => !dimension)
  ) {
    throw new TypeError(
      "Benchmark target dimensions must be non-empty.",
    );
  }
  if (!normalized(metric.metricKey)) {
    throw new TypeError("Benchmark metric key must be non-empty.");
  }

  const requiredSamples = Math.max(
    1,
    Math.floor(
      Number.isFinite(minimumSampleSize) ? minimumSampleSize : 1,
    ),
  );
  let largestSampleSize = 0;
  let hadSufficientButUnaggregatableGroup = false;

  for (const method of BENCHMARK_METHOD_ORDER) {
    const observations = (candidatePools[method] ?? []).filter(
      (observation) => methodMatches(observation, target, method),
    );
    const aggregated = aggregate(observations, metric.aggregation);
    largestSampleSize = Math.max(
      largestSampleSize,
      aggregated.sampleSize,
    );
    if (
      aggregated.sampleSize >= requiredSamples &&
      aggregated.value !== null
    ) {
      return {
        label: peerGroupLabel(target, method),
        sampleSize: aggregated.sampleSize,
        value: aggregated.value,
        method,
        reason: SUCCESS_REASONS[method],
        metricKey: normalized(metric.metricKey),
        direction: metric.direction,
        aggregation: metric.aggregation,
      };
    }
    if (
      aggregated.sampleSize >= requiredSamples &&
      aggregated.value === null
    ) {
      hadSufficientButUnaggregatableGroup = true;
    }
  }

  return {
    label: "Chưa đủ mẫu so sánh",
    sampleSize: largestSampleSize,
    value: null,
    method: "none",
    reason: hadSufficientButUnaggregatableGroup
      ? "no_aggregatable_value"
      : "insufficient_comparable_sample",
    metricKey: normalized(metric.metricKey),
    direction: metric.direction,
    aggregation: metric.aggregation,
  };
}
