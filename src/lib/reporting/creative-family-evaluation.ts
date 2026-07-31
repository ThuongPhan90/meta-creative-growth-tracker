import type {
  CanonicalCreativeFamilyResultTotals,
  CreativePerformanceItem,
} from "@/lib/db";
import type {
  CreativePerformanceSummary,
  CreativeRow,
  DataConfidence,
} from "@/types/view-models";

import {
  selectBenchmark,
  type BenchmarkMetricDefinition,
  type BenchmarkObservation,
} from "./benchmark-engine";
import { evaluateCreative } from "./creative-evaluation";
import type { ReportingContext } from "./report-context";
import type { ResultDefinition } from "./result-definition";

export type AccountCreativePerformance = {
  adAccountMetaId: string;
  items: readonly CreativePerformanceItem[];
};

export type CreativeFamilyEvaluationLabels = {
  accountNames?: Readonly<Record<string, string>>;
  businessNames?: Readonly<Record<string, string>>;
  selectedScope?: string;
};

export type EnrichCreativeFamiliesInput = {
  rows: readonly CreativeRow[];
  actualResults: CanonicalCreativeFamilyResultTotals;
  benchmarkResults: CanonicalCreativeFamilyResultTotals;
  benchmarkPerformance: readonly AccountCreativePerformance[];
  assetFamilyIds: Readonly<Record<string, string>>;
  accountBusinessIds: Readonly<Record<string, readonly string[]>>;
  context: ReportingContext;
  definitions: readonly ResultDefinition[];
  benchmarkWindowDays: number;
  minimumPeerSampleSize?: number;
  labels?: CreativeFamilyEvaluationLabels;
};

type FamilyAggregate = {
  familyId: string;
  currency: string;
  format: string;
  spend: number;
  impressions: number;
  linkClicks: number;
  accountIds: Set<string>;
  confidence: CreativePerformanceSummary["confidence"];
  rowIndexes: number[];
};

function familyId(row: CreativeRow) {
  return row.creativeFamilyId ?? row.entityLinks?.creativeFamilyId ?? null;
}

function familyCurrencyKey(family: string, currency: string) {
  return `${family}\u001f${currency.toUpperCase()}`;
}

function accountFamilyCurrencyKey(
  account: string,
  family: string,
  currency: string,
) {
  return `${account}\u001f${familyCurrencyKey(family, currency)}`;
}

function expectedMetricSource(definition: ResultDefinition) {
  return definition.unit === "currency"
    ? ("action_value" as const)
    : ("action" as const);
}

function canonicalFormat(value: CreativeRow["format"]) {
  if (value === "Video") return "video";
  if (value === "Banner") return "image";
  if (value === "Carousel") return "carousel";
  return "unknown";
}

function performanceFormat(
  values: readonly CreativePerformanceItem[],
) {
  const formats = new Set(
    values.map((item) =>
      item.assetType === "video"
        ? "video"
        : item.assetType === "image"
          ? "image"
          : "unknown",
    ),
  );
  return formats.size === 1 ? [...formats][0] : "mixed";
}

function weakestConfidence(
  values: Array<CreativePerformanceSummary["confidence"]>,
) {
  const present = values.filter(
    (value): value is DataConfidence => value !== undefined,
  );
  if (!present.length) return undefined;
  const rank = { high: 2, medium: 1, low: 0 } as const;
  return [...present].sort(
    (left, right) =>
      rank[left.confidence] - rank[right.confidence],
  )[0];
}

function evaluationConfidence(
  confidence: CreativePerformanceSummary["confidence"],
) {
  return confidence?.confidence ?? "low";
}

function metricDefinition(
  definition: ResultDefinition,
): BenchmarkMetricDefinition | null {
  if (definition.efficiencyMetric === "none") return null;
  return {
    metricKey: definition.efficiencyMetric,
    direction: definition.direction,
    aggregation:
      definition.efficiencyMetric === "cost_per_result"
        ? "cost_per_result"
        : "weighted_mean",
  };
}

function metricValue({
  definition,
  spend,
  results,
  linkClicks,
}: {
  definition: ResultDefinition;
  spend: number;
  results: number;
  linkClicks: number;
}) {
  if (definition.efficiencyMetric === "cost_per_result") {
    return results > 0 ? spend / results : null;
  }
  if (definition.efficiencyMetric === "rate") {
    return linkClicks > 0 ? (results / linkClicks) * 100 : null;
  }
  if (definition.efficiencyMetric === "roas") {
    return spend > 0 ? results / spend : null;
  }
  return null;
}

function observation({
  sampleKey,
  adAccountId,
  businessId,
  objectiveKey,
  resultKey,
  format,
  currency,
  definition,
  spend,
  results,
  linkClicks,
}: {
  sampleKey: string;
  adAccountId: string;
  businessId: string | null;
  objectiveKey: string;
  resultKey: string;
  format: string;
  currency: string;
  definition: ResultDefinition;
  spend: number;
  results: number;
  linkClicks: number;
}): BenchmarkObservation {
  const value = metricValue({
    definition,
    spend,
    results,
    linkClicks,
  });
  const weight =
    definition.efficiencyMetric === "rate"
      ? linkClicks
      : definition.efficiencyMetric === "roas"
        ? spend
        : undefined;
  return {
    sampleKey,
    adAccountId,
    businessId,
    objectiveKey,
    resultKey,
    format,
    currency,
    spend,
    results,
    value,
    weight,
  };
}

function addResultValue(
  grouped: Map<string, Map<string, number>>,
  key: string,
  resultKey: string,
  value: number,
) {
  const values = grouped.get(key) ?? new Map<string, number>();
  values.set(resultKey, (values.get(resultKey) ?? 0) + value);
  grouped.set(key, values);
}

function resultValuesByFamily({
  batch,
  definitions,
  objectiveKey,
}: {
  batch: CanonicalCreativeFamilyResultTotals;
  definitions: readonly ResultDefinition[];
  objectiveKey: string;
}) {
  const grouped = new Map<string, Map<string, number>>();
  if (!batch.available) return grouped;
  const byKey = new Map(
    definitions
      .filter((definition) => definition.enabled)
      .map((definition) => [definition.canonicalKey, definition]),
  );
  for (const item of batch.results) {
    if (
      item.allocationMethod !== "single_asset" ||
      !item.creativeFamilyId ||
      item.objectiveKey !== objectiveKey
    ) {
      continue;
    }
    const definition = byKey.get(item.canonicalResultKey);
    if (
      !definition ||
      item.metricSource !== expectedMetricSource(definition)
    ) {
      continue;
    }
    addResultValue(
      grouped,
      familyCurrencyKey(item.creativeFamilyId, item.currency),
      item.canonicalResultKey,
      item.value,
    );
  }
  return grouped;
}

function benchmarkResultValues({
  batch,
  definition,
  objectiveKey,
}: {
  batch: CanonicalCreativeFamilyResultTotals;
  definition: ResultDefinition;
  objectiveKey: string;
}) {
  const grouped = new Map<string, number>();
  if (!batch.available) return grouped;
  for (const item of batch.results) {
    if (
      item.allocationMethod !== "single_asset" ||
      !item.creativeFamilyId ||
      item.objectiveKey !== objectiveKey ||
      item.canonicalResultKey !== definition.canonicalKey ||
      item.metricSource !== expectedMetricSource(definition)
    ) {
      continue;
    }
    const key = accountFamilyCurrencyKey(
      item.adAccountMetaId,
      item.creativeFamilyId,
      item.currency,
    );
    grouped.set(key, (grouped.get(key) ?? 0) + item.value);
  }
  return grouped;
}

function aggregateActualRows(rows: readonly CreativeRow[]) {
  const grouped = new Map<string, FamilyAggregate>();
  rows.forEach((row, rowIndex) => {
    const performance = row.performance;
    const canonicalFamilyId = familyId(row);
    if (!performance || !canonicalFamilyId) return;
    const key = familyCurrencyKey(
      canonicalFamilyId,
      performance.currency,
    );
    const current = grouped.get(key) ?? {
      familyId: canonicalFamilyId,
      currency: performance.currency.toUpperCase(),
      format: canonicalFormat(row.format),
      spend: 0,
      impressions: 0,
      linkClicks: 0,
      accountIds: new Set<string>(),
      confidence: undefined,
      rowIndexes: [],
    };
    current.spend += performance.spend;
    current.impressions += performance.impressions;
    current.linkClicks +=
      performance.linkCtr === null
        ? 0
        : (performance.linkCtr / 100) * performance.impressions;
    current.rowIndexes.push(rowIndex);
    for (const accountId of row.entityLinks?.adAccountIds ?? []) {
      current.accountIds.add(accountId);
    }
    current.confidence = weakestConfidence([
      current.confidence,
      performance.confidence,
    ]);
    grouped.set(key, current);
  });
  return grouped;
}

function benchmarkObservations({
  groups,
  resultValues,
  assetFamilyIds,
  accountBusinessIds,
  context,
  definition,
}: {
  groups: readonly AccountCreativePerformance[];
  resultValues: ReadonlyMap<string, number>;
  assetFamilyIds: Readonly<Record<string, string>>;
  accountBusinessIds: Readonly<Record<string, readonly string[]>>;
  context: ReportingContext;
  definition: ResultDefinition;
}) {
  const performance = new Map<
    string,
    {
      accountId: string;
      familyId: string;
      currency: string;
      spend: number;
      impressions: number;
      linkClicks: number;
      items: CreativePerformanceItem[];
    }
  >();
  for (const group of groups) {
    for (const item of group.items) {
      const canonicalFamilyId =
        item.creativeFamilyId ??
        assetFamilyIds[item.creativeAssetId] ??
        null;
      if (!canonicalFamilyId) continue;
      const key = accountFamilyCurrencyKey(
        group.adAccountMetaId,
        canonicalFamilyId,
        item.currency,
      );
      const current = performance.get(key) ?? {
        accountId: group.adAccountMetaId,
        familyId: canonicalFamilyId,
        currency: item.currency.toUpperCase(),
        spend: 0,
        impressions: 0,
        linkClicks: 0,
        items: [],
      };
      current.spend += item.spend;
      current.impressions += item.impressions;
      current.linkClicks += item.linkClicks;
      current.items.push(item);
      performance.set(key, current);
    }
  }

  return [...performance.entries()].map(([key, item]) => {
    const businesses = (accountBusinessIds[item.accountId] ?? []).filter(
      (businessId) => context.businessIds.includes(businessId),
    );
    return observation({
      sampleKey: familyCurrencyKey(item.familyId, item.currency),
      adAccountId: item.accountId,
      businessId: businesses.length === 1 ? businesses[0] : null,
      objectiveKey: context.objectiveKey,
      resultKey: definition.canonicalKey,
      format: performanceFormat(item.items),
      currency: item.currency,
      definition,
      spend: item.spend,
      results: resultValues.get(key) ?? 0,
      linkClicks: item.linkClicks,
    });
  });
}

/**
 * Adds live normalized Result values and an auditable evaluation to Creative
 * Family rows. Values are written to exactly one row per Family/currency so
 * downstream OS aggregation cannot duplicate Ad-level Result facts.
 */
export function enrichCreativeFamiliesWithCanonicalResults({
  rows,
  actualResults,
  benchmarkResults,
  benchmarkPerformance,
  assetFamilyIds,
  accountBusinessIds,
  context,
  definitions,
  benchmarkWindowDays,
  minimumPeerSampleSize = 3,
  labels,
}: EnrichCreativeFamiliesInput): CreativeRow[] {
  const enriched: CreativeRow[] = rows.map((row) => ({
    ...row,
    performance: row.performance
      ? {
          ...row.performance,
          // Presence means live normalized facts are authoritative. An empty
          // object intentionally blocks the demo-only Install fallback.
          resultValues: {},
          evaluation: null,
        }
      : null,
  }));
  if (context.objectiveKey === "all") return enriched;

  const valuesByFamily = resultValuesByFamily({
    batch: actualResults,
    definitions,
    objectiveKey: context.objectiveKey,
  });
  const actualGroups = aggregateActualRows(enriched);
  for (const [key, aggregate] of actualGroups) {
    const representative = aggregate.rowIndexes[0];
    const performance = enriched[representative]?.performance;
    if (!performance) continue;
    performance.resultValues = Object.fromEntries(
      valuesByFamily.get(key) ?? [],
    );
  }

  const resultKey = context.primaryResultKey;
  const definition =
    resultKey &&
    definitions.find(
      (item) =>
        item.enabled &&
        item.canonicalKey === resultKey &&
        item.objectiveKeys.includes(context.objectiveKey),
    );
  const metric = definition ? metricDefinition(definition) : null;
  if (
    !actualResults.available ||
    !benchmarkResults.available ||
    !definition ||
    !metric ||
    context.currencyMode !== "single"
  ) {
    return enriched;
  }

  const peerResults = benchmarkResultValues({
    batch: benchmarkResults,
    definition,
    objectiveKey: context.objectiveKey,
  });
  const peers = benchmarkObservations({
    groups: benchmarkPerformance,
    resultValues: peerResults,
    assetFamilyIds,
    accountBusinessIds,
    context,
    definition,
  });
  const selectedAccounts = new Set(context.adAccountIds);

  for (const [key, aggregate] of actualGroups) {
    if (context.currency && aggregate.currency !== context.currency) {
      continue;
    }
    const representative = aggregate.rowIndexes[0];
    const performance = enriched[representative]?.performance;
    if (!performance) continue;
    const results =
      valuesByFamily.get(key)?.get(definition.canonicalKey) ?? 0;
    const actualValue = metricValue({
      definition,
      spend: aggregate.spend,
      results,
      linkClicks: aggregate.linkClicks,
    });
    const familyAccounts = [...aggregate.accountIds].filter((accountId) =>
      selectedAccounts.has(accountId),
    );
    const targetAccountId =
      context.adAccountIds.length === 1
        ? context.adAccountIds[0]
        : familyAccounts.length === 1
          ? familyAccounts[0]
          : "__selected_scope__";
    const targetBusinesses =
      accountBusinessIds[targetAccountId] ?? [];
    const selection = selectBenchmark({
      target: {
        sampleKey: familyCurrencyKey(
          aggregate.familyId,
          aggregate.currency,
        ),
        adAccountId: targetAccountId,
        selectedBusinessIds: context.businessIds,
        selectedAdAccountIds: context.adAccountIds,
        objectiveKey: context.objectiveKey,
        resultKey: definition.canonicalKey,
        format: aggregate.format,
        currency: aggregate.currency,
        labels: {
          adAccount:
            labels?.accountNames?.[targetAccountId] ??
            targetAccountId,
          selectedBusiness:
            targetBusinesses.length === 1
              ? labels?.businessNames?.[targetBusinesses[0]] ??
                targetBusinesses[0]
              : "Business đã chọn",
          selectedScope:
            labels?.selectedScope ??
            `${context.adAccountIds.length} Ad Account đã chọn`,
          objective: context.objectiveKey,
          result: definition.label,
          format: aggregate.format,
        },
      },
      metric,
      candidatePools: {
        account_objective_result_format: peers,
        account_objective_result: peers,
        selected_business_objective_result_format: peers,
        selected_scope_objective_result: peers,
      },
      minimumSampleSize: minimumPeerSampleSize,
    });
    performance.evaluation = evaluateCreative({
      resultKey: definition.canonicalKey,
      metricKey: metric.metricKey,
      direction: definition.direction,
      actualValue,
      benchmarkValue: selection.value,
      peerGroupLabel: selection.label,
      sampleSize: selection.sampleSize,
      impressions: aggregate.impressions,
      primaryResults: results,
      spend: aggregate.spend,
      minimumImpressions: definition.minimumImpressions,
      minimumResults: definition.minimumResults,
      dataConfidence: evaluationConfidence(aggregate.confidence),
      mappingAvailable: true,
      windowDays: Math.max(1, Math.floor(benchmarkWindowDays)),
      // Trend requires period-over-period family facts. Until that exact
      // series exists, the evaluator returns "insufficient" rather than
      // inventing a fatigue signal from one aggregate.
    });
  }

  return enriched;
}
