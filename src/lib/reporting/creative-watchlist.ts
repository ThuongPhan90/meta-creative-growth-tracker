import type { CreativeFatigueStatus } from "./creative-fatigue";

/**
 * Pure V3 watchlist classification and ranking.
 *
 * Rows are deliberately ranked only inside one Objective + Result + Currency
 * group. That prevents accidental cross-currency money or benchmark ordering.
 */

export type CreativeWatchlistDataStatus =
  | "ready"
  | "insufficient"
  | "missing_mapping"
  | "partial"
  | "stale";

export type CreativeWatchlistPerformanceStatus =
  | "better_than_benchmark"
  | "within_benchmark"
  | "needs_review"
  | "not_evaluable";

export type CreativeWatchlistAction =
  | "none"
  | "zero_result_delivery";

/** Sorting order is action required, monitor, insufficient data, then good. */
export type CreativeWatchlistPriorityTier =
  | "action_required"
  | "monitor"
  | "insufficient"
  | "good";

/** V5 Watchlist views. A view filters a ranked group; it never reranks it. */
export type CreativeWatchlistView =
  | "priority"
  | "action"
  | "monitor"
  | "insufficient"
  | "running"
  | "good"
  | "all";

export type CreativeWatchlistCandidate = {
  creativeId: string;
  objectiveKey: string;
  resultKey: string;
  currency: string;
  activeAds: number | null | undefined;
  spend: number | null | undefined;
  impressions: number | null | undefined;
  primaryResults: number | null | undefined;
  costPerResult: number | null | undefined;
  benchmarkCostPerResult: number | null | undefined;
  dataStatus: CreativeWatchlistDataStatus;
  fatigueStatus: CreativeFatigueStatus;
};

export type CreativeWatchlistOptions = {
  /** From the active Result definition; never guessed by this engine. */
  minimumImpressions: number;
  /** From the active Result definition; gates target performance rating. */
  minimumResults: number;
};

export type CreativeWatchlistPerformance = {
  status: CreativeWatchlistPerformanceStatus;
  benchmarkDeltaPercent: number | null;
  reasonCode:
    | "evaluated"
    | "data_not_ready"
    | "minimum_results_not_met"
    | "zero_result_delivery"
    | "cost_per_result_unavailable"
    | "benchmark_unavailable";
};

export type CreativeWatchlistItem = {
  creativeId: string;
  objectiveKey: string;
  resultKey: string;
  currency: string;
  activeAds: number | null;
  spend: number | null;
  impressions: number | null;
  primaryResults: number | null;
  costPerResult: number | null;
  benchmarkCostPerResult: number | null;
  dataStatus: CreativeWatchlistDataStatus;
  performance: CreativeWatchlistPerformance;
  fatigueStatus: CreativeFatigueStatus;
  action: CreativeWatchlistAction;
  priorityTier: CreativeWatchlistPriorityTier;
  rank: number;
};

export type CreativeWatchlistGroup = {
  objectiveKey: string;
  resultKey: string;
  currency: string;
  items: readonly CreativeWatchlistItem[];
};

const PRIORITY_SORT_ORDER: Record<CreativeWatchlistPriorityTier, number> = {
  action_required: 0,
  monitor: 1,
  insufficient: 2,
  good: 3,
};

const FATIGUE_SORT_ORDER: Record<CreativeFatigueStatus, number> = {
  fatigue_risk: 3,
  monitor: 2,
  insufficient: 1,
  stable: 0,
};

const THRESHOLD_EPSILON = 1e-9;

function finiteNonNegative(
  value: number | null | undefined,
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
    ? value
    : null;
}

function normalizedRequired(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new TypeError(`Creative Watchlist ${label} must be non-empty.`);
  }
  return normalized;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareNullableDescending(
  left: number | null,
  right: number | null,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function derivePriorityTier({
  performance,
  fatigueStatus,
  action,
}: {
  performance: CreativeWatchlistPerformanceStatus;
  fatigueStatus: CreativeFatigueStatus;
  action: CreativeWatchlistAction;
}): CreativeWatchlistPriorityTier {
  if (
    action === "zero_result_delivery" ||
    performance === "needs_review" ||
    fatigueStatus === "fatigue_risk"
  ) {
    return "action_required";
  }
  if (
    performance === "within_benchmark" ||
    fatigueStatus === "monitor"
  ) {
    return "monitor";
  }
  if (
    performance === "better_than_benchmark" &&
    fatigueStatus === "stable"
  ) {
    return "good";
  }
  return "insufficient";
}

function evaluatePerformance({
  dataStatus,
  primaryResults,
  costPerResult,
  benchmarkCostPerResult,
  minimumResults,
}: Pick<
  CreativeWatchlistCandidate,
  "dataStatus" | "primaryResults" | "costPerResult" | "benchmarkCostPerResult"
> & {
  minimumResults: number;
}): CreativeWatchlistPerformance {
  if (dataStatus !== "ready") {
    return {
      status: "not_evaluable",
      benchmarkDeltaPercent: null,
      reasonCode: "data_not_ready",
    };
  }

  const results = finiteNonNegative(primaryResults);
  if (results === null || results < minimumResults) {
    return {
      status: "not_evaluable",
      benchmarkDeltaPercent: null,
      reasonCode: "minimum_results_not_met",
    };
  }

  const cost = finiteNonNegative(costPerResult);
  if (cost === null) {
    return {
      status: "not_evaluable",
      benchmarkDeltaPercent: null,
      reasonCode: "cost_per_result_unavailable",
    };
  }

  const benchmark = finiteNonNegative(benchmarkCostPerResult);
  if (benchmark === null || benchmark <= 0) {
    return {
      status: "not_evaluable",
      benchmarkDeltaPercent: null,
      reasonCode: "benchmark_unavailable",
    };
  }

  const benchmarkDeltaPercent = ((cost - benchmark) / benchmark) * 100;
  return {
    status:
      benchmarkDeltaPercent <= -20 + THRESHOLD_EPSILON
        ? "better_than_benchmark"
        : benchmarkDeltaPercent <= 20 + THRESHOLD_EPSILON
          ? "within_benchmark"
          : "needs_review",
    benchmarkDeltaPercent,
    reasonCode: "evaluated",
  };
}

function zeroResultAction({
  dataStatus,
  activeAds,
  impressions,
  primaryResults,
  minimumImpressions,
}: {
  dataStatus: CreativeWatchlistDataStatus;
  activeAds: number | null;
  impressions: number | null;
  primaryResults: number | null;
  minimumImpressions: number;
}): CreativeWatchlistAction {
  return dataStatus === "ready" &&
    activeAds !== null &&
    activeAds > 0 &&
    impressions !== null &&
    impressions >= minimumImpressions &&
    primaryResults === 0
    ? "zero_result_delivery"
    : "none";
}

/**
 * Separates data, performance and fatigue states for one Creative. Benchmark
 * status is intentionally unavailable unless the data is `ready`; partial or
 * stale data cannot be colored as good/bad performance.
 */
export function evaluateCreativeWatchlistItem(
  candidate: CreativeWatchlistCandidate,
  options: CreativeWatchlistOptions,
): Omit<CreativeWatchlistItem, "rank"> {
  const creativeId = normalizedRequired(candidate.creativeId, "creative ID");
  const objectiveKey = normalizedRequired(
    candidate.objectiveKey,
    "objective key",
  );
  const resultKey = normalizedRequired(candidate.resultKey, "result key");
  const currency = normalizedRequired(
    candidate.currency,
    "currency",
  ).toUpperCase();
  const minimumImpressions = finiteNonNegative(options.minimumImpressions);
  const minimumResults = finiteNonNegative(options.minimumResults);

  if (minimumImpressions === null) {
    throw new TypeError(
      "Creative Watchlist minimum impressions must be a non-negative number.",
    );
  }
  if (minimumResults === null) {
    throw new TypeError(
      "Creative Watchlist minimum results must be a non-negative number.",
    );
  }

  const activeAds = finiteNonNegative(candidate.activeAds);
  const spend = finiteNonNegative(candidate.spend);
  const impressions = finiteNonNegative(candidate.impressions);
  const primaryResults = finiteNonNegative(candidate.primaryResults);
  const costPerResult = finiteNonNegative(candidate.costPerResult);
  const benchmarkCostPerResult = finiteNonNegative(
    candidate.benchmarkCostPerResult,
  );
  const action = zeroResultAction({
    dataStatus: candidate.dataStatus,
    activeAds,
    impressions,
    primaryResults,
    minimumImpressions,
  });
  const performance =
    action === "zero_result_delivery"
      ? {
          status: "not_evaluable" as const,
          benchmarkDeltaPercent: null,
          reasonCode: "zero_result_delivery" as const,
        }
      : evaluatePerformance({
          dataStatus: candidate.dataStatus,
          primaryResults,
          costPerResult,
          benchmarkCostPerResult,
          minimumResults,
        });
  const priorityTier = derivePriorityTier({
    performance: performance.status,
    fatigueStatus: candidate.fatigueStatus,
    action,
  });

  return {
    creativeId,
    objectiveKey,
    resultKey,
    currency,
    activeAds,
    spend,
    impressions,
    primaryResults,
    costPerResult,
    benchmarkCostPerResult,
    dataStatus: candidate.dataStatus,
    performance,
    fatigueStatus: candidate.fatigueStatus,
    action,
    priorityTier,
  };
}

function compareWatchlistItems(
  left: Omit<CreativeWatchlistItem, "rank">,
  right: Omit<CreativeWatchlistItem, "rank">,
): number {
  const priority =
    PRIORITY_SORT_ORDER[left.priorityTier] -
    PRIORITY_SORT_ORDER[right.priorityTier];
  if (priority !== 0) return priority;

  const activeAds = compareNullableDescending(
    left.activeAds,
    right.activeAds,
  );
  if (activeAds !== 0) return activeAds;

  const spend = compareNullableDescending(left.spend, right.spend);
  if (spend !== 0) return spend;

  // Cost/Result above benchmark is worse, so a larger delta ranks first.
  const benchmarkDelta = compareNullableDescending(
    left.performance.benchmarkDeltaPercent,
    right.performance.benchmarkDeltaPercent,
  );
  if (benchmarkDelta !== 0) return benchmarkDelta;

  const fatigue =
    FATIGUE_SORT_ORDER[right.fatigueStatus] -
    FATIGUE_SORT_ORDER[left.fatigueStatus];
  if (fatigue !== 0) return fatigue;

  return compareText(left.creativeId, right.creativeId);
}

function groupKey(item: Omit<CreativeWatchlistItem, "rank">): string {
  return [item.objectiveKey, item.resultKey, item.currency].join("\u001f");
}

/**
 * Preserves the engine's group-local ranking while selecting one V5 view.
 * "running" deliberately reflects live active Ads and may overlap other
 * operational views; all other views are mutually exclusive priority tiers.
 */
export function filterCreativeWatchlist<T extends CreativeWatchlistItem>(
  items: readonly T[],
  view: CreativeWatchlistView,
): readonly T[] {
  if (view === "all") return items;
  if (view === "priority") {
    return items.filter(
      (item) =>
        item.priorityTier === "action_required" ||
        item.priorityTier === "monitor",
    );
  }
  if (view === "running") {
    return items.filter((item) => (item.activeAds ?? 0) > 0);
  }
  const priorityByView: Record<
    Exclude<CreativeWatchlistView, "priority" | "running" | "all">,
    CreativeWatchlistPriorityTier
  > = {
    action: "action_required",
    monitor: "monitor",
    insufficient: "insufficient",
    good: "good",
  };
  return items.filter((item) => item.priorityTier === priorityByView[view]);
}

/**
 * Evaluates and ranks every row without producing a cross-group global rank.
 * The returned groups may be independently rendered or filtered by the UI.
 */
export function buildCreativeWatchlist(
  candidates: readonly CreativeWatchlistCandidate[],
  options: CreativeWatchlistOptions,
): readonly CreativeWatchlistGroup[] {
  const groups = new Map<
    string,
    Omit<CreativeWatchlistGroup, "items"> & {
      items: Array<Omit<CreativeWatchlistItem, "rank">>;
    }
  >();

  for (const candidate of candidates) {
    const item = evaluateCreativeWatchlistItem(candidate, options);
    const key = groupKey(item);
    const group = groups.get(key) ?? {
      objectiveKey: item.objectiveKey,
      resultKey: item.resultKey,
      currency: item.currency,
      items: [],
    };
    group.items.push(item);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: group.items
        .sort(compareWatchlistItems)
        .map((item, index) => ({ ...item, rank: index + 1 })),
    }))
    .sort((left, right) => {
      const objective = compareText(left.objectiveKey, right.objectiveKey);
      if (objective !== 0) return objective;
      const result = compareText(left.resultKey, right.resultKey);
      if (result !== 0) return result;
      return compareText(left.currency, right.currency);
    });
}
