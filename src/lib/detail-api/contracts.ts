import { buildDataHealthIssueDetailsFromRuns } from "@/lib/data-contract";
import type {
  CreativeRow,
  DataConfidence,
  Freshness,
  RatingExplanation,
  SyncRunView,
} from "@/types/view-models";

export type DetailEntityKind =
  | "creative-family"
  | "campaign"
  | "data-health-issue";

const CANONICAL_ID_PATTERNS: Record<DetailEntityKind, RegExp> = {
  "creative-family": /^cf_[a-f0-9]{24}$/,
  campaign: /^\d{1,32}$/,
  "data-health-issue": /^issue_[a-f0-9]{24}$/,
};

export function canonicalDetailId(
  kind: DetailEntityKind,
  value: string,
) {
  const normalized = value.trim();
  return CANONICAL_ID_PATTERNS[kind].test(normalized)
    ? normalized
    : null;
}

export function freshnessContract(freshness: Freshness) {
  return {
    last_synced_at: freshness.lastSyncedAt,
    data_through_at: freshness.dataThroughAt,
    sync_status: freshness.syncStatus,
    freshness_seconds: freshness.freshnessSeconds,
    sync_mode: freshness.syncMode,
  };
}

function confidenceContract(confidence: DataConfidence | undefined) {
  if (!confidence) return null;
  return {
    data_status: confidence.dataStatus,
    confidence: confidence.confidence,
    coverage_ratio: confidence.coverageRatio,
    minimum_threshold_met: confidence.minimumThresholdMet,
    reason_codes: confidence.reasonCodes,
  };
}

function ratingContract(explanation: RatingExplanation | null | undefined) {
  if (!explanation) return null;
  return {
    rating: explanation.rating,
    performance_status: explanation.performanceStatus,
    recommended_action: explanation.recommendedAction,
    primary_metric: explanation.primaryMetric,
    actual_value: explanation.actualValue,
    benchmark_value: explanation.benchmarkValue,
    delta_percent: explanation.deltaPercent,
    benchmark_scope: {
      os: explanation.benchmarkScope.os,
      format: explanation.benchmarkScope.format,
      currency: explanation.benchmarkScope.currency,
      window_days: explanation.benchmarkScope.windowDays,
      sample_size: explanation.benchmarkScope.sampleSize,
    },
    thresholds: {
      good_max_ratio: explanation.thresholds.goodMaxRatio,
      within_range_max_ratio:
        explanation.thresholds.withinRangeMaxRatio,
    },
    reasons: explanation.reasons,
    confidence: confidenceContract(explanation.confidence),
  };
}

export function creativeFamilyContract(
  creativeFamilyId: string,
  rows: readonly CreativeRow[],
  freshness: Freshness,
) {
  const variants = rows.filter(
    (row) => row.creativeFamilyId === creativeFamilyId,
  );
  const primary = variants[0];
  if (!primary) return null;

  const entityLinks = primary.entityLinks;
  return {
    creative_family_id: creativeFamilyId,
    display_name: primary.name,
    asset_id: entityLinks?.assetId ?? null,
    asset_key: primary.assetKey,
    aliases: primary.aliases,
    format: primary.format,
    preview: {
      image_url: primary.imageUrl,
      duration: primary.duration,
      aspect_ratio: primary.ratio,
    },
    usage_summary: {
      linked_ads: primary.linkCount,
      current_ads: primary.currentAdCount,
      active_ads: primary.activeAdCount,
      page_name: primary.pageName,
    },
    entity_links: entityLinks
      ? {
          creative_family_id: entityLinks.creativeFamilyId,
          asset_id: entityLinks.assetId,
          meta_creative_ids: entityLinks.metaCreativeIds,
          ad_ids: entityLinks.adIds,
          campaign_ids: entityLinks.campaignIds,
          ad_account_ids: entityLinks.adAccountIds,
          page_ids: entityLinks.pageIds,
        }
      : null,
    variants: variants.map((variant) => ({
      variant_id: variant.id,
      platform: variant.platform,
      readiness: variant.readiness,
      performance_label: variant.performanceLabel,
      event_mapping: variant.eventMapping,
      performance: variant.performance
        ? {
            currency: variant.performance.currency,
            date_from: variant.performance.dateFrom,
            date_to: variant.performance.dateTo,
            spend: variant.performance.spend,
            impressions: variant.performance.impressions,
            daily_reach_sum: variant.performance.dailyReachSum,
            link_ctr: variant.performance.linkCtr,
            installs: variant.performance.installs,
            registrations: variant.performance.registrations,
            cpi: variant.performance.cpi,
            cost_per_registration:
              variant.performance.costPerRegistration,
            hook_rate: variant.performance.hookRate,
            hold_rate: variant.performance.holdRate,
            os_baseline_cpi: variant.performance.osBaselineCpi,
            data_confidence: confidenceContract(
              variant.performance.confidence,
            ),
            rating_explanation: ratingContract(
              variant.performance.ratingExplanation,
            ),
          }
        : null,
    })),
    freshness: freshnessContract(freshness),
  };
}

export function dataHealthIssueDetails(runs: readonly SyncRunView[]) {
  return buildDataHealthIssueDetailsFromRuns(runs).map((detail) => ({
    issue: detail.issue,
    occurrences: detail.occurrences.map((occurrence) => ({
      sync_run_id: occurrence.syncRunId,
      occurred_at: occurrence.occurredAt,
      resource: occurrence.resource,
      technical_message: occurrence.technicalMessage,
    })),
  }));
}

export function dataHealthIssueContract(
  issueId: string,
  runs: readonly SyncRunView[],
  freshness: Freshness,
) {
  const detail = dataHealthIssueDetails(runs).find(
    (item) => item.issue.issueId === issueId,
  );
  if (!detail) return null;

  return {
    issue_id: detail.issue.issueId,
    severity: detail.issue.severity,
    user_message: detail.issue.userMessage,
    technical_code: detail.issue.technicalCode,
    occurrence_count: detail.issue.occurrenceCount,
    affected_group_count: detail.issue.affectedGroupCount,
    impact: detail.issue.impact,
    affected_entities: detail.issue.affectedEntities.map((entity) => ({
      entity_type: entity.entityType,
      entity_id: entity.entityId,
      label: entity.label,
    })),
    first_occurred_at: detail.issue.firstOccurredAt,
    last_occurred_at: detail.issue.lastOccurredAt,
    occurrences: detail.occurrences,
    freshness: freshnessContract(freshness),
  };
}
