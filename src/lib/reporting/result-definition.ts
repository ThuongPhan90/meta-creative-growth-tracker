export type ResultUnit =
  | "count"
  | "currency"
  | "percent"
  | "duration";

export type ResultEfficiencyMetric =
  | "cost_per_result"
  | "rate"
  | "roas"
  | "none";

export type ResultDirection =
  | "lower_is_better"
  | "higher_is_better";

export type ResultDefinition = {
  id: string;
  canonicalKey: string;
  label: string;
  shortLabel: string;
  objectiveKeys: string[];
  /**
   * Ordered aliases. The first alias present is authoritative, so an omni
   * alias is never added to the same canonical result.
   */
  rawActionTypes: string[];
  rawValueActionTypes?: string[];
  unit: ResultUnit;
  efficiencyMetric: ResultEfficiencyMetric;
  direction: ResultDirection;
  defaultForObjective: boolean;
  minimumResults: number;
  minimumImpressions: number;
  enabled: boolean;
};

export type RawResultValue = {
  actionType: string;
  value: number;
};

export type CanonicalResultMatch = {
  canonicalKey: string;
  value: number;
  selectedActionType: string;
  source: "action" | "action_value";
  rawValues: Array<RawResultValue & { selected: boolean }>;
};

export type RawActionMetricSource = "action" | "action_value";

export type ReportingResultMetricSource =
  | RawActionMetricSource
  | "delivery";

export type ResultMappingRule = {
  id: string;
  canonicalResultKey: string;
  priority: number;
  objectiveKeys?: readonly string[];
  optimizationGoals?: readonly string[];
  promotedObjectTypes?: readonly string[];
  enabled: boolean;
};

export type CampaignResultOverride = {
  campaignId: string;
  canonicalResultKey: string;
  enabled: boolean;
};

export type PrimaryResultResolution =
  | {
      definition: ResultDefinition;
      source:
        | "campaign_override"
        | "optimization_mapping"
        | "objective_default"
        | "workspace_default";
    }
  | {
      definition: null;
      source: "all_objectives" | "unresolved";
    };

const countResult = (
  definition: Omit<
    ResultDefinition,
    | "unit"
    | "efficiencyMetric"
    | "direction"
    | "minimumResults"
    | "minimumImpressions"
    | "enabled"
  >,
): ResultDefinition => ({
  ...definition,
  unit: "count",
  efficiencyMetric: "cost_per_result",
  direction: "lower_is_better",
  minimumResults: 5,
  minimumImpressions: 1_000,
  enabled: true,
});

const distributionResult = (
  definition: Omit<
    ResultDefinition,
    | "unit"
    | "efficiencyMetric"
    | "direction"
    | "minimumResults"
    | "minimumImpressions"
    | "enabled"
  >,
): ResultDefinition => ({
  ...definition,
  unit: "count",
  efficiencyMetric: "none",
  direction: "higher_is_better",
  minimumResults: 0,
  minimumImpressions: 1_000,
  enabled: true,
});

export const DEFAULT_RESULT_DEFINITIONS: readonly ResultDefinition[] = [
  distributionResult({
    id: "result_reach",
    canonicalKey: "reach",
    label: "Reach",
    shortLabel: "Reach",
    objectiveKeys: ["awareness"],
    rawActionTypes: ["reach"],
    defaultForObjective: true,
  }),
  distributionResult({
    id: "result_impressions",
    canonicalKey: "impressions",
    label: "Impressions",
    shortLabel: "Impr.",
    objectiveKeys: ["awareness"],
    rawActionTypes: ["impressions"],
    defaultForObjective: false,
  }),
  countResult({
    id: "result_thruplay",
    canonicalKey: "thruplay",
    label: "ThruPlay",
    shortLabel: "ThruPlay",
    objectiveKeys: ["awareness", "engagement"],
    rawActionTypes: [
      "video_thruplay_watched_actions",
      "thruplay",
    ],
    defaultForObjective: false,
  }),
  countResult({
    id: "result_link_click",
    canonicalKey: "link_click",
    label: "Link Click",
    shortLabel: "Click",
    objectiveKeys: ["traffic"],
    rawActionTypes: ["link_click"],
    defaultForObjective: true,
  }),
  countResult({
    id: "result_outbound_click",
    canonicalKey: "outbound_click",
    label: "Outbound Click",
    shortLabel: "Outbound",
    objectiveKeys: ["traffic"],
    rawActionTypes: ["outbound_click"],
    defaultForObjective: false,
  }),
  countResult({
    id: "result_landing_page_view",
    canonicalKey: "landing_page_view",
    label: "Landing Page View",
    shortLabel: "LPV",
    objectiveKeys: ["traffic"],
    rawActionTypes: ["landing_page_view"],
    defaultForObjective: false,
  }),
  countResult({
    id: "result_post_engagement",
    canonicalKey: "post_engagement",
    label: "Post Engagement",
    shortLabel: "Engagement",
    objectiveKeys: ["engagement"],
    rawActionTypes: ["post_engagement"],
    defaultForObjective: true,
  }),
  countResult({
    id: "result_messaging_conversation",
    canonicalKey: "messaging_conversation",
    label: "Messaging Conversation",
    shortLabel: "Conversation",
    objectiveKeys: ["engagement", "leads"],
    rawActionTypes: [
      "onsite_conversion.messaging_conversation_started_7d",
      "messaging_conversation_started_7d",
    ],
    defaultForObjective: false,
  }),
  countResult({
    id: "result_lead",
    canonicalKey: "lead",
    label: "Meta-attributed Lead",
    shortLabel: "Lead",
    objectiveKeys: ["leads"],
    rawActionTypes: [
      "onsite_conversion.lead_grouped",
      "lead",
      "offsite_conversion.fb_pixel_lead",
    ],
    defaultForObjective: true,
  }),
  countResult({
    id: "result_install",
    canonicalKey: "install",
    label: "Meta-attributed Install",
    shortLabel: "Install",
    objectiveKeys: ["app_promotion"],
    rawActionTypes: [
      "mobile_app_install",
      "omni_app_install",
      "app_install",
    ],
    defaultForObjective: true,
  }),
  countResult({
    id: "result_registration",
    canonicalKey: "complete_registration",
    label: "Meta-attributed Registration",
    shortLabel: "Registration",
    objectiveKeys: ["leads", "app_promotion"],
    rawActionTypes: [
      "complete_registration",
      "omni_complete_registration",
      "mobile_app_complete_registration",
    ],
    defaultForObjective: false,
  }),
  countResult({
    id: "result_purchase",
    canonicalKey: "purchase",
    label: "Meta-attributed Purchase",
    shortLabel: "Purchase",
    objectiveKeys: ["sales"],
    rawActionTypes: [
      "purchase",
      "omni_purchase",
      "offsite_conversion.fb_pixel_purchase",
      "mobile_app_purchase",
    ],
    defaultForObjective: true,
  }),
  {
    id: "result_purchase_value",
    canonicalKey: "purchase_value",
    label: "Meta-attributed Purchase Value",
    shortLabel: "Value",
    objectiveKeys: ["sales"],
    rawActionTypes: [],
    rawValueActionTypes: [
      "purchase",
      "omni_purchase",
      "offsite_conversion.fb_pixel_purchase",
      "mobile_app_purchase",
    ],
    unit: "currency",
    efficiencyMetric: "roas",
    direction: "higher_is_better",
    defaultForObjective: false,
    minimumResults: 10,
    minimumImpressions: 1_000,
    enabled: true,
  },
];

const DELIVERY_NATIVE_RESULT_KEYS = new Set([
  "reach",
  "impressions",
  "link_click",
]);

export function isDeliveryNativeResultKey(canonicalKey: string) {
  return DELIVERY_NATIVE_RESULT_KEYS.has(canonicalKey);
}

/**
 * Resolves the persisted Meta action source from hydrated aliases. Definitions
 * with no enabled aliases, or aliases in both sources, are intentionally
 * unavailable so callers never guess from display metadata such as `unit`.
 */
export function resolveMappedResultMetricSource(
  definition: ResultDefinition,
): RawActionMetricSource | null {
  const hasActionAliases = definition.rawActionTypes.some((alias) =>
    Boolean(alias.trim()),
  );
  const hasActionValueAliases = (
    definition.rawValueActionTypes ?? []
  ).some((alias) => Boolean(alias.trim()));
  if (hasActionAliases === hasActionValueAliases) return null;
  return hasActionAliases ? "action" : "action_value";
}

export function resolveReportingResultMetricSource(
  definition: ResultDefinition,
): ReportingResultMetricSource | null {
  return isDeliveryNativeResultKey(definition.canonicalKey)
    ? "delivery"
    : resolveMappedResultMetricSource(definition);
}

function totalsByActionType(values: readonly RawResultValue[]) {
  const totals = new Map<string, number>();
  for (const item of values) {
    const actionType = item.actionType.trim();
    if (!actionType || !Number.isFinite(item.value)) continue;
    totals.set(actionType, (totals.get(actionType) ?? 0) + item.value);
  }
  return totals;
}

export function resolveCanonicalResults({
  actions,
  actionValues = [],
  definitions = DEFAULT_RESULT_DEFINITIONS,
}: {
  actions: readonly RawResultValue[];
  actionValues?: readonly RawResultValue[];
  definitions?: readonly ResultDefinition[];
}): CanonicalResultMatch[] {
  const actionTotals = totalsByActionType(actions);
  const valueTotals = totalsByActionType(actionValues);
  const claimed = new Set<string>();
  const results: CanonicalResultMatch[] = [];

  for (const definition of definitions) {
    if (!definition.enabled) continue;
    const source = resolveMappedResultMetricSource(definition);
    if (!source) continue;
    const totals = source === "action_value" ? valueTotals : actionTotals;
    const aliases =
      source === "action_value"
        ? definition.rawValueActionTypes ?? []
        : definition.rawActionTypes;
    const rawValues = aliases
      .filter((actionType) => totals.has(actionType))
      .map((actionType) => ({
        actionType,
        value: totals.get(actionType) ?? 0,
        selected: false,
      }));
    const selected = rawValues.find(
      (item) => !claimed.has(`${source}:${item.actionType}`),
    );
    if (!selected) continue;
    selected.selected = true;
    claimed.add(`${source}:${selected.actionType}`);
    results.push({
      canonicalKey: definition.canonicalKey,
      value: selected.value,
      selectedActionType: selected.actionType,
      source,
      rawValues,
    });
  }

  return results;
}

function enabledDefinition(
  definitions: readonly ResultDefinition[],
  canonicalKey: string | null | undefined,
) {
  if (!canonicalKey) return null;
  return (
    definitions.find(
      (definition) =>
        definition.enabled &&
        definition.canonicalKey === canonicalKey,
    ) ?? null
  );
}

function matchesOptionalRuleValue(
  expected: readonly string[] | undefined,
  actual: string | null | undefined,
) {
  return !expected?.length || (!!actual && expected.includes(actual));
}

export function resolvePrimaryResult({
  campaignId,
  objectiveKey,
  optimizationGoal,
  promotedObjectType,
  campaignOverrides = [],
  mappings = [],
  workspaceDefaultResultKey,
  definitions = DEFAULT_RESULT_DEFINITIONS,
}: {
  campaignId: string;
  objectiveKey: string | "all";
  optimizationGoal?: string | null;
  promotedObjectType?: string | null;
  campaignOverrides?: readonly CampaignResultOverride[];
  mappings?: readonly ResultMappingRule[];
  workspaceDefaultResultKey?: string | null;
  definitions?: readonly ResultDefinition[];
}): PrimaryResultResolution {
  if (objectiveKey === "all") {
    return { definition: null, source: "all_objectives" };
  }

  const override = campaignOverrides.find(
    (item) => item.enabled && item.campaignId === campaignId,
  );
  const overrideDefinition = enabledDefinition(
    definitions,
    override?.canonicalResultKey,
  );
  if (overrideDefinition) {
    return {
      definition: overrideDefinition,
      source: "campaign_override",
    };
  }

  const mapping = [...mappings]
    .filter((item) => item.enabled)
    .sort((left, right) => left.priority - right.priority)
    .find(
      (item) =>
        matchesOptionalRuleValue(item.objectiveKeys, objectiveKey) &&
        matchesOptionalRuleValue(
          item.optimizationGoals,
          optimizationGoal,
        ) &&
        matchesOptionalRuleValue(
          item.promotedObjectTypes,
          promotedObjectType,
        ) &&
        enabledDefinition(definitions, item.canonicalResultKey),
    );
  const mappedDefinition = enabledDefinition(
    definitions,
    mapping?.canonicalResultKey,
  );
  if (mappedDefinition) {
    return {
      definition: mappedDefinition,
      source: "optimization_mapping",
    };
  }

  const objectiveDefault =
    definitions.find(
      (definition) =>
        definition.enabled &&
        definition.defaultForObjective &&
        definition.objectiveKeys.includes(objectiveKey),
    ) ?? null;
  if (objectiveDefault) {
    return {
      definition: objectiveDefault,
      source: "objective_default",
    };
  }

  const workspaceDefault = enabledDefinition(
    definitions,
    workspaceDefaultResultKey,
  );
  return workspaceDefault
    ? {
        definition: workspaceDefault,
        source: "workspace_default",
      }
    : { definition: null, source: "unresolved" };
}

export function aggregateResultMetricsAvailable({
  objectiveKey,
  primaryResultKey,
}: {
  objectiveKey: string | "all";
  primaryResultKey?: string | null;
}) {
  return objectiveKey !== "all" && !!primaryResultKey;
}

export type PersistedResultMapping = {
  id: string;
  canonicalResultKey: string;
  rawActionType: string;
  metricSource: RawActionMetricSource;
  priority: number;
  mappingSource: "system" | "owner";
  enabled: boolean;
};

export type ResultMappingWrite = {
  canonicalResultKey: string;
  rawActionType: string;
  metricSource: RawActionMetricSource;
  priority: number;
  enabled: boolean;
};

export type ResultMappingValidation =
  | {
      ok: true;
      mappings: ResultMappingWrite[];
    }
  | {
      ok: false;
      code:
        | "INVALID_RESULT_MAPPING"
        | "UNKNOWN_RESULT_DEFINITION"
        | "RAW_ACTION_OWNERSHIP_CONFLICT"
        | "RESULT_MAPPING_PRIORITY_CONFLICT";
      error: string;
    };

const RAW_ACTION_TYPE_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CANONICAL_RESULT_KEY_PATTERN =
  /^[a-z0-9][a-z0-9._-]{0,159}$/;

export function validateResultMappings({
  mappings,
  definitions,
}: {
  mappings: readonly ResultMappingWrite[];
  definitions: readonly ResultDefinition[];
}): ResultMappingValidation {
  const definitionKeys = new Set(
    definitions.map((definition) => definition.canonicalKey),
  );
  const normalized = mappings.map((mapping) => ({
    canonicalResultKey: mapping.canonicalResultKey.trim(),
    rawActionType: mapping.rawActionType.trim(),
    metricSource: mapping.metricSource,
    priority: mapping.priority,
    enabled: mapping.enabled,
  }));

  const invalid = normalized.find(
    (mapping) =>
      !CANONICAL_RESULT_KEY_PATTERN.test(
        mapping.canonicalResultKey,
      ) ||
      !RAW_ACTION_TYPE_PATTERN.test(mapping.rawActionType) ||
      !Number.isInteger(mapping.priority) ||
      mapping.priority < 0 ||
      mapping.priority > 10_000,
  );
  if (invalid) {
    return {
      ok: false,
      code: "INVALID_RESULT_MAPPING",
      error:
        "Result mapping phải có canonical key, raw action type và priority hợp lệ.",
    };
  }

  const unknownDefinition = normalized.find(
    (mapping) => !definitionKeys.has(mapping.canonicalResultKey),
  );
  if (unknownDefinition) {
    return {
      ok: false,
      code: "UNKNOWN_RESULT_DEFINITION",
      error: `Result "${unknownDefinition.canonicalResultKey}" không tồn tại trong registry của owner.`,
    };
  }

  const actionOwners = new Map<string, string>();
  for (const mapping of normalized) {
    const key = `${mapping.metricSource}:${mapping.rawActionType}`;
    const currentOwner = actionOwners.get(key);
    if (currentOwner !== undefined) {
      return {
        ok: false,
        code: "RAW_ACTION_OWNERSHIP_CONFLICT",
        error:
          `Raw action "${mapping.rawActionType}" chỉ được thuộc một ` +
          `canonical result trong nguồn ${mapping.metricSource}.`,
      };
    }
    actionOwners.set(key, mapping.canonicalResultKey);
  }

  const priorities = new Set<string>();
  for (const mapping of normalized) {
    const key = [
      mapping.canonicalResultKey,
      mapping.metricSource,
      mapping.priority,
    ].join(":");
    if (priorities.has(key)) {
      return {
        ok: false,
        code: "RESULT_MAPPING_PRIORITY_CONFLICT",
        error:
          `Priority ${mapping.priority} bị trùng trong result ` +
          `"${mapping.canonicalResultKey}" (${mapping.metricSource}).`,
      };
    }
    priorities.add(key);
  }

  return { ok: true, mappings: normalized };
}

export function hydrateResultDefinitions({
  definitions,
  mappings,
}: {
  definitions: readonly ResultDefinition[];
  mappings: readonly PersistedResultMapping[];
}): ResultDefinition[] {
  const orderedMappings = [...mappings]
    .filter((mapping) => mapping.enabled)
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.rawActionType.localeCompare(right.rawActionType),
    );

  return definitions.map((definition) => ({
    ...definition,
    objectiveKeys: [...definition.objectiveKeys],
    rawActionTypes: orderedMappings
      .filter(
        (mapping) =>
          mapping.canonicalResultKey === definition.canonicalKey &&
          mapping.metricSource === "action",
      )
      .map((mapping) => mapping.rawActionType),
    rawValueActionTypes: orderedMappings
      .filter(
        (mapping) =>
          mapping.canonicalResultKey === definition.canonicalKey &&
          mapping.metricSource === "action_value",
      )
      .map((mapping) => mapping.rawActionType),
  }));
}
