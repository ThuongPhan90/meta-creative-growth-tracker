import {
  getMetricDefinition,
  resolveMetricEligibility,
  type MetricCoverage,
  type MetricDirection,
  type MetricSource,
  type MetricState,
} from "./metric-registry";
import {
  DEFAULT_RESULT_DEFINITIONS,
  type ResultDefinition,
} from "./result-definition";
import { DEFAULT_OBJECTIVE_REGISTRY } from "./objective-registry";
import type {
  DynamicResultMetricsModel,
  ResultKpiCard,
  ResultMetricAttribution,
  ResultMetricValueType,
} from "./result-metrics";

export const METRIC_DISPLAY_PRESET_VERSION = 1 as const;
export const MAX_DISPLAY_METRICS = 6;
export const MAX_METRIC_PRESETS = 48;

/**
 * Delivery metrics use a canonical `delivery:` identity in persisted data,
 * while the short key remains available to existing V2/V3 UI consumers.
 */
export const DELIVERY_METRIC_KEYS = [
  "spend",
  "impressions",
  "link_clicks",
  "link_ctr",
  "link_cpc",
  "cpm",
  "reach",
  "frequency",
] as const;

export type DeliveryMetricKey = (typeof DELIVERY_METRIC_KEYS)[number];
export type DisplayMetricKey =
  | DeliveryMetricKey
  | `result:${string}`
  | `efficiency:${string}`;
export type DisplayMetricIdentity =
  | `delivery:${DeliveryMetricKey}`
  | `result:${string}`
  | `efficiency:${string}`;
export type DisplayMetricKind = "delivery" | "result" | "efficiency";
export type MetricSlotRole = "core" | "diagnostic" | "optional";
export type ComparisonTone = "positive" | "negative" | "neutral";
export type DisplayMetricComparisonState =
  | "not_requested"
  | "ready"
  | "partial"
  | "unavailable"
  | "zero_baseline";

export type MetricPeriodValue = {
  value: number | null;
  state: MetricState;
  reasonCode?: string;
  coverage?: MetricCoverage;
  dataThrough?: string | null;
};

export type DisplayMetricComparison = {
  mode: "previous_period" | "none";
  state: DisplayMetricComparisonState;
  previousValue: number | null;
  deltaValue: number | null;
  deltaPercent: number | null;
  tone: ComparisonTone;
  reasonCode?: string;
};

/**
 * Presentation-safe metric contract. `value`/`state` duplicate `current`
 * intentionally: they preserve the small ergonomic surface used by older
 * cards, while `current`/`previous`/`comparison` make period semantics
 * explicit for V3, exports and tooltips.
 */
export type DisplayMetric = {
  key: DisplayMetricKey;
  identity: DisplayMetricIdentity;
  kind: DisplayMetricKind;
  label: string;
  value: number | null;
  state: MetricState;
  reasonCode?: string;
  disabledReason?: string;
  source: MetricSource;
  formula: string;
  valueType: ResultMetricValueType;
  direction: MetricDirection;
  slotRole: MetricSlotRole;
  eligible: boolean;
  locked: boolean;
  recommended: boolean;
  coverage?: MetricCoverage;
  dataThrough?: string | null;
  canonicalResultKey?: string;
  current: MetricPeriodValue;
  previous: MetricPeriodValue | null;
  comparison: DisplayMetricComparison;
};

export type MetricDisplayPresetContext = {
  objectiveKey: string | "all";
  primaryResultKey?: string | null;
};

export type MetricDisplayPresets = {
  version: typeof METRIC_DISPLAY_PRESET_VERSION;
  presets: Record<string, DisplayMetricKey[]>;
};

export type MetricPresetValidationCode =
  | "INVALID_METRIC_PRESET"
  | "TOO_MANY_METRIC_PRESETS"
  | "TOO_MANY_DISPLAY_METRICS"
  | "UNKNOWN_METRIC_IDENTITY";

export type MetricPresetValidation =
  | {
      ok: true;
      value: MetricDisplayPresets;
    }
  | {
      ok: false;
      code: MetricPresetValidationCode;
      message: string;
    };

export type ResolveDisplayMetricsInput = {
  resultMetrics: DynamicResultMetricsModel;
  previousResultMetrics?: DynamicResultMetricsModel | null;
  objectiveKey: string | "all";
  primaryResultKey?: string | null;
  preset?: unknown;
  comparisonMode?: "previous_period" | "none";
  resultDefinitions?: readonly ResultDefinition[];
};

export type ResolvedDisplayMetrics = {
  metrics: DisplayMetric[];
  availableMetrics: DisplayMetric[];
  preset: {
    key: string | null;
    source: "saved" | "default" | "default_fallback";
    value: MetricDisplayPresets;
  };
  context: {
    objectiveKey: string | "all";
    primaryResultKey: string | null;
    maxMetrics: number;
  };
};

type ParsedDisplayMetricIdentity = {
  key: DisplayMetricKey;
  identity: DisplayMetricIdentity;
  kind: DisplayMetricKind;
  canonicalResultKey?: string;
};

type Eligibility =
  | { eligible: true }
  | { eligible: false; reasonCode: string };

const DELIVERY_KEY_SET = new Set<string>(DELIVERY_METRIC_KEYS);
const RESULT_KEY = /^[a-z][a-z0-9_]{0,159}$/;
const OBJECTIVE_KEY = /^[a-z][a-z0-9_-]{0,159}$/;

const DEFAULT_DIAGNOSTIC_IDENTITIES: Record<
  string,
  readonly string[]
> = {
  awareness: ["frequency", "impressions", "result:thruplay"],
  traffic: ["link_ctr", "link_cpc", "impressions"],
  engagement: ["link_ctr", "result:thruplay", "impressions"],
  leads: ["link_ctr", "link_clicks", "link_cpc"],
  app_promotion: [
    "result:complete_registration",
    "efficiency:complete_registration",
    "link_ctr",
  ],
  sales: [
    "efficiency:purchase_value",
    "result:purchase_value",
    "link_ctr",
  ],
};

const LEGACY_IDENTITY_ALIASES: Record<string, string> = {
  purchase_value: "result:purchase_value",
  meta_roas: "efficiency:purchase_value",
};

export const EMPTY_METRIC_DISPLAY_PRESETS: MetricDisplayPresets = {
  version: METRIC_DISPLAY_PRESET_VERSION,
  presets: {},
};

function normalizedObjectiveKey(value: string | null | undefined) {
  const key = value?.trim().toLowerCase() ?? "";
  return key === "all" ? "all" : OBJECTIVE_KEY.test(key) ? key : "";
}

function normalizedResultKey(value: string | null | undefined) {
  const key = value?.trim().toLowerCase() ?? "";
  return RESULT_KEY.test(key) ? key : "";
}

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}

function clonePresetValue(
  value: MetricDisplayPresets,
): MetricDisplayPresets {
  return {
    version: METRIC_DISPLAY_PRESET_VERSION,
    presets: Object.fromEntries(
      Object.entries(value.presets).map(([key, metrics]) => [
        key,
        [...metrics],
      ]),
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resultDefinitionsFor(
  definitions: readonly ResultDefinition[] | undefined,
) {
  return definitions?.length ? definitions : DEFAULT_RESULT_DEFINITIONS;
}

function definitionFor(
  key: string | undefined,
  definitions: readonly ResultDefinition[],
) {
  return definitions.find(
    (definition) => definition.enabled && definition.canonicalKey === key,
  );
}

function primaryDisplayKey(primaryResultKey: string): DisplayMetricKey {
  if (primaryResultKey === "reach") return "reach";
  if (primaryResultKey === "impressions") return "impressions";
  if (primaryResultKey === "link_click") return "link_clicks";
  return `result:${primaryResultKey}`;
}

/** Returns the database key used to store a preset for one report context. */
export function metricPresetContextKey(
  context: MetricDisplayPresetContext,
) {
  const objectiveKey = normalizedObjectiveKey(context.objectiveKey);
  if (!objectiveKey) return null;
  if (objectiveKey === "all") return "all";
  const primaryResultKey = normalizedResultKey(context.primaryResultKey);
  return primaryResultKey ? `${objectiveKey}:${primaryResultKey}` : null;
}

function contextFromPresetKey(
  key: string,
): MetricDisplayPresetContext | null {
  if (key === "all") return { objectiveKey: "all" };
  const [objectiveKey, primaryResultKey, ...rest] = key.split(":");
  if (rest.length || !objectiveKey || !primaryResultKey) return null;
  const normalizedObjective = normalizedObjectiveKey(objectiveKey);
  const normalizedResult = normalizedResultKey(primaryResultKey);
  if (!normalizedObjective || normalizedObjective === "all" || !normalizedResult) {
    return null;
  }
  return {
    objectiveKey: normalizedObjective,
    primaryResultKey: normalizedResult,
  };
}

/**
 * A stored preset is intentionally narrower than a free-form dashboard
 * configuration. In particular, a syntactically valid string such as
 * `unknown:result` must not become durable preference data merely because it
 * contains no metric identities yet.
 */
function isSupportedPresetContext(
  context: MetricDisplayPresetContext,
  definitions: readonly ResultDefinition[],
) {
  if (context.objectiveKey === "all") return true;
  if (
    !DEFAULT_OBJECTIVE_REGISTRY.some(
      (objective) => objective.key === context.objectiveKey,
    )
  ) {
    return false;
  }
  const primaryResultKey = normalizedResultKey(context.primaryResultKey);
  const primary = definitionFor(primaryResultKey, definitions);
  return Boolean(
    primary && primary.objectiveKeys.includes(context.objectiveKey),
  );
}

/**
 * Accepts the V6 canonical grammar and only a small set of explicit legacy
 * aliases. It never treats an arbitrary string as a display metric.
 */
export function parseDisplayMetricIdentity(
  input: unknown,
  context: MetricDisplayPresetContext,
): ParsedDisplayMetricIdentity | null {
  if (typeof input !== "string") return null;
  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  const primaryResultKey = normalizedResultKey(context.primaryResultKey);
  if (raw === "primary_result") {
    return primaryResultKey
      ? parseDisplayMetricIdentity(`result:${primaryResultKey}`, context)
      : null;
  }
  if (raw === "cost_per_result") {
    return primaryResultKey
      ? parseDisplayMetricIdentity(`efficiency:${primaryResultKey}`, context)
      : null;
  }

  const legacy = LEGACY_IDENTITY_ALIASES[raw];
  if (legacy) return parseDisplayMetricIdentity(legacy, context);

  if (DELIVERY_KEY_SET.has(raw)) {
    return {
      key: raw as DeliveryMetricKey,
      identity: `delivery:${raw}` as DisplayMetricIdentity,
      kind: "delivery",
    };
  }

  const deliveryMatch = /^delivery:([a-z_]+)$/.exec(raw);
  if (deliveryMatch && DELIVERY_KEY_SET.has(deliveryMatch[1])) {
    const key = deliveryMatch[1] as DeliveryMetricKey;
    return {
      key,
      identity: `delivery:${key}`,
      kind: "delivery",
    };
  }

  const resultMatch = /^(result|efficiency):([a-z][a-z0-9_]{0,159})$/.exec(
    raw,
  );
  if (!resultMatch) return null;
  const canonicalResultKey = resultMatch[2];
  const kind = resultMatch[1] as "result" | "efficiency";
  return {
    key: `${kind}:${canonicalResultKey}`,
    identity: `${kind}:${canonicalResultKey}`,
    kind,
    canonicalResultKey,
  };
}

function coreMetricKeys(
  context: MetricDisplayPresetContext,
  definitions: readonly ResultDefinition[],
) {
  const objectiveKey = normalizedObjectiveKey(context.objectiveKey);
  if (objectiveKey === "all") {
    return ["spend", "impressions", "link_clicks", "link_ctr"] as const;
  }
  const primaryResultKey = normalizedResultKey(context.primaryResultKey);
  if (!objectiveKey || !primaryResultKey) return ["spend"] as const;
  const primary = definitionFor(primaryResultKey, definitions);
  const result = primaryDisplayKey(primaryResultKey);
  const efficiency =
    primary?.efficiencyMetric && primary.efficiencyMetric !== "none"
      ? (`efficiency:${primaryResultKey}` as const)
      : objectiveKey === "awareness"
        ? ("cpm" as const)
        : null;
  return ["spend", result, ...(efficiency ? [efficiency] : [])];
}

function semanticEligibility({
  parsed,
  context,
  definitions,
  currencyMode,
  allowUnknownResultDefinitions = false,
}: {
  parsed: ParsedDisplayMetricIdentity;
  context: MetricDisplayPresetContext;
  definitions: readonly ResultDefinition[];
  currencyMode?: "single" | "split";
  /**
   * Read-time settings normalization can run before the live Result Mapping
   * registry has been loaded. Preserve a structurally valid custom identity in
   * that narrow case; the resolver always evaluates it again with the real
   * registry before it can be displayed.
   */
  allowUnknownResultDefinitions?: boolean;
}): Eligibility {
  const objectiveKey = normalizedObjectiveKey(context.objectiveKey);
  const primaryResultKey = normalizedResultKey(context.primaryResultKey);
  if (!objectiveKey) {
    return { eligible: false, reasonCode: "OBJECTIVE_NOT_ELIGIBLE" };
  }

  if (parsed.kind === "delivery") {
    const definition = getMetricDefinition(parsed.key);
    if (!definition) {
      return { eligible: false, reasonCode: "UNKNOWN_METRIC_IDENTITY" };
    }
    const eligibility = resolveMetricEligibility(definition, {
      objectiveKey,
      primaryResultKey,
    });
    if (!eligibility.eligible) return eligibility;
    if (definition.requiresSingleCurrency && currencyMode === "split") {
      return { eligible: false, reasonCode: "SPLIT_CURRENCY" };
    }
    return { eligible: true };
  }

  if (objectiveKey === "all") {
    return { eligible: false, reasonCode: "OBJECTIVE_NOT_ELIGIBLE" };
  }
  const definition = definitionFor(parsed.canonicalResultKey, definitions);
  if (!definition) {
    return allowUnknownResultDefinitions
      ? { eligible: true }
      : { eligible: false, reasonCode: "PRIMARY_RESULT_NOT_ELIGIBLE" };
  }
  if (!definition.objectiveKeys.includes(objectiveKey)) {
    return { eligible: false, reasonCode: "PRIMARY_RESULT_NOT_ELIGIBLE" };
  }
  if (parsed.kind === "efficiency" && definition.efficiencyMetric === "none") {
    return { eligible: false, reasonCode: "EFFICIENCY_UNAVAILABLE" };
  }
  if (
    currencyMode === "split" &&
    parsed.kind === "result" &&
    definition.unit === "currency"
  ) {
    return { eligible: false, reasonCode: "SPLIT_CURRENCY" };
  }
  if (
    currencyMode === "split" &&
    (definition.efficiencyMetric === "cost_per_result" ||
      definition.efficiencyMetric === "roas") &&
    parsed.kind === "efficiency"
  ) {
    return { eligible: false, reasonCode: "SPLIT_CURRENCY" };
  }
  return { eligible: true };
}

function canonicalizePresetMetrics({
  values,
  context,
  definitions,
  strict,
  allowUnknownResultDefinitions = false,
}: {
  values: unknown;
  context: MetricDisplayPresetContext;
  definitions: readonly ResultDefinition[];
  strict: boolean;
  allowUnknownResultDefinitions?: boolean;
}):
  | { ok: true; metrics: DisplayMetricKey[] }
  | { ok: false; code: MetricPresetValidationCode; message: string } {
  if (!Array.isArray(values)) {
    return {
      ok: false,
      code: "INVALID_METRIC_PRESET",
      message: "Mỗi preset chỉ số phải là một danh sách.",
    };
  }
  if (values.length > MAX_DISPLAY_METRICS) {
    return {
      ok: false,
      code: "TOO_MANY_DISPLAY_METRICS",
      message: `Mỗi preset chỉ được tối đa ${MAX_DISPLAY_METRICS} chỉ số.`,
    };
  }

  const parsed = values.map((value) =>
    parseDisplayMetricIdentity(value, context),
  );
  if (strict && parsed.some((value) => !value)) {
    return {
      ok: false,
      code: "UNKNOWN_METRIC_IDENTITY",
      message: "Preset có identity chỉ số không hợp lệ.",
    };
  }
  const valid = parsed.flatMap((value) => {
    if (!value) return [];
    const eligibility = semanticEligibility({
      parsed: value,
      context,
      definitions,
      allowUnknownResultDefinitions,
    });
    if (!eligibility.eligible) return [];
    return [value.key];
  });
  if (strict && valid.length !== parsed.length) {
    return {
      ok: false,
      code: "UNKNOWN_METRIC_IDENTITY",
      message: "Preset chứa chỉ số không phù hợp với Objective hoặc Result.",
    };
  }

  const core = coreMetricKeys(context, definitions).flatMap((key) => {
    const value = parseDisplayMetricIdentity(key, context);
    return value ? [value.key] : [];
  });
  return {
    ok: true,
    metrics: unique([...core, ...valid]).slice(0, MAX_DISPLAY_METRICS),
  };
}

/**
 * Strict write-time validation. The API uses this before the JSONB preference
 * is stored, so malformed identity strings never enter the database.
 */
export function validateMetricDisplayPresets(
  input: unknown,
  options: { resultDefinitions?: readonly ResultDefinition[] } = {},
): MetricPresetValidation {
  if (!isRecord(input) || input.version !== METRIC_DISPLAY_PRESET_VERSION) {
    return {
      ok: false,
      code: "INVALID_METRIC_PRESET",
      message: "Phiên bản metric preset không hợp lệ.",
    };
  }
  if (!isRecord(input.presets)) {
    return {
      ok: false,
      code: "INVALID_METRIC_PRESET",
      message: "Metric preset phải có trường presets hợp lệ.",
    };
  }
  const entries = Object.entries(input.presets);
  if (entries.length > MAX_METRIC_PRESETS) {
    return {
      ok: false,
      code: "TOO_MANY_METRIC_PRESETS",
      message: `Chỉ được lưu tối đa ${MAX_METRIC_PRESETS} metric preset.`,
    };
  }
  const definitions = resultDefinitionsFor(options.resultDefinitions);
  const presets: Record<string, DisplayMetricKey[]> = {};
  for (const [key, metrics] of entries) {
    const context = contextFromPresetKey(key);
    if (!context) {
      return {
        ok: false,
        code: "INVALID_METRIC_PRESET",
        message: "Khóa metric preset phải theo Objective + Primary Result.",
      };
    }
    if (!isSupportedPresetContext(context, definitions)) {
      return {
        ok: false,
        code: "INVALID_METRIC_PRESET",
        message:
          "Objective hoặc Primary Result của metric preset không có trong registry hiện tại.",
      };
    }
    const normalized = canonicalizePresetMetrics({
      values: metrics,
      context,
      definitions,
      strict: true,
    });
    if (!normalized.ok) return normalized;
    presets[key] = normalized.metrics;
  }
  return {
    ok: true,
    value: {
      version: METRIC_DISPLAY_PRESET_VERSION,
      presets,
    },
  };
}

/**
 * Read-time guard for a JSONB value that might have been written by an older
 * build or manually edited. Invalid entries are omitted; callers then use the
 * deterministic resolver instead of rendering a broken preference.
 */
export function sanitizeMetricDisplayPresets(
  input: unknown,
  options: { resultDefinitions?: readonly ResultDefinition[] } = {},
): MetricDisplayPresets {
  if (!isRecord(input) || input.version !== METRIC_DISPLAY_PRESET_VERSION || !isRecord(input.presets)) {
    return clonePresetValue(EMPTY_METRIC_DISPLAY_PRESETS);
  }
  // The settings row can be read before Result Mapping has been fetched. Do
  // not silently erase a valid custom mapping in that path. Runtime display
  // resolution supplies the live definitions and performs the authoritative
  // eligibility check before render.
  const hasResultDefinitions = options.resultDefinitions !== undefined;
  const definitions = resultDefinitionsFor(options.resultDefinitions);
  const entries = Object.entries(input.presets).slice(0, MAX_METRIC_PRESETS);
  const presets: Record<string, DisplayMetricKey[]> = {};
  for (const [key, metrics] of entries) {
    const context = contextFromPresetKey(key);
    if (!context) continue;
    const normalized = canonicalizePresetMetrics({
      values: Array.isArray(metrics)
        ? metrics.slice(0, MAX_DISPLAY_METRICS)
        : metrics,
      context,
      definitions,
      strict: false,
      allowUnknownResultDefinitions: !hasResultDefinitions,
    });
    if (!normalized.ok) continue;
    presets[key] = normalized.metrics;
  }
  return {
    version: METRIC_DISPLAY_PRESET_VERSION,
    presets,
  };
}

function reasonCodeForCard(card: ResultKpiCard | undefined) {
  if (!card) return "DATA_UNAVAILABLE";
  if (card.reasonCode) return String(card.reasonCode).toUpperCase();
  switch (card.unavailableReason) {
    case "split_currency":
      return "SPLIT_CURRENCY";
    case "zero_result":
    case "zero_denominator":
      return "ZERO_DENOMINATOR";
    case "result_mapping_unavailable":
      return "RESULT_MAPPING_UNAVAILABLE";
    case "result_not_selected":
      return "PRIMARY_RESULT_REQUIRED";
    case "all_objectives":
      return "OBJECTIVE_NOT_ELIGIBLE";
    default:
      return card.value === null ? "DATA_UNAVAILABLE" : undefined;
  }
}

function metricStateForCard(card: ResultKpiCard | undefined): MetricState {
  if (!card) return "unavailable";
  if (card.state) return card.state;
  if (card.value === null) return "unavailable";
  return card.value === 0 ? "zero" : "ready";
}

function periodValue(card: ResultKpiCard | undefined): MetricPeriodValue {
  const state = metricStateForCard(card);
  const reasonCode = reasonCodeForCard(card);
  return {
    value: card?.value ?? null,
    state,
    ...(reasonCode ? { reasonCode } : {}),
    ...(card?.coverage ? { coverage: card.coverage } : {}),
    ...(card?.dataThrough !== undefined
      ? { dataThrough: card.dataThrough }
      : {}),
  };
}

function sourceForCard(card: ResultKpiCard | undefined): MetricSource {
  if (card?.attribution === "delivery") return "meta_delivery";
  if (
    card?.canonicalResultKey === "purchase_value" ||
    card?.key === "efficiency:purchase_value"
  ) {
    return "meta_attributed_value";
  }
  return "meta_attributed_action";
}

function sourceForAttribution(
  attribution: ResultMetricAttribution | undefined,
  canonicalResultKey: string | undefined,
) {
  if (attribution === "delivery") return "meta_delivery" as const;
  if (canonicalResultKey === "purchase_value") {
    return "meta_attributed_value" as const;
  }
  return "meta_attributed_action" as const;
}

function candidateMaps(model: DynamicResultMetricsModel | null | undefined) {
  const cards = model?.metricCandidates ?? model?.kpiCards ?? [];
  return new Map(cards.map((card) => [card.key, card]));
}

function displayKeyForParsed(parsed: ParsedDisplayMetricIdentity) {
  return parsed.key;
}

function candidateFor(
  parsed: ParsedDisplayMetricIdentity,
  candidates: ReadonlyMap<string, ResultKpiCard>,
) {
  return candidates.get(displayKeyForParsed(parsed));
}

function labelFor(
  parsed: ParsedDisplayMetricIdentity,
  card: ResultKpiCard | undefined,
  definitions: readonly ResultDefinition[],
) {
  if (card?.label) return card.label;
  if (parsed.kind === "delivery") {
    return getMetricDefinition(parsed.key)?.label ?? parsed.key;
  }
  const definition = definitionFor(parsed.canonicalResultKey, definitions);
  if (!definition) return parsed.key;
  if (parsed.kind === "result") {
    return definition.canonicalKey === "purchase_value"
      ? "Purchase Value (Meta)"
      : definition.label;
  }
  if (definition.efficiencyMetric === "roas") return "ROAS (Meta)";
  if (definition.efficiencyMetric === "cost_per_result") {
    return `Cost/${definition.shortLabel}`;
  }
  if (definition.efficiencyMetric === "rate") {
    return `${definition.shortLabel} Rate`;
  }
  return definition.label;
}

function formulaFor(
  parsed: ParsedDisplayMetricIdentity,
  card: ResultKpiCard | undefined,
) {
  return card?.formula ?? getMetricDefinition(parsed.key)?.formula ?? "";
}

function valueTypeFor(
  parsed: ParsedDisplayMetricIdentity,
  card: ResultKpiCard | undefined,
  definitions: readonly ResultDefinition[],
): ResultMetricValueType {
  if (card) return card.valueType;
  if (parsed.kind === "delivery") {
    const unit = getMetricDefinition(parsed.key)?.unit;
    return unit === "ratio" ? "ratio" : unit ?? "count";
  }
  const definition = definitionFor(parsed.canonicalResultKey, definitions);
  if (parsed.kind === "efficiency") {
    return definition?.efficiencyMetric === "rate"
      ? "percent"
      : definition?.efficiencyMetric === "roas"
        ? "ratio"
        : "currency";
  }
  return definition?.unit ?? "count";
}

function directionFor(
  parsed: ParsedDisplayMetricIdentity,
  card: ResultKpiCard | undefined,
  definitions: readonly ResultDefinition[],
) {
  if (card?.direction) return card.direction;
  if (parsed.kind === "delivery") {
    return getMetricDefinition(parsed.key)?.direction ?? "neutral";
  }
  const definition = definitionFor(parsed.canonicalResultKey, definitions);
  if (parsed.kind === "efficiency") {
    return definition?.efficiencyMetric === "cost_per_result"
      ? "lower_is_better"
      : definition?.efficiencyMetric === "rate" ||
          definition?.efficiencyMetric === "roas"
        ? "higher_is_better"
        : "neutral";
  }
  return definition?.direction ?? "higher_is_better";
}

function disabledReason(reasonCode: string | undefined) {
  switch (reasonCode) {
    case "SPLIT_CURRENCY":
      return "Chọn một tiền tệ để xem chỉ số tiền tệ gộp.";
    case "ZERO_DENOMINATOR":
      return "Cần mẫu số lớn hơn 0 để tính chỉ số này.";
    case "RESULT_MAPPING_UNAVAILABLE":
      return "Cần Result Mapping hợp lệ cho chỉ số này.";
    case "PRIMARY_RESULT_REQUIRED":
      return "Chọn Primary Result trước khi thêm chỉ số này.";
    case "PRIMARY_RESULT_NOT_ELIGIBLE":
    case "OBJECTIVE_NOT_ELIGIBLE":
      return "Chỉ số không phù hợp với Objective hiện tại.";
    case "EFFICIENCY_UNAVAILABLE":
      return "Result này không có efficiency metric phù hợp.";
    case "DATA_UNAVAILABLE":
      return "Dữ liệu Meta chưa đủ để hiển thị chỉ số này.";
    default:
      return reasonCode
        ? "Chỉ số chưa khả dụng trong Reporting Context hiện tại."
        : undefined;
  }
}

function comparisonFor({
  current,
  previous,
  comparisonMode,
  direction,
}: {
  current: MetricPeriodValue;
  previous: MetricPeriodValue | null;
  comparisonMode: "previous_period" | "none";
  direction: MetricDirection;
}): DisplayMetricComparison {
  if (comparisonMode === "none") {
    return {
      mode: comparisonMode,
      state: "not_requested",
      previousValue: previous?.value ?? null,
      deltaValue: null,
      deltaPercent: null,
      tone: "neutral",
    };
  }
  if (current.state === "partial" || previous?.state === "partial") {
    return {
      mode: comparisonMode,
      state: "partial",
      previousValue: previous?.value ?? null,
      deltaValue: null,
      deltaPercent: null,
      tone: "neutral",
      reasonCode: "PARTIAL_DATA",
    };
  }
  if (
    current.value === null ||
    current.state === "unavailable" ||
    !previous ||
    previous.value === null ||
    previous.state === "unavailable"
  ) {
    return {
      mode: comparisonMode,
      state: "unavailable",
      previousValue: previous?.value ?? null,
      deltaValue: null,
      deltaPercent: null,
      tone: "neutral",
      reasonCode: current.reasonCode ?? previous?.reasonCode ?? "NO_COMPARABLE_PERIOD",
    };
  }
  if (previous.value === 0) {
    return {
      mode: comparisonMode,
      state: "zero_baseline",
      previousValue: previous.value,
      deltaValue: current.value - previous.value,
      deltaPercent: null,
      tone: "neutral",
      reasonCode: "ZERO_BASELINE",
    };
  }
  const deltaValue = current.value - previous.value;
  const deltaPercent = (deltaValue / Math.abs(previous.value)) * 100;
  const tone: ComparisonTone =
    deltaValue === 0 || direction === "neutral"
      ? "neutral"
      : direction === "higher_is_better"
        ? deltaValue > 0
          ? "positive"
          : "negative"
        : deltaValue > 0
          ? "negative"
          : "positive";
  return {
    mode: comparisonMode,
    state: "ready",
    previousValue: previous.value,
    deltaValue,
    deltaPercent,
    tone,
  };
}

function catalogIdentities({
  context,
  definitions,
  candidates,
}: {
  context: MetricDisplayPresetContext;
  definitions: readonly ResultDefinition[];
  candidates: ReadonlyMap<string, ResultKpiCard>;
}) {
  const identities: ParsedDisplayMetricIdentity[] = DELIVERY_METRIC_KEYS.flatMap(
    (key) => parseDisplayMetricIdentity(key, context) ?? [],
  );
  if (normalizedObjectiveKey(context.objectiveKey) !== "all") {
    for (const definition of definitions) {
      if (
        !definition.enabled ||
        !definition.objectiveKeys.includes(context.objectiveKey)
      ) {
        continue;
      }
      const result = parseDisplayMetricIdentity(
        `result:${definition.canonicalKey}`,
        context,
      );
      if (result) identities.push(result);
      if (definition.efficiencyMetric !== "none") {
        const efficiency = parseDisplayMetricIdentity(
          `efficiency:${definition.canonicalKey}`,
          context,
        );
        if (efficiency) identities.push(efficiency);
      }
    }
  }
  for (const key of candidates.keys()) {
    const parsed = parseDisplayMetricIdentity(key, context);
    if (parsed) identities.push(parsed);
  }
  const seen = new Set<string>();
  return identities.filter((identity) => {
    if (seen.has(identity.identity)) return false;
    seen.add(identity.identity);
    return true;
  });
}

function defaultDiagnosticKey({
  objectiveKey,
  context,
  definitions,
  candidates,
  currencyMode,
  core,
}: {
  objectiveKey: string;
  context: MetricDisplayPresetContext;
  definitions: readonly ResultDefinition[];
  candidates: ReadonlyMap<string, ResultKpiCard>;
  currencyMode?: "single" | "split";
  core: readonly DisplayMetricKey[];
}) {
  const choices = DEFAULT_DIAGNOSTIC_IDENTITIES[objectiveKey] ?? [
    "link_ctr",
    "impressions",
  ];
  for (const value of choices) {
    const parsed = parseDisplayMetricIdentity(value, context);
    if (!parsed || core.includes(parsed.key)) continue;
    const semantic = semanticEligibility({
      parsed,
      context,
      definitions,
      currencyMode,
    });
    const card = candidateFor(parsed, candidates);
    const state = metricStateForCard(card);
    if (semantic.eligible && (state === "ready" || state === "zero")) {
      return parsed.key;
    }
  }
  return null;
}

function displayMetricFrom({
  parsed,
  currentCandidates,
  previousCandidates,
  context,
  definitions,
  comparisonMode,
  currencyMode,
  slotRole,
  locked,
  recommended,
}: {
  parsed: ParsedDisplayMetricIdentity;
  currentCandidates: ReadonlyMap<string, ResultKpiCard>;
  previousCandidates: ReadonlyMap<string, ResultKpiCard>;
  context: MetricDisplayPresetContext;
  definitions: readonly ResultDefinition[];
  comparisonMode: "previous_period" | "none";
  currencyMode?: "single" | "split";
  slotRole: MetricSlotRole;
  locked: boolean;
  recommended: boolean;
}): DisplayMetric {
  const currentCard = candidateFor(parsed, currentCandidates);
  const previousCard = candidateFor(parsed, previousCandidates);
  const rawCurrent = periodValue(currentCard);
  const previous = previousCard ? periodValue(previousCard) : null;
  const semantic = semanticEligibility({
    parsed,
    context,
    definitions,
    currencyMode,
  });
  const current: MetricPeriodValue =
    semantic.eligible
      ? rawCurrent
      : {
          value: null,
          state: "unavailable",
          reasonCode: semantic.reasonCode,
          ...(rawCurrent.coverage ? { coverage: rawCurrent.coverage } : {}),
          ...(rawCurrent.dataThrough !== undefined
            ? { dataThrough: rawCurrent.dataThrough }
            : {}),
        };
  const direction = directionFor(parsed, currentCard, definitions);
  const currentReason = current.reasonCode;
  const eligible = semantic.eligible &&
    (current.state === "ready" || current.state === "zero");
  const reasonCode = semantic.eligible
    ? currentReason
    : semantic.reasonCode;
  return {
    key: parsed.key,
    identity: parsed.identity,
    kind: parsed.kind,
    label: labelFor(parsed, currentCard, definitions),
    value: current.value,
    state: current.state,
    ...(reasonCode ? { reasonCode } : {}),
    ...(!eligible && !locked && reasonCode
      ? { disabledReason: disabledReason(reasonCode) }
      : {}),
    source: currentCard
      ? sourceForCard(currentCard)
      : parsed.kind === "delivery"
        ? "meta_delivery"
        : sourceForAttribution(undefined, parsed.canonicalResultKey),
    formula: formulaFor(parsed, currentCard),
    valueType: valueTypeFor(parsed, currentCard, definitions),
    direction,
    slotRole,
    eligible,
    locked,
    recommended,
    ...(current.coverage ? { coverage: current.coverage } : {}),
    ...(current.dataThrough !== undefined
      ? { dataThrough: current.dataThrough }
      : {}),
    ...(parsed.canonicalResultKey
      ? { canonicalResultKey: parsed.canonicalResultKey }
      : {}),
    current,
    previous,
    comparison: comparisonFor({
      current,
      previous,
      comparisonMode,
      direction,
    }),
  };
}

/**
 * Resolves the complete V6 Priority Metrics model. It is pure and deterministic
 * so UI route code cannot accidentally reintroduce random fallback cards or
 * infer delta colours from the sign alone.
 */
export function resolveDisplayMetrics(
  input: ResolveDisplayMetricsInput,
): ResolvedDisplayMetrics {
  const context: MetricDisplayPresetContext = {
    objectiveKey: normalizedObjectiveKey(input.objectiveKey) || "all",
    ...(normalizedResultKey(input.primaryResultKey)
      ? { primaryResultKey: normalizedResultKey(input.primaryResultKey) }
      : {}),
  };
  const definitions = resultDefinitionsFor(input.resultDefinitions);
  const currentCandidates = candidateMaps(input.resultMetrics);
  const previousCandidates = candidateMaps(input.previousResultMetrics);
  const currencyMode = input.resultMetrics.metadata?.currencyMode;
  const comparisonMode = input.comparisonMode ?? "previous_period";
  const core = coreMetricKeys(context, definitions)
    .flatMap((key) => parseDisplayMetricIdentity(key, context)?.key ?? []);
  const diagnostic = defaultDiagnosticKey({
    objectiveKey: context.objectiveKey,
    context,
    definitions,
    candidates: currentCandidates,
    currencyMode,
    core,
  });

  const saved = sanitizeMetricDisplayPresets(input.preset, {
    resultDefinitions: definitions,
  });
  const presetKey = metricPresetContextKey(context);
  const rawPreset = presetKey ? saved.presets[presetKey] : undefined;
  const validInput = validateMetricDisplayPresets(input.preset, {
    resultDefinitions: definitions,
  });
  const presetSource: ResolvedDisplayMetrics["preset"]["source"] =
    input.preset === undefined
      ? "default"
      : !validInput.ok
        ? "default_fallback"
        : rawPreset
          ? "saved"
          : "default";

  const selectedKeys: DisplayMetricKey[] = [...core];
  if (presetSource === "saved" && rawPreset) {
    for (const key of rawPreset) {
      if (selectedKeys.includes(key)) continue;
      const parsed = parseDisplayMetricIdentity(key, context);
      if (!parsed) continue;
      const semantic = semanticEligibility({
        parsed,
        context,
        definitions,
        currencyMode,
      });
      const candidate = candidateFor(parsed, currentCandidates);
      const state = metricStateForCard(candidate);
      if (
        semantic.eligible &&
        (state === "ready" || state === "zero") &&
        selectedKeys.length < MAX_DISPLAY_METRICS
      ) {
        selectedKeys.push(parsed.key);
      }
    }
  } else if (diagnostic) {
    selectedKeys.push(diagnostic);
  }

  const catalog = catalogIdentities({
    context,
    definitions,
    candidates: currentCandidates,
  });
  const build = (parsed: ParsedDisplayMetricIdentity) => {
    const locked = core.includes(parsed.key);
    const recommended = parsed.key === diagnostic;
    return displayMetricFrom({
      parsed,
      currentCandidates,
      previousCandidates,
      context,
      definitions,
      comparisonMode,
      currencyMode,
      slotRole: locked
        ? "core"
        : recommended
          ? "diagnostic"
          : "optional",
      locked,
      recommended,
    });
  };
  const availableMetrics = catalog.map(build);
  const byKey = new Map(availableMetrics.map((metric) => [metric.key, metric]));
  const metrics = selectedKeys.flatMap((key) => {
    const existing = byKey.get(key);
    if (existing) return [existing];
    const parsed = parseDisplayMetricIdentity(key, context);
    return parsed ? [build(parsed)] : [];
  });

  return {
    metrics,
    availableMetrics,
    preset: {
      key: presetKey,
      source: presetSource,
      value: saved,
    },
    context: {
      objectiveKey: context.objectiveKey,
      primaryResultKey: context.primaryResultKey ?? null,
      maxMetrics: MAX_DISPLAY_METRICS,
    },
  };
}
