import type { ReportingContext } from "./report-context";
import { resolveObjective } from "./objective-registry";
import {
  getMetricDefinition,
  type MetricCoverage,
  type MetricDirection,
  type MetricState,
} from "./metric-registry";
import type {
  ResultDefinition,
  ResultEfficiencyMetric,
  ResultUnit,
} from "./result-definition";

export type CanonicalResultValue = {
  canonicalKey: string;
  objectiveKey: string;
  value: number | null;
  configured?: boolean;
  hasData?: boolean;
  /**
   * Objective-scoped Spend. It is used only inside the matching
   * cross-objective section, never as a cross-objective total.
   */
  spend?: number | null;
};

export type ResultMetricAttribution =
  | "delivery"
  | "meta_attributed";

const DELIVERY_BACKED_RESULTS = new Set([
  "reach",
  "impressions",
  "link_click",
]);

export type ResultMetricValueType =
  | ResultUnit
  | "ratio";

export type ResultKpiCard = {
  key: string;
  label: string;
  value: number | null;
  valueType: ResultMetricValueType;
  attribution: ResultMetricAttribution;
  formula: string;
  canonicalResultKey?: string;
  unavailableReason?: DynamicResultUnavailableReason;
  /**
   * Optional while V2 consumers migrate. New V6 consumers must prefer these
   * per-metric semantics instead of inferring state from a page-level flag.
   */
  state?: MetricState;
  reasonCode?: string;
  direction?: MetricDirection;
  coverage?: MetricCoverage;
  dataThrough?: string | null;
};

export type DynamicResultTableColumn = {
  key: string;
  label: string;
  valueType: ResultMetricValueType;
  attribution: ResultMetricAttribution;
  canonicalResultKey: string;
  sortable: boolean;
  formula: string;
};

export type ScatterAxis = {
  metric: string;
  label: string;
  valueType: ResultMetricValueType;
};

export type DynamicResultUnavailableReason =
  | "all_objectives"
  | "result_not_selected"
  | "result_unavailable"
  | "result_mapping_unavailable"
  | "split_currency"
  | "zero_result"
  | "zero_denominator";

export type DynamicResultScatter = {
  enabled: boolean;
  x: ScatterAxis;
  y: ScatterAxis | null;
  bubbleSize: ScatterAxis | null;
  unavailableReason?: DynamicResultUnavailableReason;
};

export type CrossObjectiveResult = {
  canonicalKey: string;
  label: string;
  value: number | null;
  efficiencyLabel: string | null;
  costPerResult: number | null;
  attribution: ResultMetricAttribution;
  configured: boolean;
};

export type CrossObjectiveSection = {
  objectiveKey: string;
  objectiveLabel: string;
  spend: number | null;
  results: CrossObjectiveResult[];
  costSortAllowed: false;
};

export type CostSortMode =
  | "single_result"
  | "disabled_cross_objective"
  | "disabled_split_currency"
  | "disabled_no_result";

export type DynamicResultMetricsModel = {
  kpiCards: ResultKpiCard[];
  /**
   * Complete, deterministic candidate catalog for V6 Priority Metrics. It
   * deliberately includes unavailable supporting Results so a customizer can
   * show a precise disabled reason instead of silently omitting an option.
   * Older V2 callers may not provide it, so consumers must fall back to
   * `kpiCards` during the staged migration.
   */
  metricCandidates?: ResultKpiCard[];
  dynamicTableColumns: DynamicResultTableColumn[];
  scatter: DynamicResultScatter;
  crossObjectiveSections: CrossObjectiveSection[];
  availableResults: Array<{
    canonicalKey: string;
    label: string;
    shortLabel: string;
    objectiveKeys: string[];
    attribution: ResultMetricAttribution;
    configured: boolean;
    hasData: boolean;
  }>;
  metadata: {
    resultAttribution: "meta_attributed";
    costSortMode: CostSortMode;
    currencyMode: ReportingContext["currencyMode"];
    primaryResultKey: string | null;
  };
};

function finiteNonNegative(value: number | null | undefined) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
    ? value
    : null;
}

function ratio(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
  percentage = false,
) {
  const safeNumerator = finiteNonNegative(numerator);
  const safeDenominator = finiteNonNegative(denominator);
  if (
    safeNumerator === null ||
    safeDenominator === null ||
    safeDenominator === 0
  ) {
    return null;
  }
  const value = safeNumerator / safeDenominator;
  return percentage ? value * 100 : value;
}

function definitionByKey(
  definitions: readonly ResultDefinition[],
  canonicalKey: string,
) {
  return (
    definitions.find(
      (definition) =>
        definition.enabled &&
        definition.canonicalKey === canonicalKey,
    ) ?? null
  );
}

function visibleResultValues(
  values: readonly CanonicalResultValue[],
  definitions: readonly ResultDefinition[],
) {
  return values.filter((item) => {
    const definition = definitionByKey(
      definitions,
      item.canonicalKey,
    );
    return (
      !!definition &&
      (item.configured === true ||
        item.hasData === true ||
        item.value !== null)
    );
  });
}

function resultAttribution(
  definition: Pick<ResultDefinition, "canonicalKey">,
): ResultMetricAttribution {
  return DELIVERY_BACKED_RESULTS.has(definition.canonicalKey)
    ? "delivery"
    : "meta_attributed";
}

function resultFormula(definition: ResultDefinition) {
  return resultAttribution(definition) === "delivery"
    ? `Meta-reported ${definition.shortLabel}`
    : `Meta-attributed ${definition.shortLabel}`;
}

/**
 * Reach, Impressions and Link Clicks are native Insights delivery fields, not
 * action-array facts. Overlay those exact sources only when delivery is scoped
 * to one Objective; an all-Objective total cannot replace per-Objective rows.
 * This does not enable the legacy Install/Registration demo bridge.
 */
export function withDeliveryBackedResultValues({
  values,
  objectiveKey,
  impressions,
  reach,
  linkClicks,
}: {
  values: readonly CanonicalResultValue[];
  objectiveKey: ReportingContext["objectiveKey"];
  impressions: number;
  reach: number | null;
  linkClicks: number;
}): CanonicalResultValue[] {
  const deliveryValues = new Map<string, number | null>([
    ["impressions", finiteNonNegative(impressions)],
    ["reach", finiteNonNegative(reach)],
    ["link_click", finiteNonNegative(linkClicks)],
  ]);

  return values.map((item) => {
    if (
      objectiveKey === "all" ||
      item.objectiveKey !== objectiveKey ||
      !deliveryValues.has(item.canonicalKey)
    ) {
      return { ...item };
    }
    const value = deliveryValues.get(item.canonicalKey) ?? null;
    return {
      ...item,
      value,
      configured: true,
      hasData: value !== null,
    };
  });
}

function efficiencyLabel(definition: ResultDefinition) {
  switch (definition.efficiencyMetric) {
    case "cost_per_result":
      return `Cost/${definition.shortLabel}`;
    case "rate":
      return `${definition.shortLabel} Rate`;
    case "roas":
      return "Meta-attributed ROAS";
    case "none":
      return null;
  }
}

function efficiencyValue({
  definition,
  resultValue,
  spend,
  clicks,
  value,
  currencyMode,
}: {
  definition: ResultDefinition;
  resultValue: number | null;
  spend: number | null;
  clicks: number | null;
  value: number | null;
  currencyMode: ReportingContext["currencyMode"];
}) {
  if (
    currencyMode === "split" &&
    (definition.efficiencyMetric === "cost_per_result" ||
      definition.efficiencyMetric === "roas")
  ) {
    return null;
  }
  switch (definition.efficiencyMetric) {
    case "cost_per_result":
      return ratio(spend, resultValue);
    case "rate":
      return ratio(resultValue, clicks, true);
    case "roas":
      return ratio(value, spend);
    case "none":
      return null;
  }
}

function efficiencyType(
  efficiencyMetric: ResultEfficiencyMetric,
): ResultMetricValueType {
  return efficiencyMetric === "rate"
    ? "percent"
    : efficiencyMetric === "roas"
      ? "ratio"
      : "currency";
}

function efficiencyFormula(definition: ResultDefinition) {
  const source =
    resultAttribution(definition) === "delivery"
      ? `Meta-reported ${definition.shortLabel}`
      : `Meta-attributed ${definition.shortLabel}`;
  switch (definition.efficiencyMetric) {
    case "cost_per_result":
      return `Spend / ${source}`;
    case "rate":
      return `${source} / Link Clicks × 100`;
    case "roas":
      return "Meta-attributed Value / Spend";
    case "none":
      return "";
  }
}

function directionForResult(definition: ResultDefinition): MetricDirection {
  return definition.direction;
}

function directionForEfficiency(
  definition: ResultDefinition,
): MetricDirection {
  return definition.efficiencyMetric === "cost_per_result"
    ? "lower_is_better"
    : definition.efficiencyMetric === "rate" ||
        definition.efficiencyMetric === "roas"
      ? "higher_is_better"
      : "neutral";
}

/**
 * V2 cards historically exposed only an optional `unavailableReason`. Keep
 * that shape for compatibility, but attach a safe per-card state/direction so
 * V3 never has to infer it from a shared report-level boolean.
 */
function withMetricSemantics(
  card: ResultKpiCard,
  direction: MetricDirection,
): ResultKpiCard {
  const state: MetricState =
    card.value === null
      ? "unavailable"
      : card.value === 0
        ? "zero"
        : "ready";
  return {
    ...card,
    state,
    ...(card.unavailableReason
      ? { reasonCode: card.unavailableReason }
      : card.value === null
        ? { reasonCode: "DATA_UNAVAILABLE" }
        : {}),
    direction,
  };
}

function unavailabilityForEfficiency({
  definition,
  currencyMode,
  resultValue,
  clicks,
}: {
  definition: ResultDefinition;
  currencyMode: ReportingContext["currencyMode"];
  resultValue: number | null;
  clicks: number | null;
}): DynamicResultUnavailableReason | undefined {
  if (
    currencyMode === "split" &&
    (definition.efficiencyMetric === "cost_per_result" ||
      definition.efficiencyMetric === "roas")
  ) {
    return "split_currency";
  }
  if (
    definition.efficiencyMetric === "cost_per_result" &&
    (!resultValue || resultValue <= 0)
  ) {
    return "zero_result";
  }
  if (
    definition.efficiencyMetric === "rate" &&
    (!clicks || clicks <= 0)
  ) {
    return "zero_denominator";
  }
  return undefined;
}

function deliveryCards({
  context,
  spend,
  impressions,
  reach,
  clicks,
}: {
  context: ReportingContext;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
}): ResultKpiCard[] {
  const monetaryAvailable = context.currencyMode === "single";
  const cpm = monetaryAvailable
    ? ratio(spend === null ? null : spend * 1_000, impressions)
    : null;
  const linkCtr = ratio(clicks, impressions, true);
  const linkCpc = monetaryAvailable ? ratio(spend, clicks) : null;
  const frequency = ratio(impressions, reach);
  return ([
    {
      key: "spend",
      label: "Spend",
      value: monetaryAvailable ? spend : null,
      valueType: "currency",
      attribution: "delivery",
      formula: "Meta-reported Spend",
      ...(monetaryAvailable
        ? {}
        : { unavailableReason: "split_currency" as const }),
    },
    {
      key: "impressions",
      label: "Impressions",
      value: impressions,
      valueType: "count",
      attribution: "delivery",
      formula: "Meta-reported Impressions",
    },
    {
      key: "link_clicks",
      label: "Link Clicks",
      value: clicks,
      valueType: "count",
      attribution: "delivery",
      formula: "Meta-reported Link Clicks",
    },
    {
      key: "link_ctr",
      label: "CTR (Link)",
      value: linkCtr,
      valueType: "percent",
      attribution: "delivery",
      formula: "Link Clicks / Impressions × 100",
      ...(impressions === 0
        ? { unavailableReason: "zero_denominator" as const }
        : {}),
    },
    {
      key: "link_cpc",
      label: "CPC (Link)",
      value: linkCpc,
      valueType: "currency",
      attribution: "delivery",
      formula: "Spend / Link Clicks",
      ...(monetaryAvailable
        ? clicks === 0
          ? { unavailableReason: "zero_denominator" as const }
          : {}
        : { unavailableReason: "split_currency" as const }),
    },
    {
      key: "reach",
      label: "Reach",
      value: reach,
      valueType: "count",
      attribution: "delivery",
      formula: "Meta-reported period Reach",
    },
    {
      key: "frequency",
      label: "Frequency",
      value: frequency,
      valueType: "ratio",
      attribution: "delivery",
      formula: "Impressions / period Reach",
      ...(reach === 0
        ? { unavailableReason: "zero_denominator" as const }
        : {}),
    },
    {
      key: "cpm",
      label: "CPM",
      value: cpm,
      valueType: "currency",
      attribution: "delivery",
      formula: "Spend / Impressions × 1,000",
      ...(monetaryAvailable
        ? impressions === 0
          ? { unavailableReason: "zero_denominator" as const }
          : {}
        : { unavailableReason: "split_currency" as const }),
    },
  ] satisfies ResultKpiCard[]).map((card) =>
    withMetricSemantics(
      card,
      getMetricDefinition(card.key)?.direction ?? "neutral",
    ),
  );
}

function displayResultLabel(definition: ResultDefinition) {
  return definition.canonicalKey === "purchase_value"
    ? "Purchase Value (Meta)"
    : definition.label;
}

function displayEfficiencyLabel(definition: ResultDefinition) {
  return definition.efficiencyMetric === "roas"
    ? "ROAS (Meta)"
    : efficiencyLabel(definition);
}

/**
 * Builds the V6 candidate catalog independently of the current primary
 * result. This is what makes Purchase Value/ROAS and Registration available
 * as supporting metrics without changing the report's Primary Result.
 */
function buildResultMetricCandidates({
  context,
  definitions,
  canonicalResults,
  spend,
  clicks,
  value,
}: {
  context: ReportingContext;
  definitions: readonly ResultDefinition[];
  canonicalResults: readonly CanonicalResultValue[];
  spend: number | null;
  clicks: number | null;
  value: number | null;
}): ResultKpiCard[] {
  if (context.objectiveKey === "all") return [];

  const candidates = definitions
    .filter(
      (definition) =>
        definition.enabled &&
        definition.objectiveKeys.includes(context.objectiveKey),
    )
    .sort((left, right) => {
      if (left.canonicalKey === context.primaryResultKey) return -1;
      if (right.canonicalKey === context.primaryResultKey) return 1;
      return left.label.localeCompare(right.label);
    });

  return candidates.flatMap((definition) => {
    const result = canonicalResults.find(
      (item) =>
        item.objectiveKey === context.objectiveKey &&
        item.canonicalKey === definition.canonicalKey,
    );
    const mappingConfigured =
      result?.configured === true ||
      result?.hasData === true ||
      result?.value !== null;
    const resultValue = finiteNonNegative(result?.value);
    const resultUnavailableReason: DynamicResultUnavailableReason | undefined =
      !mappingConfigured
        ? "result_mapping_unavailable"
        : resultValue === null
          ? "result_unavailable"
          : undefined;
    const resultCard = withMetricSemantics(
      {
        key: `result:${definition.canonicalKey}`,
        label: displayResultLabel(definition),
        value: resultUnavailableReason ? null : resultValue,
        valueType: definition.unit,
        attribution: resultAttribution(definition),
        formula: resultFormula(definition),
        canonicalResultKey: definition.canonicalKey,
        ...(resultUnavailableReason
          ? { unavailableReason: resultUnavailableReason }
          : {}),
      },
      directionForResult(definition),
    );

    if (definition.efficiencyMetric === "none") {
      return [resultCard];
    }

    const efficiencyUnavailableReason = resultUnavailableReason ??
      unavailabilityForEfficiency({
        definition,
        currencyMode: context.currencyMode,
        resultValue,
        clicks,
      });
    const label = displayEfficiencyLabel(definition);
    const efficiencyCard = withMetricSemantics(
      {
        key: `efficiency:${definition.canonicalKey}`,
        label: label ?? definition.label,
        value: efficiencyUnavailableReason
          ? null
          : efficiencyValue({
              definition,
              resultValue,
              spend,
              clicks,
              value,
              currencyMode: context.currencyMode,
            }),
        valueType: efficiencyType(definition.efficiencyMetric),
        attribution: resultAttribution(definition),
        formula: efficiencyFormula(definition),
        canonicalResultKey: definition.canonicalKey,
        ...(efficiencyUnavailableReason
          ? { unavailableReason: efficiencyUnavailableReason }
          : {}),
      },
      directionForEfficiency(definition),
    );
    return [resultCard, efficiencyCard];
  });
}

export function buildDynamicResultMetrics({
  context,
  definitions,
  canonicalResults,
  objectiveSpendByObjective,
  spend,
  impressions,
  reach,
  clicks,
  value,
}: {
  context: ReportingContext;
  definitions: readonly ResultDefinition[];
  canonicalResults: readonly CanonicalResultValue[];
  objectiveSpendByObjective?: Readonly<
    Record<string, number | null>
  >;
  spend: number;
  impressions: number;
  reach: number | null;
  clicks: number;
  value: number | null;
}): DynamicResultMetricsModel {
  const safeSpend = finiteNonNegative(spend);
  const safeImpressions = finiteNonNegative(impressions);
  const safeReach = finiteNonNegative(reach);
  const safeClicks = finiteNonNegative(clicks);
  const safeValue = finiteNonNegative(value);
  const visibleValues = visibleResultValues(
    canonicalResults,
    definitions,
  );
  const singleObjectiveValues =
    context.objectiveKey === "all"
      ? []
      : visibleValues.filter(
          (item) => item.objectiveKey === context.objectiveKey,
        );

  const primaryDefinition =
    context.objectiveKey === "all" || !context.primaryResultKey
      ? null
      : definitionByKey(definitions, context.primaryResultKey);
  const primaryValue = primaryDefinition
    ? singleObjectiveValues.find(
        (item) =>
          item.canonicalKey === primaryDefinition.canonicalKey,
      ) ?? null
    : null;
  const primaryAvailable =
    !!primaryDefinition &&
    !!primaryValue &&
    (primaryValue.configured === true ||
      primaryValue.hasData === true ||
      primaryValue.value !== null);

  const kpiCards = deliveryCards({
    context,
    spend: safeSpend,
    impressions: safeImpressions,
    reach: safeReach,
    clicks: safeClicks,
  });

  if (primaryDefinition && primaryAvailable) {
    const existingDeliveryCard = kpiCards.find(
      (card) =>
        resultAttribution(primaryDefinition) === "delivery" &&
        card.key === primaryDefinition.canonicalKey,
    );
    if (existingDeliveryCard) {
      existingDeliveryCard.canonicalResultKey =
        primaryDefinition.canonicalKey;
    } else {
      kpiCards.push(
        withMetricSemantics(
          {
            key: `result:${primaryDefinition.canonicalKey}`,
            label: primaryDefinition.label,
            value: finiteNonNegative(primaryValue.value),
            valueType: primaryDefinition.unit,
            attribution: resultAttribution(primaryDefinition),
            formula: resultFormula(primaryDefinition),
            canonicalResultKey: primaryDefinition.canonicalKey,
          },
          directionForResult(primaryDefinition),
        ),
      );
    }
    const label = efficiencyLabel(primaryDefinition);
    if (label) {
      const unavailableReason = unavailabilityForEfficiency({
        definition: primaryDefinition,
        currencyMode: context.currencyMode,
        resultValue: finiteNonNegative(primaryValue.value),
        clicks: safeClicks,
      });
      kpiCards.push(
        withMetricSemantics(
          {
            key: `efficiency:${primaryDefinition.canonicalKey}`,
            label,
            value: efficiencyValue({
              definition: primaryDefinition,
              resultValue: finiteNonNegative(primaryValue.value),
              spend: safeSpend,
              clicks: safeClicks,
              value: safeValue,
              currencyMode: context.currencyMode,
            }),
            valueType: efficiencyType(
              primaryDefinition.efficiencyMetric,
            ),
            attribution: resultAttribution(primaryDefinition),
            formula: efficiencyFormula(primaryDefinition),
            canonicalResultKey: primaryDefinition.canonicalKey,
            ...(unavailableReason ? { unavailableReason } : {}),
          },
          directionForEfficiency(primaryDefinition),
        ),
      );
    }
  }

  const availableDefinitions = [
    ...new Set(singleObjectiveValues.map((item) => item.canonicalKey)),
  ]
    .map((canonicalKey) => ({
      definition: definitionByKey(definitions, canonicalKey),
      value: singleObjectiveValues.find(
        (item) => item.canonicalKey === canonicalKey,
      ),
    }))
    .filter(
      (
        item,
      ): item is {
        definition: ResultDefinition;
        value: CanonicalResultValue;
      } => !!item.definition && !!item.value,
    )
    .sort((left, right) => {
      if (left.definition.canonicalKey === context.primaryResultKey) {
        return -1;
      }
      if (right.definition.canonicalKey === context.primaryResultKey) {
        return 1;
      }
      return left.definition.label.localeCompare(
        right.definition.label,
      );
    });

  const dynamicTableColumns: DynamicResultTableColumn[] = [];
  for (const { definition } of availableDefinitions) {
    dynamicTableColumns.push({
      key: `result:${definition.canonicalKey}`,
      label: definition.label,
      valueType: definition.unit,
      attribution: resultAttribution(definition),
      canonicalResultKey: definition.canonicalKey,
      sortable: true,
      formula: resultFormula(definition),
    });
    const label = efficiencyLabel(definition);
    const monetaryEfficiency =
      definition.efficiencyMetric === "cost_per_result" ||
      definition.efficiencyMetric === "roas";
    if (
      label &&
      !(context.currencyMode === "split" && monetaryEfficiency)
    ) {
      dynamicTableColumns.push({
        key: `efficiency:${definition.canonicalKey}`,
        label,
        valueType: efficiencyType(definition.efficiencyMetric),
        attribution: resultAttribution(definition),
        canonicalResultKey: definition.canonicalKey,
        sortable:
          context.objectiveKey !== "all" &&
          availableDefinitions.length === 1,
        formula: efficiencyFormula(definition),
      });
    }
  }

  const scatterReason: DynamicResultUnavailableReason | undefined =
    context.objectiveKey === "all"
      ? "all_objectives"
      : !primaryDefinition
        ? "result_not_selected"
        : !primaryAvailable
          ? "result_unavailable"
          : context.currencyMode === "split" &&
              (primaryDefinition.efficiencyMetric ===
                "cost_per_result" ||
                primaryDefinition.efficiencyMetric === "roas")
            ? "split_currency"
            : unavailabilityForEfficiency({
                definition: primaryDefinition,
                currencyMode: context.currencyMode,
                resultValue: finiteNonNegative(primaryValue?.value),
                clicks: safeClicks,
              });
  const scatterLabel = primaryDefinition
    ? efficiencyLabel(primaryDefinition)
    : null;
  const scatter: DynamicResultScatter = {
    enabled: !scatterReason && !!scatterLabel,
    x: {
      metric: "spend",
      label: "Spend",
      valueType: "currency",
    },
    y:
      primaryDefinition && scatterLabel
        ? {
            metric: `efficiency:${primaryDefinition.canonicalKey}`,
            label: scatterLabel,
            valueType: efficiencyType(
              primaryDefinition.efficiencyMetric,
            ),
          }
        : null,
    bubbleSize:
      primaryDefinition && primaryAvailable
        ? {
            metric: `result:${primaryDefinition.canonicalKey}`,
            label: primaryDefinition.label,
            valueType: primaryDefinition.unit,
          }
        : null,
    ...(scatterReason ? { unavailableReason: scatterReason } : {}),
  };

  const groupedByObjective = new Map<
    string,
    CanonicalResultValue[]
  >();
  for (const item of visibleValues) {
    const current = groupedByObjective.get(item.objectiveKey) ?? [];
    current.push(item);
    groupedByObjective.set(item.objectiveKey, current);
  }
  const crossObjectiveKeys = new Set([
    ...groupedByObjective.keys(),
    ...Object.keys(objectiveSpendByObjective ?? {}),
  ]);
  const crossObjectiveSections: CrossObjectiveSection[] =
    context.objectiveKey === "all"
      ? [...crossObjectiveKeys]
          .sort((left, right) => left.localeCompare(right))
          .map((objectiveKey) => {
            const items =
              groupedByObjective.get(objectiveKey) ?? [];
            const hasExplicitSpend = Object.prototype.hasOwnProperty.call(
              objectiveSpendByObjective ?? {},
              objectiveKey,
            );
            const objectiveSpend = hasExplicitSpend
              ? finiteNonNegative(
                  objectiveSpendByObjective?.[objectiveKey],
                )
              : finiteNonNegative(
                  items.find(
                    (item) =>
                      finiteNonNegative(item.spend) !== null,
                  )?.spend,
                );
            return {
              objectiveKey,
              objectiveLabel: resolveObjective(objectiveKey).label,
              spend:
                context.currencyMode === "single"
                  ? objectiveSpend
                  : null,
              results: items.flatMap((item) => {
                const definition = definitionByKey(
                  definitions,
                  item.canonicalKey,
                );
                if (!definition) return [];
                const resultValue = finiteNonNegative(item.value);
                return [
                  {
                    canonicalKey: item.canonicalKey,
                    label: definition.label,
                    value: resultValue,
                    efficiencyLabel: efficiencyLabel(definition),
                    costPerResult:
                      context.currencyMode === "single" &&
                      definition.efficiencyMetric === "cost_per_result"
                        ? ratio(objectiveSpend, resultValue)
                        : null,
                    attribution: resultAttribution(definition),
                    configured: item.configured === true,
                  },
                ];
              }),
              costSortAllowed: false as const,
            };
          })
      : [];

  const costSortMode: CostSortMode =
    context.objectiveKey === "all"
      ? "disabled_cross_objective"
      : context.currencyMode === "split"
        ? "disabled_split_currency"
        : primaryAvailable && availableDefinitions.length === 1
        ? "single_result"
          : "disabled_no_result";

  const metricCandidateMap = new Map<string, ResultKpiCard>(
    kpiCards.map((card) => [card.key, card]),
  );
  for (const candidate of buildResultMetricCandidates({
    context,
    definitions,
    canonicalResults,
    spend: safeSpend,
    clicks: safeClicks,
    value: safeValue,
  })) {
    metricCandidateMap.set(candidate.key, candidate);
  }

  return {
    kpiCards,
    metricCandidates: [...metricCandidateMap.values()],
    dynamicTableColumns,
    scatter,
    crossObjectiveSections,
    availableResults: availableDefinitions.map(
      ({ definition, value: resultValue }) => ({
        canonicalKey: definition.canonicalKey,
        label: definition.label,
        shortLabel: definition.shortLabel,
        objectiveKeys: definition.objectiveKeys,
        attribution: resultAttribution(definition),
        configured: resultValue.configured === true,
        hasData:
          resultValue.hasData === true ||
          resultValue.value !== null,
      }),
    ),
    metadata: {
      resultAttribution: "meta_attributed",
      costSortMode,
      currencyMode: context.currencyMode,
      primaryResultKey:
        primaryDefinition && primaryAvailable
          ? primaryDefinition.canonicalKey
          : null,
    },
  };
}
