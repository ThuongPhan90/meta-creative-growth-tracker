import type {
  EvaluationDataConfidence,
  EvaluationExplanation,
  EvaluationFatigueStatus,
  EvaluationPerformanceStatus,
} from "./creative-evaluation";
import type { ReportingContext } from "./report-context";
import type {
  ReportingCoverage,
  ReportingWarning,
} from "./reporting-response";
import type {
  ConfidenceLevel,
  CreativePerformanceSummary,
  CreativeRow,
  DataStatus,
} from "@/types/view-models";

export const CREATIVE_PERFORMANCE_STATUSES = [
  "above_benchmark",
  "within_benchmark",
  "needs_review",
  "not_eligible",
] as const satisfies readonly EvaluationPerformanceStatus[];

export const CREATIVE_DATA_CONFIDENCE_LEVELS = [
  "high",
  "medium",
  "low",
] as const satisfies readonly EvaluationDataConfidence[];

export const CREATIVE_FATIGUE_STATUSES = [
  "stable",
  "monitor",
  "fatigue_risk",
  "insufficient",
] as const satisfies readonly EvaluationFatigueStatus[];

type ResultValuesSource =
  | "normalized_meta_attributed_result_facts"
  | "demo_legacy_bridge"
  | "unavailable";

function finite(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function unique(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function familyId(row: CreativeRow) {
  return row.creativeFamilyId?.trim() || row.id;
}

function evaluationContract(
  evaluation: EvaluationExplanation | null | undefined,
) {
  if (!evaluation) return null;
  return {
    result_key: evaluation.resultKey,
    metric_key: evaluation.metricKey,
    actual_value: evaluation.actualValue,
    benchmark_value: evaluation.benchmarkValue,
    delta_percent: evaluation.deltaPercent,
    peer_group_label: evaluation.peerGroupLabel,
    sample_size: evaluation.sampleSize,
    eligibility: evaluation.eligibility,
    data_confidence: evaluation.dataConfidence,
    performance_status: evaluation.performanceStatus,
    fatigue_status: evaluation.fatigueStatus,
    recommendation_key: evaluation.recommendationKey,
    reasons: evaluation.reasons,
  };
}

function mergeEntityLinks(
  creativeFamilyId: string,
  rows: readonly CreativeRow[],
) {
  const links = rows.flatMap((row) =>
    row.entityLinks ? [row.entityLinks] : [],
  );
  if (!links.length) return null;
  const first = links[0];
  return {
    creative_family_id: creativeFamilyId,
    asset_id: first.assetId,
    meta_creative_ids: unique(
      links.flatMap((link) => link.metaCreativeIds),
    ),
    ad_ids: unique(links.flatMap((link) => link.adIds)),
    campaign_ids: unique(
      links.flatMap((link) => link.campaignIds),
    ),
    ad_account_ids: unique(
      links.flatMap((link) => link.adAccountIds),
    ),
    page_ids: unique(links.flatMap((link) => link.pageIds)),
  };
}

function mergedResultValues(
  performances: readonly CreativePerformanceSummary[],
  canonicalResultsPresent: boolean,
): {
  values: Record<string, number | null>;
  source: ResultValuesSource;
} {
  if (!performances.length) {
    return {
      values: {},
      source: "unavailable" as const,
    };
  }
  if (!canonicalResultsPresent) {
    return {
      values: {
        install: performances.reduce(
          (sum, performance) => sum + performance.installs,
          0,
        ),
        complete_registration: performances.reduce(
          (sum, performance) =>
            sum + performance.registrations,
          0,
        ),
      },
      source: "demo_legacy_bridge" as const,
    };
  }

  const values = new Map<string, number | null>();
  for (const performance of performances) {
    for (const [key, rawValue] of Object.entries(
      performance.resultValues ?? {},
    )) {
      const value = finite(rawValue);
      const current = values.get(key);
      if (value !== null) {
        values.set(
          key,
          typeof current === "number" ? current + value : value,
        );
      } else if (!values.has(key)) {
        values.set(key, null);
      }
    }
  }
  return {
    values: Object.fromEntries(
      [...values.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    source:
      "normalized_meta_attributed_result_facts" as const,
  };
}

const CONFIDENCE_PRIORITY: Record<ConfidenceLevel, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function weakestConfidence(
  performances: readonly CreativePerformanceSummary[],
  evaluation?: EvaluationExplanation | null,
): EvaluationDataConfidence {
  if (evaluation) return evaluation.dataConfidence;
  return (
    performances
      .flatMap((performance) =>
        performance.confidence?.confidence
          ? [performance.confidence.confidence]
          : [],
      )
      .sort(
        (left, right) =>
          CONFIDENCE_PRIORITY[right] -
          CONFIDENCE_PRIORITY[left],
      )[0] ?? "low"
  );
}

const DATA_STATUS_PRIORITY: Record<DataStatus, number> = {
  ready: 0,
  insufficient: 1,
  partial: 2,
  stale: 3,
  missing_mapping: 4,
};

function weakestDataStatus(
  performances: readonly CreativePerformanceSummary[],
): DataStatus {
  return (
    performances
      .flatMap((performance) =>
        performance.confidence?.dataStatus
          ? [performance.confidence.dataStatus]
          : [],
      )
      .sort(
        (left, right) =>
          DATA_STATUS_PRIORITY[right] -
          DATA_STATUS_PRIORITY[left],
      )[0] ?? "insufficient"
  );
}

function performanceContract({
  performances,
  canonicalResultsPresent,
  primaryResultKey,
}: {
  performances: readonly CreativePerformanceSummary[];
  canonicalResultsPresent: boolean;
  primaryResultKey: string | null;
}) {
  const spend = performances.reduce(
    (sum, performance) => sum + performance.spend,
    0,
  );
  const impressions = performances.reduce(
    (sum, performance) => sum + performance.impressions,
    0,
  );
  const installs = performances.reduce(
    (sum, performance) => sum + performance.installs,
    0,
  );
  const registrations = performances.reduce(
    (sum, performance) => sum + performance.registrations,
    0,
  );
  const linkClicks = performances.reduce((sum, performance) => {
    const linkCtr = finite(performance.linkCtr);
    return (
      sum +
      (linkCtr === null
        ? 0
        : (linkCtr / 100) * performance.impressions)
    );
  }, 0);
  const hasLinkCtr = performances.some(
    (performance) => finite(performance.linkCtr) !== null,
  );
  const video3sViews = performances.reduce((sum, performance) => {
    const hookRate = finite(performance.hookRate);
    return (
      sum +
      (hookRate === null
        ? 0
        : (hookRate / 100) * performance.impressions)
    );
  }, 0);
  const hasHookRate = performances.some(
    (performance) => finite(performance.hookRate) !== null,
  );
  const video100Views = performances.reduce((sum, performance) => {
    const hookRate = finite(performance.hookRate);
    const holdRate = finite(performance.holdRate);
    if (hookRate === null || holdRate === null) return sum;
    return (
      sum +
      (holdRate / 100) *
        ((hookRate / 100) * performance.impressions)
    );
  }, 0);
  const hasHoldRate = performances.some(
    (performance) => finite(performance.holdRate) !== null,
  );
  const resultValues = mergedResultValues(
    performances,
    canonicalResultsPresent,
  );
  const evaluation =
    performances.find((performance) => {
      if (!performance.evaluation) return false;
      return primaryResultKey
        ? performance.evaluation.resultKey === primaryResultKey
        : true;
    })?.evaluation ?? null;
  const primaryResultValue =
    primaryResultKey &&
    Object.prototype.hasOwnProperty.call(
      resultValues.values,
      primaryResultKey,
    )
      ? finite(resultValues.values[primaryResultKey])
      : null;

  return {
    currency: performances[0]?.currency ?? "UNKNOWN",
    date_from: performances
      .map((performance) => performance.dateFrom)
      .sort()[0] ?? null,
    date_to:
      performances
        .map((performance) => performance.dateTo)
        .sort()
        .at(-1) ?? null,
    spend,
    impressions,
    daily_reach_sum: performances.reduce(
      (sum, performance) => sum + performance.dailyReachSum,
      0,
    ),
    link_clicks: hasLinkCtr ? linkClicks : null,
    link_ctr:
      hasLinkCtr && impressions > 0
        ? (linkClicks / impressions) * 100
        : null,
    cpm: impressions > 0 ? (spend / impressions) * 1_000 : null,
    installs,
    registrations,
    cpi: installs > 0 ? spend / installs : null,
    cost_per_registration:
      registrations > 0 ? spend / registrations : null,
    result_values: resultValues.values,
    result_values_source: resultValues.source,
    primary_result_key: primaryResultKey,
    primary_result_value: primaryResultValue,
    cost_per_primary_result:
      primaryResultValue !== null && primaryResultValue > 0
        ? spend / primaryResultValue
        : null,
    hook_rate:
      hasHookRate && impressions > 0
        ? (video3sViews / impressions) * 100
        : null,
    hold_rate:
      hasHoldRate && video3sViews > 0
        ? (video100Views / video3sViews) * 100
        : null,
    data_status: weakestDataStatus(performances),
    data_confidence: weakestConfidence(
      performances,
      evaluation,
    ),
    performance_status:
      evaluation?.performanceStatus ?? "not_eligible",
    fatigue_status: evaluation?.fatigueStatus ?? "insufficient",
    evaluation: evaluationContract(evaluation),
  };
}

function variantPerformanceContract(
  performance: CreativePerformanceSummary,
  canonicalResultsPresent: boolean,
) {
  const resultValues = mergedResultValues(
    [performance],
    canonicalResultsPresent,
  );
  return {
    currency: performance.currency,
    date_from: performance.dateFrom,
    date_to: performance.dateTo,
    spend: performance.spend,
    impressions: performance.impressions,
    daily_reach_sum: performance.dailyReachSum,
    link_ctr: performance.linkCtr,
    installs: performance.installs,
    registrations: performance.registrations,
    cpi: performance.cpi,
    cost_per_registration: performance.costPerRegistration,
    result_values: resultValues.values,
    result_values_source: resultValues.source,
    hook_rate: performance.hookRate,
    hold_rate: performance.holdRate,
    data_status:
      performance.confidence?.dataStatus ?? "insufficient",
    data_confidence:
      performance.evaluation?.dataConfidence ??
      performance.confidence?.confidence ??
      "low",
    performance_status:
      performance.evaluation?.performanceStatus ?? "not_eligible",
    fatigue_status:
      performance.evaluation?.fatigueStatus ?? "insufficient",
    evaluation: evaluationContract(performance.evaluation),
  };
}

export function buildCreativeCollection(
  rows: readonly CreativeRow[],
  context: Pick<ReportingContext, "primaryResultKey">,
) {
  const grouped = new Map<string, CreativeRow[]>();
  for (const row of rows) {
    const id = familyId(row);
    grouped.set(id, [...(grouped.get(id) ?? []), row]);
  }

  return [...grouped.entries()]
    .map(([creativeFamilyId, familyRows]) => {
      const first = familyRows[0];
      const performances = familyRows.flatMap((row) =>
        row.performance ? [row.performance] : [],
      );
      const canonicalResultsPresent = performances.some(
        (performance) => performance.resultValues !== undefined,
      );
      const byCurrency = new Map<
        string,
        CreativePerformanceSummary[]
      >();
      for (const performance of performances) {
        const currency = performance.currency.toUpperCase();
        byCurrency.set(currency, [
          ...(byCurrency.get(currency) ?? []),
          performance,
        ]);
      }
      const entityLinks = mergeEntityLinks(
        creativeFamilyId,
        familyRows,
      );

      return {
        creative_family_id: creativeFamilyId,
        identity_status: familyRows.some(
          (row) => row.creativeFamilyId?.trim() === creativeFamilyId,
        )
          ? ("canonical" as const)
          : ("fallback_row_id" as const),
        display_name: first.name,
        asset_id: entityLinks?.asset_id ?? null,
        asset_key: first.assetKey,
        aliases: unique(
          familyRows.flatMap((row) => row.aliases),
        ),
        format: first.format,
        platforms: unique(
          familyRows.map((row) => row.platform),
        ),
        preview: {
          image_url: first.imageUrl,
          duration: first.duration,
          aspect_ratio: first.ratio,
        },
        page_name: first.pageName,
        readiness: unique(
          familyRows.map((row) => row.readiness),
        ),
        usage_summary: {
          linked_ads: Math.max(
            0,
            ...familyRows.map((row) => row.linkCount),
          ),
          current_ads: Math.max(
            0,
            ...familyRows.map((row) => row.currentAdCount),
          ),
          active_ads: Math.max(
            0,
            ...familyRows.map((row) => row.activeAdCount),
          ),
        },
        entity_links: entityLinks,
        performance_by_currency: [...byCurrency.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([currency, currencyPerformances]) => ({
            ...performanceContract({
              performances: currencyPerformances,
              canonicalResultsPresent,
              primaryResultKey:
                context.primaryResultKey ?? null,
            }),
            currency,
          })),
        variants: familyRows.map((row) => ({
          variant_id: row.id,
          platform: row.platform,
          readiness: row.readiness,
          event_mapping: row.eventMapping,
          performance: row.performance
            ? variantPerformanceContract(
                row.performance,
                canonicalResultsPresent,
              )
            : null,
        })),
      };
    })
    .sort((left, right) =>
      left.display_name.localeCompare(right.display_name),
    );
}

type CreativeCollection = ReturnType<typeof buildCreativeCollection>;

function coverageMetric(
  covered: number,
  total: number,
  basis: string,
) {
  return {
    covered,
    total,
    ratio: total > 0 ? covered / total : total === 0 ? null : 0,
    basis,
  };
}

export function buildCreativeCollectionCoverage(
  creatives: CreativeCollection,
  context: Pick<ReportingContext, "primaryResultKey">,
): ReportingCoverage {
  const total = creatives.length;
  const primaryResultKey = context.primaryResultKey ?? null;
  const resultCoverageTotal = primaryResultKey ? total : 0;

  return {
    creativeIdentity: coverageMetric(
      creatives.filter(
        (creative) => creative.identity_status === "canonical",
      ).length,
      total,
      "canonical_creative_family_id",
    ),
    campaignLinks: coverageMetric(
      creatives.filter(
        (creative) =>
          (creative.entity_links?.campaign_ids.length ?? 0) > 0,
      ).length,
      total,
      "creative_families_linked_to_campaign",
    ),
    adLinks: coverageMetric(
      creatives.filter(
        (creative) =>
          (creative.entity_links?.ad_ids.length ?? 0) > 0,
      ).length,
      total,
      "creative_families_linked_to_ad",
    ),
    resultMapping: coverageMetric(
      primaryResultKey
        ? creatives.filter((creative) =>
            creative.performance_by_currency.some((performance) =>
              Object.prototype.hasOwnProperty.call(
                performance.result_values,
                primaryResultKey,
              ),
            ),
          ).length
        : 0,
      resultCoverageTotal,
      primaryResultKey
        ? `creative_families_with_result:${primaryResultKey}`
        : "not_applicable_no_primary_result",
    ),
    evaluation: coverageMetric(
      primaryResultKey
        ? creatives.filter((creative) =>
            creative.performance_by_currency.some(
              (performance) =>
                performance.evaluation?.result_key ===
                primaryResultKey,
            ),
          ).length
        : 0,
      resultCoverageTotal,
      primaryResultKey
        ? `creative_families_evaluated_for:${primaryResultKey}`
        : "not_applicable_no_primary_result",
    ),
  };
}

export function buildCreativeCollectionWarnings({
  coverage,
  truncated,
}: {
  coverage: ReportingCoverage;
  truncated: boolean;
}): ReportingWarning[] {
  const warnings: ReportingWarning[] = [];
  if (truncated) {
    warnings.push({
      code: "CREATIVE_COLLECTION_TRUNCATED",
      message:
        "Danh sách Creative đã chạm giới hạn truy vấn; tổng và phân phối chỉ phản ánh các bản ghi đã trả về.",
      severity: "warning",
      source: "coverage",
    });
  }
  const resultMapping = coverage.resultMapping;
  if (
    resultMapping &&
    resultMapping.total > 0 &&
    resultMapping.covered < resultMapping.total
  ) {
    warnings.push({
      code: "CREATIVE_RESULT_MAPPING_GAP",
      message:
        "Một số Creative Family chưa có Result chuẩn cho ngữ cảnh báo cáo đã chọn.",
      severity: "warning",
      source: "coverage",
      details: {
        covered: resultMapping.covered,
        total: resultMapping.total,
        basis: resultMapping.basis,
      },
    });
  }
  const identity = coverage.creativeIdentity;
  if (
    identity &&
    identity.total > 0 &&
    identity.covered < identity.total
  ) {
    warnings.push({
      code: "CREATIVE_IDENTITY_COVERAGE_GAP",
      message:
        "Một số Creative chưa có định danh Creative Family chuẩn.",
      severity: "warning",
      source: "coverage",
      details: {
        covered: identity.covered,
        total: identity.total,
      },
    });
  }
  return warnings;
}

function segmentRatio(count: number, total: number) {
  return total > 0 ? count / total : null;
}

const PERFORMANCE_PRIORITY: Record<
  EvaluationPerformanceStatus,
  number
> = {
  not_eligible: 0,
  above_benchmark: 1,
  within_benchmark: 2,
  needs_review: 3,
};

const FATIGUE_PRIORITY: Record<EvaluationFatigueStatus, number> = {
  insufficient: 0,
  stable: 1,
  monitor: 2,
  fatigue_risk: 3,
};

function highestPriority<T extends string>(
  values: readonly T[],
  priority: Record<T, number>,
  fallback: T,
) {
  return (
    [...values].sort(
      (left, right) => priority[right] - priority[left],
    )[0] ?? fallback
  );
}

/**
 * Counts one canonical Creative Family once. Statuses are read by stable key
 * from the evaluation contract; array order and legacy rating labels are
 * deliberately ignored.
 */
export function buildCreativeDistribution(
  creatives: CreativeCollection,
) {
  const total = creatives.length;
  const performanceCounts = new Map<
    EvaluationPerformanceStatus,
    number
  >(CREATIVE_PERFORMANCE_STATUSES.map((status) => [status, 0]));
  const confidenceCounts = new Map<EvaluationDataConfidence, number>(
    CREATIVE_DATA_CONFIDENCE_LEVELS.map((status) => [status, 0]),
  );
  const fatigueCounts = new Map<EvaluationFatigueStatus, number>(
    CREATIVE_FATIGUE_STATUSES.map((status) => [status, 0]),
  );

  for (const creative of creatives) {
    const performances = creative.performance_by_currency;
    const performanceStatus = highestPriority(
      performances.map(
        (performance) => performance.performance_status,
      ),
      PERFORMANCE_PRIORITY,
      "not_eligible",
    );
    const dataConfidence = weakestConfidence(
      creative.variants.flatMap((variant) =>
        variant.performance
          ? [
              {
                currency: variant.performance.currency,
                spend: variant.performance.spend,
                impressions: variant.performance.impressions,
                dailyReachSum:
                  variant.performance.daily_reach_sum,
                linkCtr: variant.performance.link_ctr,
                installs: variant.performance.installs,
                registrations:
                  variant.performance.registrations,
                cpi: variant.performance.cpi,
                costPerRegistration:
                  variant.performance.cost_per_registration,
                hookRate: variant.performance.hook_rate,
                holdRate: variant.performance.hold_rate,
                osBaselineCpi: null,
                rating: null,
                dateFrom: variant.performance.date_from,
                dateTo: variant.performance.date_to,
                confidence: {
                  dataStatus: variant.performance.data_status,
                  confidence:
                    variant.performance.data_confidence,
                  coverageRatio: 0,
                  minimumThresholdMet: false,
                  reasonCodes: [],
                },
              } satisfies CreativePerformanceSummary,
            ]
          : [],
      ),
      null,
    );
    const fatigueStatus = highestPriority(
      performances.map(
        (performance) => performance.fatigue_status,
      ),
      FATIGUE_PRIORITY,
      "insufficient",
    );

    performanceCounts.set(
      performanceStatus,
      (performanceCounts.get(performanceStatus) ?? 0) + 1,
    );
    confidenceCounts.set(
      dataConfidence,
      (confidenceCounts.get(dataConfidence) ?? 0) + 1,
    );
    fatigueCounts.set(
      fatigueStatus,
      (fatigueCounts.get(fatigueStatus) ?? 0) + 1,
    );
  }

  return {
    entity_basis: "canonical_creative_family" as const,
    total_creative_families: total,
    performance_status: CREATIVE_PERFORMANCE_STATUSES.map((key) => {
      const count = performanceCounts.get(key) ?? 0;
      return { key, count, ratio: segmentRatio(count, total) };
    }),
    data_confidence: CREATIVE_DATA_CONFIDENCE_LEVELS.map((key) => {
      const count = confidenceCounts.get(key) ?? 0;
      return { key, count, ratio: segmentRatio(count, total) };
    }),
    fatigue_status: CREATIVE_FATIGUE_STATUSES.map((key) => {
      const count = fatigueCounts.get(key) ?? 0;
      return { key, count, ratio: segmentRatio(count, total) };
    }),
  };
}

export function creativeResultValuesSource(
  creatives: CreativeCollection,
): ResultValuesSource {
  const sources = new Set(
    creatives.flatMap((creative) =>
      creative.performance_by_currency.map(
        (performance) => performance.result_values_source,
      ),
    ),
  );
  if (sources.has("normalized_meta_attributed_result_facts")) {
    return "normalized_meta_attributed_result_facts";
  }
  if (sources.has("demo_legacy_bridge")) {
    return "demo_legacy_bridge";
  }
  return "unavailable";
}
