import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "./client";
import { TrackerRepository } from "./repository";
import type { CanonicalResultTotalsFilters } from "./types";

const filters: CanonicalResultTotalsFilters = {
  connectionId: "connection-1",
  dateFrom: "2026-07-01",
  dateTo: "2026-07-31",
  adAccountIds: ["act_100", "act_200"],
  campaignMetaIds: ["campaign-sales", "campaign-leads"],
  objectiveKeys: ["sales", "leads"],
  objectiveMappings: [
    {
      objectiveKey: "sales",
      rawObjectiveKeys: ["OUTCOME_SALES"],
    },
    {
      objectiveKey: "leads",
      rawObjectiveKeys: ["OUTCOME_LEADS"],
    },
  ],
  currency: "usd",
  attributionWindow: "7d_click_1d_view",
  actionReportTime: "mixed",
  syncVersion: "run-9",
  resultMappingVersion: "result-map-v1:current",
};

const snapshot = {
  snapshot_status: "available",
  snapshot_sync_version: "run-9",
  snapshot_result_mapping_version: "result-map-v1:current",
};

function databaseMock(rows: Record<string, unknown>[]) {
  return vi
    .fn<
      (
        query: string,
        parameters?: unknown[],
      ) => Promise<Record<string, unknown>[]>
    >()
    .mockResolvedValue(rows);
}

function compactSql(query: string) {
  return query.replace(/\s+/g, " ").trim();
}

function expectAccountDefaultAwareAttributionFilter(input: {
  query: string;
  metricAlias: string;
}) {
  expect(compactSql(input.query)).toContain(
    `$7 = 'account_default' or ${input.metricAlias}.attribution_window = $7`,
  );
}

describe("canonical entity result batches", () => {
  it("returns Purchase and Lead by account plus Campaign in one pinned query", async () => {
    const unsafe = databaseMock([
      {
        ...snapshot,
        account_meta_id: "act_100",
        entity_key: "campaign-sales",
        allocation_method: "campaign",
        canonical_result_key: "purchase",
        objective_key: "sales",
        metric_source: "action",
        currency: "USD",
        value: "7",
      },
      {
        ...snapshot,
        account_meta_id: "act_200",
        entity_key: "campaign-leads",
        allocation_method: "campaign",
        canonical_result_key: "lead",
        objective_key: "leads",
        metric_source: "action",
        currency: "USD",
        value: "12",
      },
      {
        ...snapshot,
        account_meta_id: "act_100",
        entity_key: "campaign-sales",
        allocation_method: "campaign",
        canonical_result_key: "purchase_value",
        objective_key: "sales",
        metric_source: "action_value",
        currency: "USD",
        value: "700",
      },
      {
        ...snapshot,
        account_meta_id: "act_200",
        entity_key: "campaign-leads",
        allocation_method: "campaign",
        canonical_result_key: "link_click",
        objective_key: "leads",
        metric_source: "delivery",
        currency: "USD",
        value: "33",
      },
    ]);
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(
      repository.getCanonicalCampaignResultTotals(filters),
    ).resolves.toEqual({
      available: true,
      syncVersion: "run-9",
      resultMappingVersion: "result-map-v1:current",
      results: [
        {
          adAccountMetaId: "act_100",
          campaignMetaId: "campaign-sales",
          canonicalResultKey: "purchase",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "USD",
          value: 7,
        },
        {
          adAccountMetaId: "act_200",
          campaignMetaId: "campaign-leads",
          canonicalResultKey: "lead",
          objectiveKey: "leads",
          metricSource: "action",
          currency: "USD",
          value: 12,
        },
        {
          adAccountMetaId: "act_100",
          campaignMetaId: "campaign-sales",
          canonicalResultKey: "purchase_value",
          objectiveKey: "sales",
          metricSource: "action_value",
          currency: "USD",
          value: 700,
        },
        {
          adAccountMetaId: "act_200",
          campaignMetaId: "campaign-leads",
          canonicalResultKey: "link_click",
          objectiveKey: "leads",
          metricSource: "delivery",
          currency: "USD",
          value: 33,
        },
      ],
    });

    expect(unsafe).toHaveBeenCalledOnce();
    const [query, parameters] = unsafe.mock.calls[0];
    expect(query).toContain(
      "scope.campaign_meta_id as entity_key",
    );
    expect(query).toContain("scope.account_meta_id");
    expect(query).toContain("tracker.action_metric_daily");
    expect(query).toContain("tracker.action_value_daily");
    expect(query).toContain(
      "fact.sync_version = scope.snapshot_sync_version",
    );
    expect(query).toContain(
      "fact.result_mapping_version =",
    );
    expectAccountDefaultAwareAttributionFilter({
      query,
      metricAlias: "fact",
    });
    expect(query).toContain("fact.action_report_time = $8");
    expect(query).toContain("from tracker.daily_metrics metric");
    expect(query).toContain(
      "scope.campaign_meta_id as entity_key",
    );
    expect(query).toContain(
      "sum(metric.impressions)::numeric as impressions",
    );
    expect(query).toContain(
      "sum(metric.link_clicks)::numeric as link_clicks",
    );
    expect(query).toContain(
      "metric.sync_version = scope.snapshot_sync_version",
    );
    expect(query).toContain(
      "scope.snapshot_result_mapping_version = $11",
    );
    expectAccountDefaultAwareAttributionFilter({
      query,
      metricAlias: "metric",
    });
    expect(compactSql(query)).toContain(
      "upper(metric.currency) = $6",
    );
    expect(compactSql(query)).toContain(
      "metric.metric_date between $2::date and $3::date",
    );
    expect(compactSql(query)).toContain(
      "metric.action_report_time = $8",
    );
    expect(compactSql(query)).toContain(
      "campaign.meta_campaign_id = any($12::text[])",
    );
    expect(
      compactSql(query).match(
        /fact\.canonical_result_key not in \( 'reach', 'impressions', 'link_click' \)/g,
      ),
    ).toHaveLength(2);
    expect(query).not.toContain(
      "'reach'::text as canonical_result_key",
    );
    expect(parameters).toEqual([
      "connection-1",
      "2026-07-01",
      "2026-07-31",
      ["act_100", "act_200"],
      ["sales", "leads"],
      "USD",
      "7d_click_1d_view",
      "mixed",
      [
        {
          objective_key: "sales",
          raw_objective_key: "SALES",
        },
        {
          objective_key: "sales",
          raw_objective_key: "OUTCOME_SALES",
        },
        {
          objective_key: "leads",
          raw_objective_key: "LEADS",
        },
        {
          objective_key: "leads",
          raw_objective_key: "OUTCOME_LEADS",
        },
      ],
      "run-9",
      "result-map-v1:current",
      ["campaign-sales", "campaign-leads"],
    ]);
  });

  it("preserves exact multi-asset delivery while keeping ambiguous ad rows unallocated", async () => {
    const unsafe = databaseMock([
      {
        ...snapshot,
        account_meta_id: "act_100",
        entity_key: "cf_exact_a",
        allocation_method: "exact",
        canonical_result_key: "impressions",
        objective_key: "sales",
        metric_source: "delivery",
        currency: "USD",
        value: 600,
      },
      {
        ...snapshot,
        account_meta_id: "act_100",
        entity_key: "cf_exact_b",
        allocation_method: "exact",
        canonical_result_key: "impressions",
        objective_key: "sales",
        metric_source: "delivery",
        currency: "USD",
        value: 400,
      },
      {
        ...snapshot,
        account_meta_id: "act_100",
        entity_key: "cf_single",
        allocation_method: "single_asset",
        canonical_result_key: "purchase",
        objective_key: "sales",
        metric_source: "action",
        currency: "USD",
        value: 5,
      },
      {
        ...snapshot,
        account_meta_id: "act_200",
        entity_key: null,
        allocation_method: "unallocated",
        canonical_result_key: "lead",
        objective_key: "leads",
        metric_source: "action",
        currency: "USD",
        value: 9,
      },
      {
        ...snapshot,
        account_meta_id: "act_100",
        entity_key: "cf_single",
        allocation_method: "single_asset",
        canonical_result_key: "link_click",
        objective_key: "sales",
        metric_source: "delivery",
        currency: "USD",
        value: 24,
      },
      {
        ...snapshot,
        account_meta_id: "act_200",
        entity_key: null,
        allocation_method: "unallocated",
        canonical_result_key: "impressions",
        objective_key: "leads",
        metric_source: "delivery",
        currency: "USD",
        value: 1_500,
      },
    ]);
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(
      repository.getCanonicalCreativeFamilyResultTotals({
        ...filters,
        attributionWindow: "account_default",
      }),
    ).resolves.toEqual({
      available: true,
      syncVersion: "run-9",
      resultMappingVersion: "result-map-v1:current",
      results: [
        {
          adAccountMetaId: "act_100",
          creativeFamilyId: "cf_exact_a",
          allocationMethod: "exact",
          canonicalResultKey: "impressions",
          objectiveKey: "sales",
          metricSource: "delivery",
          currency: "USD",
          value: 600,
        },
        {
          adAccountMetaId: "act_100",
          creativeFamilyId: "cf_exact_b",
          allocationMethod: "exact",
          canonicalResultKey: "impressions",
          objectiveKey: "sales",
          metricSource: "delivery",
          currency: "USD",
          value: 400,
        },
        {
          adAccountMetaId: "act_100",
          creativeFamilyId: "cf_single",
          allocationMethod: "single_asset",
          canonicalResultKey: "purchase",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "USD",
          value: 5,
        },
        {
          adAccountMetaId: "act_200",
          creativeFamilyId: null,
          allocationMethod: "unallocated",
          canonicalResultKey: "lead",
          objectiveKey: "leads",
          metricSource: "action",
          currency: "USD",
          value: 9,
        },
        {
          adAccountMetaId: "act_100",
          creativeFamilyId: "cf_single",
          allocationMethod: "single_asset",
          canonicalResultKey: "link_click",
          objectiveKey: "sales",
          metricSource: "delivery",
          currency: "USD",
          value: 24,
        },
        {
          adAccountMetaId: "act_200",
          creativeFamilyId: null,
          allocationMethod: "unallocated",
          canonicalResultKey: "impressions",
          objectiveKey: "leads",
          metricSource: "delivery",
          currency: "USD",
          value: 1_500,
        },
      ],
    });

    expect(unsafe).toHaveBeenCalledOnce();
    const [query, parameters] = unsafe.mock.calls[0];
    expect(parameters?.[6]).toBe("account_default");
    expectAccountDefaultAwareAttributionFilter({
      query,
      metricAlias: "metric",
    });
    expectAccountDefaultAwareAttributionFilter({
      query,
      metricAlias: "fact",
    });
    expect(query).toContain("ad_daily_allocation as");
    expect(query).toContain("bool_and(");
    expect(compactSql(query)).toContain(
      "group by metric.ad_id, metric.metric_date, upper(metric.currency)",
    );
    expect(query).toContain("left join ad_daily_allocation");
    expect(query).toContain(
      "count(distinct metric.creative_asset_id) = 1",
    );
    expect(query).toContain("ad_exact_asset_resolution as");
    expect(query).toContain("family_delivery_rows as");
    expect(query).toContain(
      "metric.allocation_method = 'exact'",
    );
    expect(query).toContain(
      "then exact_resolution.creative_family_id",
    );
    expect(query).toContain("then 'exact'");
    expect(
      compactSql(query).match(
        /left join ad_exact_asset_resolution exact_resolution/g,
      ),
    ).toHaveLength(1);
    expect(query).toContain("ad_family_resolution as");
    expect(query).toContain("wrapper_count = resolved_wrapper_count");
    expect(query).toContain(
      "linked_asset_count = total_asset_count",
    );
    expect(query).toContain("physical_asset_count = 1");
    expect(query).toContain(
      "daily_allocation.creative_asset_id =",
    );
    expect(query).toContain("resolution.creative_asset_id");
    expect(query).toContain("else 'unallocated'");
    expect(query).toContain("left join ad_family_resolution");
    expect(query).toContain(
      "metric.impressions::numeric as impressions",
    );
    expect(query).toContain(
      "metric.link_clicks::numeric as link_clicks",
    );
    expect(query).toContain(
      "sum(delivery_row.impressions)::numeric as impressions",
    );
    expect(query).toContain(
      "sum(delivery_row.link_clicks)::numeric as link_clicks",
    );
    expect(query).not.toContain("sum(metric.spend)");
    expect(query).toContain("scope.account_meta_id");
    expect(query).toContain("scope.objective_key");
    expect(query).toContain(
      "metric.sync_version = scope.snapshot_sync_version",
    );
    expect(query).toContain(
      "scope.snapshot_result_mapping_version = $11",
    );
    expect(compactSql(query)).toContain(
      "upper(metric.currency) = $6",
    );
    expect(compactSql(query)).toContain(
      "metric.metric_date between $2::date and $3::date",
    );
    expect(compactSql(query)).toContain(
      "metric.action_report_time = $8",
    );
    expect(compactSql(query)).toContain(
      "campaign.meta_campaign_id = any($12::text[])",
    );
    expect(
      compactSql(query).match(
        /fact\.canonical_result_key not in \( 'reach', 'impressions', 'link_click' \)/g,
      ),
    ).toHaveLength(2);
    expect(query).not.toContain(
      "'reach'::text as canonical_result_key",
    );
  });

  it("returns an explicit stale state instead of mixing snapshot versions", async () => {
    const unsafe = databaseMock([
      {
        snapshot_status: "reporting_snapshot_stale",
        snapshot_sync_version: "run-10",
        snapshot_result_mapping_version:
          "result-map-v1:current",
        account_meta_id: null,
        entity_key: null,
        canonical_result_key: null,
      },
    ]);
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(
      repository.getCanonicalCampaignResultTotals(filters),
    ).resolves.toEqual({
      available: false,
      reason: "reporting_snapshot_stale",
      results: [],
    });
    expect(unsafe).toHaveBeenCalledOnce();
    const [query] = unsafe.mock.calls[0];
    expect(query).toContain("snapshot.sync_version <> $10");
    expect(query).toContain(
      "snapshot.result_mapping_version <> $11",
    );
    expect(query).toContain(
      "snapshot.normalized_results_require_resync",
    );
  });

  it("keeps an exact empty snapshot distinct from stale or unavailable", async () => {
    const unsafe = databaseMock([
      {
        ...snapshot,
        account_meta_id: null,
        entity_key: null,
        allocation_method: null,
        canonical_result_key: null,
      },
    ]);
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(
      repository.getCanonicalCreativeFamilyResultTotals(filters),
    ).resolves.toEqual({
      available: true,
      syncVersion: "run-9",
      resultMappingVersion: "result-map-v1:current",
      results: [],
    });
  });

  it("does not collide identical Meta Campaign ids across accounts", async () => {
    const unsafe = databaseMock([
      {
        ...snapshot,
        account_meta_id: "act_100",
        entity_key: "shared-campaign-id",
        allocation_method: "campaign",
        canonical_result_key: "lead",
        objective_key: "leads",
        metric_source: "action",
        currency: "USD",
        value: 2,
      },
      {
        ...snapshot,
        account_meta_id: "act_200",
        entity_key: "shared-campaign-id",
        allocation_method: "campaign",
        canonical_result_key: "lead",
        objective_key: "leads",
        metric_source: "action",
        currency: "USD",
        value: 3,
      },
    ]);
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    const result =
      await repository.getCanonicalCampaignResultTotals(filters);

    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.results).toEqual([
      expect.objectContaining({
        adAccountMetaId: "act_100",
        campaignMetaId: "shared-campaign-id",
        value: 2,
      }),
      expect.objectContaining({
        adAccountMetaId: "act_200",
        campaignMetaId: "shared-campaign-id",
        value: 3,
      }),
    ]);
    const [query] = unsafe.mock.calls[0];
    expect(query).toContain("account_meta_id,");
    expect(query).toContain("entity_key,");
  });
});
