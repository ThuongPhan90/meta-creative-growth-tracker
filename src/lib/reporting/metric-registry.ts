import { DEFAULT_OBJECTIVE_REGISTRY } from "./objective-registry";

/**
 * A MetricState describes whether a value can be safely presented, not whether
 * the underlying Meta query completed. In particular, `zero` is reserved for
 * a verified numeric zero and must never stand in for missing or partial data.
 */
export type MetricState = "ready" | "zero" | "partial" | "unavailable";

export type MetricSource =
  | "meta_delivery"
  | "meta_attributed_action"
  | "meta_attributed_value";

export type MetricUnit = "currency" | "count" | "percent" | "ratio";

export type MetricFormatter =
  | "currency"
  | "integer"
  | "decimal"
  | "percent";

export type MetricKind = "delivery" | "result";

/**
 * Semantic direction used for comparisons. A positive numeric delta is not
 * automatically positive product performance: costs are better when they go
 * down, while delivery volume is intentionally neutral by default.
 */
export type MetricDirection =
  | "higher_is_better"
  | "lower_is_better"
  | "neutral";

export type MetricRequiredField =
  | "spend"
  | "impressions"
  | "link_clicks"
  | "exact_period_reach"
  | "primary_result"
  | "purchase_value"
  | "video_3s_views"
  | "thruplay"
  | "video_100_views";

export type MetricKey =
  | "spend"
  | "impressions"
  | "link_clicks"
  | "link_ctr"
  | "link_cpc"
  | "cpm"
  | "reach"
  | "frequency"
  | "primary_result"
  | "cost_per_result"
  | "purchase_value"
  | "meta_roas"
  | "video_3s_views"
  | "hook_rate"
  | "thruplay"
  | "cost_per_thruplay"
  | "completion_per_3s";

export type MetricCoverage = {
  includedAccounts: number;
  selectedAccounts: number;
};

/**
 * The final metric payload is intentionally independent from a component.
 * A UI can format it without inferring a formula, source, or availability.
 */
export type MetricValue = {
  value: number | null;
  state: MetricState;
  reasonCode?: string;
  formula: string;
  source: MetricSource;
  coverage?: MetricCoverage;
  dataThrough?: string | null;
};

export type MetricDefinition = {
  key: MetricKey;
  kind: MetricKind;
  label: string;
  source: MetricSource;
  formula: string;
  unit: MetricUnit;
  formatter: MetricFormatter;
  direction: MetricDirection;
  requiredFields: readonly MetricRequiredField[];
  denominator: MetricRequiredField | null;
  /**
   * Canonical objectives supported by this metric. `all` is governed
   * separately because a metric can be valid for every objective yet unsafe
   * to aggregate across all objectives.
   */
  eligibleObjectiveKeys: readonly string[];
  eligibleResultKeys: readonly string[];
  allowAllObjectives: boolean;
  requiresPrimaryResult: boolean;
  requiresSingleCurrency: boolean;
  defaultObjectiveKeys: readonly (string | "all")[];
};

export type MetricEligibilityContext = {
  objectiveKey?: string | null;
  primaryResultKey?: string | null;
};

export type MetricEligibilityReasonCode =
  | "OBJECTIVE_NOT_ELIGIBLE"
  | "PRIMARY_RESULT_REQUIRED"
  | "PRIMARY_RESULT_NOT_ELIGIBLE";

export type MetricEligibility =
  | { eligible: true }
  | { eligible: false; reasonCode: MetricEligibilityReasonCode };

const ALL_OBJECTIVE_KEYS = DEFAULT_OBJECTIVE_REGISTRY.map(
  (objective) => objective.key,
);

const ALL_OBJECTIVES_AND_ALL = ["all", ...ALL_OBJECTIVE_KEYS] as const;

/**
 * Product-level metric catalog. Values are not computed here: this registry
 * describes the required fields and semantic constraints that a reporting
 * read model must satisfy before a metric is presented.
 */
export const METRIC_REGISTRY: readonly MetricDefinition[] = [
  {
    key: "spend",
    kind: "delivery",
    label: "Chi tiêu",
    source: "meta_delivery",
    formula: "Σ spend",
    unit: "currency",
    formatter: "currency",
    direction: "neutral",
    requiredFields: ["spend"],
    denominator: null,
    eligibleObjectiveKeys: ALL_OBJECTIVE_KEYS,
    eligibleResultKeys: [],
    allowAllObjectives: true,
    requiresPrimaryResult: false,
    requiresSingleCurrency: true,
    defaultObjectiveKeys: ALL_OBJECTIVES_AND_ALL,
  },
  {
    key: "impressions",
    kind: "delivery",
    label: "Impressions",
    source: "meta_delivery",
    formula: "Σ impressions",
    unit: "count",
    formatter: "integer",
    direction: "neutral",
    requiredFields: ["impressions"],
    denominator: null,
    eligibleObjectiveKeys: ALL_OBJECTIVE_KEYS,
    eligibleResultKeys: [],
    allowAllObjectives: true,
    requiresPrimaryResult: false,
    requiresSingleCurrency: false,
    defaultObjectiveKeys: ["all", "awareness"],
  },
  {
    key: "link_clicks",
    kind: "delivery",
    label: "Link Clicks",
    source: "meta_delivery",
    formula: "Σ link_clicks",
    unit: "count",
    formatter: "integer",
    direction: "higher_is_better",
    requiredFields: ["link_clicks"],
    denominator: null,
    eligibleObjectiveKeys: ALL_OBJECTIVE_KEYS,
    eligibleResultKeys: [],
    allowAllObjectives: true,
    requiresPrimaryResult: false,
    requiresSingleCurrency: false,
    defaultObjectiveKeys: ["all"],
  },
  {
    key: "link_ctr",
    kind: "delivery",
    label: "CTR (Link)",
    source: "meta_delivery",
    formula: "Σ link_clicks / Σ impressions × 100",
    unit: "percent",
    formatter: "percent",
    direction: "higher_is_better",
    requiredFields: ["link_clicks", "impressions"],
    denominator: "impressions",
    eligibleObjectiveKeys: ALL_OBJECTIVE_KEYS,
    eligibleResultKeys: [],
    allowAllObjectives: true,
    requiresPrimaryResult: false,
    requiresSingleCurrency: false,
    defaultObjectiveKeys: ["all", "traffic", "engagement", "leads"],
  },
  {
    key: "link_cpc",
    kind: "delivery",
    label: "CPC (Link)",
    source: "meta_delivery",
    formula: "Σ spend / Σ link_clicks",
    unit: "currency",
    formatter: "currency",
    direction: "lower_is_better",
    requiredFields: ["spend", "link_clicks"],
    denominator: "link_clicks",
    eligibleObjectiveKeys: ALL_OBJECTIVE_KEYS,
    eligibleResultKeys: [],
    allowAllObjectives: true,
    requiresPrimaryResult: false,
    requiresSingleCurrency: true,
    defaultObjectiveKeys: [],
  },
  {
    key: "cpm",
    kind: "delivery",
    label: "CPM",
    source: "meta_delivery",
    formula: "Σ spend / Σ impressions × 1.000",
    unit: "currency",
    formatter: "currency",
    direction: "neutral",
    requiredFields: ["spend", "impressions"],
    denominator: "impressions",
    eligibleObjectiveKeys: ALL_OBJECTIVE_KEYS,
    eligibleResultKeys: [],
    allowAllObjectives: true,
    requiresPrimaryResult: false,
    requiresSingleCurrency: true,
    defaultObjectiveKeys: ["awareness"],
  },
  {
    key: "reach",
    kind: "delivery",
    label: "Reach",
    source: "meta_delivery",
    formula: "Meta exact-period Reach đúng scope/query grain",
    unit: "count",
    formatter: "integer",
    direction: "neutral",
    requiredFields: ["exact_period_reach"],
    denominator: null,
    eligibleObjectiveKeys: ALL_OBJECTIVE_KEYS,
    eligibleResultKeys: [],
    allowAllObjectives: true,
    requiresPrimaryResult: false,
    requiresSingleCurrency: false,
    defaultObjectiveKeys: ["awareness"],
  },
  {
    key: "frequency",
    kind: "delivery",
    label: "Frequency",
    source: "meta_delivery",
    formula: "Σ impressions / exact-period Reach",
    unit: "ratio",
    formatter: "decimal",
    direction: "neutral",
    requiredFields: ["impressions", "exact_period_reach"],
    denominator: "exact_period_reach",
    eligibleObjectiveKeys: ALL_OBJECTIVE_KEYS,
    eligibleResultKeys: [],
    allowAllObjectives: true,
    requiresPrimaryResult: false,
    requiresSingleCurrency: false,
    defaultObjectiveKeys: ["awareness"],
  },
  {
    key: "primary_result",
    kind: "result",
    label: "Kết quả chính",
    source: "meta_attributed_action",
    formula: "Tổng canonical result đã mapping theo rule ưu tiên",
    unit: "count",
    formatter: "integer",
    direction: "higher_is_better",
    requiredFields: ["primary_result"],
    denominator: null,
    eligibleObjectiveKeys: ALL_OBJECTIVE_KEYS,
    eligibleResultKeys: [],
    allowAllObjectives: false,
    requiresPrimaryResult: true,
    requiresSingleCurrency: false,
    defaultObjectiveKeys: [
      "traffic",
      "engagement",
      "leads",
      "app_promotion",
      "sales",
    ],
  },
  {
    key: "cost_per_result",
    kind: "result",
    label: "Chi phí/Kết quả",
    source: "meta_attributed_action",
    formula: "Σ spend / Primary Result",
    unit: "currency",
    formatter: "currency",
    direction: "lower_is_better",
    requiredFields: ["spend", "primary_result"],
    denominator: "primary_result",
    eligibleObjectiveKeys: ALL_OBJECTIVE_KEYS,
    eligibleResultKeys: [],
    allowAllObjectives: false,
    requiresPrimaryResult: true,
    requiresSingleCurrency: true,
    defaultObjectiveKeys: [
      "traffic",
      "engagement",
      "leads",
      "app_promotion",
      "sales",
    ],
  },
  {
    key: "purchase_value",
    kind: "result",
    label: "Giá trị mua hàng (Meta)",
    source: "meta_attributed_value",
    formula: "Tổng action value của Purchase alias được chọn",
    unit: "currency",
    formatter: "currency",
    direction: "higher_is_better",
    requiredFields: ["purchase_value"],
    denominator: null,
    eligibleObjectiveKeys: ["sales"],
    eligibleResultKeys: ["purchase", "purchase_value"],
    allowAllObjectives: false,
    requiresPrimaryResult: true,
    requiresSingleCurrency: true,
    defaultObjectiveKeys: [],
  },
  {
    key: "meta_roas",
    kind: "result",
    label: "ROAS (Meta)",
    source: "meta_attributed_value",
    formula: "Purchase Value (Meta) / Σ spend",
    unit: "ratio",
    formatter: "decimal",
    direction: "higher_is_better",
    requiredFields: ["purchase_value", "spend"],
    denominator: "spend",
    eligibleObjectiveKeys: ["sales"],
    eligibleResultKeys: ["purchase", "purchase_value"],
    allowAllObjectives: false,
    requiresPrimaryResult: true,
    requiresSingleCurrency: true,
    defaultObjectiveKeys: ["sales"],
  },
  {
    key: "video_3s_views",
    kind: "result",
    label: "Video Views 3 giây",
    source: "meta_attributed_action",
    formula: "Σ selected video_view action",
    unit: "count",
    formatter: "integer",
    direction: "higher_is_better",
    requiredFields: ["video_3s_views"],
    denominator: null,
    eligibleObjectiveKeys: ["awareness", "engagement"],
    eligibleResultKeys: [],
    allowAllObjectives: false,
    requiresPrimaryResult: false,
    requiresSingleCurrency: false,
    defaultObjectiveKeys: [],
  },
  {
    key: "hook_rate",
    kind: "result",
    label: "Hook Rate",
    source: "meta_attributed_action",
    formula: "3s Views / Σ impressions × 100",
    unit: "percent",
    formatter: "percent",
    direction: "higher_is_better",
    requiredFields: ["video_3s_views", "impressions"],
    denominator: "impressions",
    eligibleObjectiveKeys: ["awareness", "engagement"],
    eligibleResultKeys: [],
    allowAllObjectives: false,
    requiresPrimaryResult: false,
    requiresSingleCurrency: false,
    defaultObjectiveKeys: [],
  },
  {
    key: "thruplay",
    kind: "result",
    label: "ThruPlay",
    source: "meta_attributed_action",
    formula: "Σ selected ThruPlay action",
    unit: "count",
    formatter: "integer",
    direction: "higher_is_better",
    requiredFields: ["thruplay"],
    denominator: null,
    eligibleObjectiveKeys: ["awareness", "engagement"],
    eligibleResultKeys: [],
    allowAllObjectives: false,
    requiresPrimaryResult: false,
    requiresSingleCurrency: false,
    defaultObjectiveKeys: [],
  },
  {
    key: "cost_per_thruplay",
    kind: "result",
    label: "Chi phí/ThruPlay",
    source: "meta_attributed_action",
    formula: "Σ spend / ThruPlay",
    unit: "currency",
    formatter: "currency",
    direction: "lower_is_better",
    requiredFields: ["spend", "thruplay"],
    denominator: "thruplay",
    eligibleObjectiveKeys: ["awareness", "engagement"],
    eligibleResultKeys: [],
    allowAllObjectives: false,
    requiresPrimaryResult: false,
    requiresSingleCurrency: true,
    defaultObjectiveKeys: [],
  },
  {
    key: "completion_per_3s",
    kind: "result",
    label: "Completion / 3s",
    source: "meta_attributed_action",
    formula: "100% Video Views / 3s Views × 100",
    unit: "percent",
    formatter: "percent",
    direction: "higher_is_better",
    requiredFields: ["video_100_views", "video_3s_views"],
    denominator: "video_3s_views",
    eligibleObjectiveKeys: ["awareness", "engagement"],
    eligibleResultKeys: [],
    allowAllObjectives: false,
    requiresPrimaryResult: false,
    requiresSingleCurrency: false,
    defaultObjectiveKeys: [],
  },
];

function normalizedKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function getMetricDefinition(
  key: string,
  registry: readonly MetricDefinition[] = METRIC_REGISTRY,
): MetricDefinition | null {
  const normalized = normalizedKey(key);
  return registry.find((metric) => metric.key === normalized) ?? null;
}

/**
 * Resolve selectability before a metric card is created. This is deliberately
 * separate from value availability, which can still fail for a valid metric
 * when a reporting read is partial or has no denominator.
 */
export function resolveMetricEligibility(
  definition: MetricDefinition,
  context: MetricEligibilityContext = {},
): MetricEligibility {
  const objectiveKey = normalizedKey(context.objectiveKey) || "all";
  const primaryResultKey = normalizedKey(context.primaryResultKey);

  if (
    objectiveKey === "all"
      ? !definition.allowAllObjectives
      : !definition.eligibleObjectiveKeys.includes(objectiveKey)
  ) {
    return { eligible: false, reasonCode: "OBJECTIVE_NOT_ELIGIBLE" };
  }

  if (definition.requiresPrimaryResult && !primaryResultKey) {
    return { eligible: false, reasonCode: "PRIMARY_RESULT_REQUIRED" };
  }

  if (
    definition.eligibleResultKeys.length > 0 &&
    !definition.eligibleResultKeys.includes(primaryResultKey)
  ) {
    return {
      eligible: false,
      reasonCode: "PRIMARY_RESULT_NOT_ELIGIBLE",
    };
  }

  return { eligible: true };
}

export function defaultMetricKeysForObjective(
  objectiveKey: string | null | undefined,
  registry: readonly MetricDefinition[] = METRIC_REGISTRY,
): MetricKey[] {
  const normalized = normalizedKey(objectiveKey) || "all";
  return registry
    .filter((metric) => metric.defaultObjectiveKeys.includes(normalized))
    .map((metric) => metric.key);
}
