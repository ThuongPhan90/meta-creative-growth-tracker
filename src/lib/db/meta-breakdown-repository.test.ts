import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "./client";
import { TrackerRepository } from "./repository";
import type { MetaBreakdownFilters } from "./types";

const filters: MetaBreakdownFilters = {
  connectionId: "connection-1",
  dateFrom: "2026-07-01",
  dateTo: "2026-07-31",
  adAccountMetaIds: [" act_2 ", "act_1", "act_2"],
  campaignMetaIds: ["campaign-1"],
  currency: "vnd",
  attributionWindow: "account_default",
  actionReportTime: "mixed",
  syncVersion: "run-8",
  objectiveRawKeys: ["OUTCOME_LEADS", "LEAD_GENERATION"],
  objectiveMappings: [
    {
      objectiveKey: "leads",
      rawObjectiveKeys: ["OUTCOME_LEADS", "LEAD_GENERATION"],
    },
  ],
};

function compactSql(query: string) {
  return query.replace(/\s+/g, " ").trim();
}

type DynamicCreativeFixtureRow = {
  id: string;
  campaignId: string;
  metricScope: "ad" | "asset" | "creative";
  allocationMethod: "exact" | "single_asset" | "unallocated";
  creativeAssetId: string | null;
  spend: number;
  impressions: number;
  linkClicks: number;
};

function deliveryTotals(rows: readonly DynamicCreativeFixtureRow[]) {
  return rows.reduce(
    (totals, row) => ({
      spend: totals.spend + row.spend,
      impressions: totals.impressions + row.impressions,
      linkClicks: totals.linkClicks + row.linkClicks,
    }),
    { spend: 0, impressions: 0, linkClicks: 0 },
  );
}

/**
 * Test-fixture equivalent of the repository CTE policy. It documents the
 * expected choice for one original Meta Insights partition; SQL assertions
 * below lock the same policy into the repository query.
 */
function selectFixturePartition(
  rows: readonly DynamicCreativeFixtureRow[],
) {
  const deliveryRows = rows.filter(
    (row) => row.metricScope === "ad" || row.metricScope === "asset",
  );
  const adRows = deliveryRows.filter((row) => row.metricScope === "ad");
  const assetRows = deliveryRows.filter(
    (row) => row.metricScope === "asset",
  );
  const allAssetsExact = assetRows.every(
    (row) =>
      row.allocationMethod === "exact" && row.creativeAssetId !== null,
  );
  const ad = deliveryTotals(adRows);
  const asset = deliveryTotals(assetRows);
  const assetsReconcile =
    adRows.length > 0 &&
    assetRows.length > 0 &&
    allAssetsExact &&
    Math.abs(asset.spend - ad.spend) <= Math.max(0.01, Math.abs(ad.spend) * 0.001) &&
    Math.abs(asset.impressions - ad.impressions) <=
      Math.max(1, Math.abs(ad.impressions) * 0.001) &&
    Math.abs(asset.linkClicks - ad.linkClicks) <=
      Math.max(0.01, Math.abs(ad.linkClicks) * 0.001);

  if (assetsReconcile) return assetRows;
  if (adRows.length > 0) return adRows;
  return assetRows;
}

describe("Meta breakdown repository", () => {
  it("reads additive delivery at the original Meta entity grain and pins Reporting Context", async () => {
    const unsafe = vi.fn(async () => [
      {
        meta_ad_account_id: "act_1",
        ad_account_name: "Foxscore",
        meta_campaign_id: "campaign-1",
        campaign_name: "Lead form",
        objective_key: "leads",
        publisher_platform: "facebook",
        platform_position: "feed",
        currency: "VND",
        spend: "125000",
        impressions: "5000",
        link_clicks: "42",
      },
    ]);
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(
      repository.getMetaBreakdownMetrics(filters),
    ).resolves.toEqual([
      {
        adAccountMetaId: "act_1",
        adAccountName: "Foxscore",
        campaignMetaId: "campaign-1",
        campaignName: "Lead form",
        objectiveKey: "leads",
        publisherPlatform: "facebook",
        platformPosition: "feed",
        currency: "VND",
        spend: 125000,
        impressions: 5000,
        linkClicks: 42,
      },
    ]);

    const [query, parameters] = unsafe.mock.calls[0] as unknown as [
      string,
      unknown[],
    ];
    const sql = compactSql(query);
    expect(sql).toContain("from tracker.daily_metrics metric");
    expect(sql).toContain("join tracker.meta_ad_accounts account");
    expect(sql).toContain("join tracker.meta_campaigns campaign");
    expect(sql).toContain("left join objective_mapping objective");
    expect(sql).toContain("scoped_metrics as");
    expect(sql).toContain("metric.metric_scope in ('ad', 'asset')");
    expect(sql).toContain("partition_facts as");
    expect(sql).toContain("partition_policy as");
    expect(sql).toContain("selected_metrics as");
    expect(sql).toContain("over source_partition");
    expect(sql).toContain("window source_partition as");
    expect(sql).toContain("partition.has_ad_scope and partition.has_asset_scope");
    expect(sql).toContain("partition.all_asset_rows_exact");
    expect(sql).toContain("then 'reconciled_asset'");
    expect(sql).toContain("when partition.has_ad_scope then 'primary_ad'");
    expect(sql).toContain("metric.selected_scope = 'reconciled_asset'");
    expect(sql).toContain("metric.selected_scope = 'primary_ad'");
    expect(sql).toContain("from partition_policy metric");
    expect(sql).not.toContain("join partition_policy partition");
    expect(sql.match(/from scoped_metrics metric/g)).toHaveLength(1);
    expect(sql).toContain("metric.campaign_id");
    expect(sql).toContain("sum(metric.spend) as spend");
    expect(sql).toContain("metric.publisher_platform");
    expect(sql).toContain("metric.platform_position");
    expect(sql).toContain("account.meta_ad_account_id = any($4::text[])");
    expect(sql).toContain("campaign.meta_campaign_id = any($5::text[])");
    expect(sql).toContain("upper(metric.currency) = $6");
    expect(sql).toContain("$7 = 'account_default' or metric.attribution_window = $7");
    expect(sql).toContain("metric.action_report_time = $8");
    expect(sql).toContain("metric.sync_version = $9");
    expect(sql).toContain(
      "upper(coalesce(campaign.objective, '')) = any($10::text[])",
    );
    expect(parameters).toEqual([
      "connection-1",
      "2026-07-01",
      "2026-07-31",
      ["act_2", "act_1"],
      ["campaign-1"],
      "VND",
      "account_default",
      "mixed",
      "run-8",
      ["OUTCOME_LEADS", "LEAD_GENERATION"],
      [
        { raw_objective_key: "LEADS", objective_key: "leads" },
        { raw_objective_key: "OUTCOME_LEADS", objective_key: "leads" },
        { raw_objective_key: "LEAD_GENERATION", objective_key: "leads" },
      ],
    ]);
  });

  it("contracts Dynamic Creative to one reconciled delivery partition without double-counting", async () => {
    const dynamicCreativeRows: DynamicCreativeFixtureRow[] = [
      {
        id: "primary-ad",
        campaignId: "campaign-a",
        metricScope: "ad",
        allocationMethod: "unallocated",
        creativeAssetId: null,
        spend: 100,
        impressions: 10_000,
        linkClicks: 120,
      },
      {
        id: "legacy-creative",
        campaignId: "campaign-a",
        metricScope: "creative",
        allocationMethod: "unallocated",
        creativeAssetId: null,
        spend: 100,
        impressions: 10_000,
        linkClicks: 120,
      },
      {
        id: "asset-a",
        campaignId: "campaign-a",
        metricScope: "asset",
        allocationMethod: "exact",
        creativeAssetId: "asset-a",
        spend: 40,
        impressions: 4_000,
        linkClicks: 48,
      },
      {
        id: "asset-b",
        campaignId: "campaign-a",
        metricScope: "asset",
        allocationMethod: "exact",
        creativeAssetId: "asset-b",
        spend: 60,
        impressions: 6_000,
        linkClicks: 72,
      },
    ];

    // Ad + asset rows alone would already double the source total; the legacy
    // creative row must not become a third additive copy either.
    expect(
      deliveryTotals(
        dynamicCreativeRows.filter((row) => row.metricScope !== "creative"),
      ),
    ).toEqual({
      spend: 200,
      impressions: 20_000,
      linkClicks: 240,
    });
    expect(deliveryTotals(dynamicCreativeRows)).toEqual({
      spend: 300,
      impressions: 30_000,
      linkClicks: 360,
    });
    expect(deliveryTotals(selectFixturePartition(dynamicCreativeRows))).toEqual({
      spend: 100,
      impressions: 10_000,
      linkClicks: 120,
    });
    expect(selectFixturePartition(dynamicCreativeRows).map((row) => row.id)).toEqual([
      "asset-a",
      "asset-b",
    ]);

    const nonReconciledRows = dynamicCreativeRows.map((row) =>
      row.id === "asset-b" ? { ...row, spend: 45 } : row,
    );
    expect(selectFixturePartition(nonReconciledRows).map((row) => row.id)).toEqual([
      "primary-ad",
    ]);

    const inconsistentCampaignRows = dynamicCreativeRows.map((row) =>
      row.metricScope === "asset"
        ? { ...row, campaignId: "campaign-b" }
        : row,
    );
    expect(
      selectFixturePartition(inconsistentCampaignRows).map((row) => ({
        id: row.id,
        campaignId: row.campaignId,
      })),
    ).toEqual([
      { id: "asset-a", campaignId: "campaign-b" },
      { id: "asset-b", campaignId: "campaign-b" },
    ]);
    expect(deliveryTotals(selectFixturePartition(inconsistentCampaignRows))).toEqual({
      spend: 100,
      impressions: 10_000,
      linkClicks: 120,
    });

    const unsafe = vi.fn(async () => []);
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);
    await repository.getMetaBreakdownMetrics(filters);

    const [query] = unsafe.mock.calls[0] as unknown as [string, unknown[]];
    const sql = compactSql(query);
    expect(sql).toContain("metric.metric_scope in ('ad', 'asset')");
    expect(sql).toContain("metric.allocation_method = 'exact'");
    expect(sql).toContain("metric.creative_asset_id is not null");
    expect(sql).toContain("abs(partition.asset_spend - partition.ad_spend)");
    expect(sql).toContain("abs(partition.asset_impressions - partition.ad_impressions)");
    expect(sql).toContain("abs(partition.asset_link_clicks - partition.ad_link_clicks)");
    expect(sql).toContain("then 'reconciled_asset'");
    expect(sql).toContain("when partition.has_ad_scope then 'primary_ad'");
    expect(sql).toContain(
      "window source_partition as ( partition by metric.ad_account_id, metric.ad_id",
    );
  });

  it("rejects an invalid date range before querying", async () => {
    const unsafe = vi.fn();
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(
      repository.getMetaBreakdownMetrics({
        ...filters,
        dateFrom: "2026-08-01",
        dateTo: "2026-07-31",
      }),
    ).rejects.toThrow("invalid date range");
    expect(unsafe).not.toHaveBeenCalled();
  });
});
