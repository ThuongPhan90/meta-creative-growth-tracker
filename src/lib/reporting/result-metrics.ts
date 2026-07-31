import type { ReportingContext } from "./report-context";
import { resolveObjective } from "./objective-registry";
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
 * action-array facts. Overlay those exact sources without enabling the legacy
 * Install/Registration bridge used only by demo mode.
 */
export function withDeliveryBackedResultValues({
  values,
  impressions,
  reach,
  linkClicks,
}: {
  values: readonly CanonicalResultValue[];
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
    if (!deliveryValues.has(item.canonicalKey)) return { ...item };
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
}: {
  context: ReportingContext;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
}): ResultKpiCard[] {
  const monetaryAvailable = context.currencyMode === "single";
  return [
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
      value: ratio(impressions, reach),
      valueType: "ratio",
      attribution: "delivery",
      formula: "Impressions / period Reach",
    },
    {
      key: "cpm",
      label: "CPM",
      value: monetaryAvailable
        ? ratio(
            spend === null ? null : spend * 1_000,
            impressions,
          )
        : null,
      valueType: "currency",
      attribution: "delivery",
      formula: "Spend / Impressions × 1,000",
      ...(monetaryAvailable
        ? {}
        : { unavailableReason: "split_currency" as const }),
    },
  ];
}

export function buildDynamicResultMetrics({
  context,
  definitions,
  canonicalResults,
  spend,
  impressions,
  reach,
  clicks,
  value,
}: {
  context: ReportingContext;
  definitions: readonly ResultDefinition[];
  canonicalResults: readonly CanonicalResultValue[];
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
      kpiCards.push({
        key: `result:${primaryDefinition.canonicalKey}`,
        label: primaryDefinition.label,
        value: finiteNonNegative(primaryValue.value),
        valueType: primaryDefinition.unit,
        attribution: resultAttribution(primaryDefinition),
        formula: resultFormula(primaryDefinition),
        canonicalResultKey: primaryDefinition.canonicalKey,
      });
    }
    const label = efficiencyLabel(primaryDefinition);
    if (label) {
      const unavailableReason = unavailabilityForEfficiency({
        definition: primaryDefinition,
        currencyMode: context.currencyMode,
        resultValue: finiteNonNegative(primaryValue.value),
        clicks: safeClicks,
      });
      kpiCards.push({
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
      });
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
  const crossObjectiveSections: CrossObjectiveSection[] =
    context.objectiveKey === "all"
      ? [...groupedByObjective.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([objectiveKey, items]) => {
            const objectiveSpend =
              finiteNonNegative(
                items.find(
                  (item) =>
                    finiteNonNegative(item.spend) !== null,
                )?.spend,
              ) ?? null;
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
                    costPerResult:
                      context.currencyMode === "single"
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

  return {
    kpiCards,
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
