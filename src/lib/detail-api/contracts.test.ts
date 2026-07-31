import { describe, expect, it } from "vitest";

import type {
  CreativeRow,
  Freshness,
  SyncRunView,
} from "@/types/view-models";
import type { ReportingContext } from "@/lib/reporting";
import {
  canonicalDetailId,
  creativeFamilyContract,
  dataHealthIssueContract,
  dataHealthIssueDetails,
} from "./contracts";

const freshness: Freshness = {
  lastSyncedAt: "2026-07-30T08:00:00.000Z",
  dataThroughAt: "2026-07-30T07:55:00.000Z",
  syncStatus: "healthy",
  freshnessSeconds: 300,
  syncMode: "scheduled",
};

describe("detail API contracts", () => {
  it("accepts only canonical route identifiers", () => {
    expect(
      canonicalDetailId(
        "creative-family",
        "cf_0123456789abcdef01234567",
      ),
    ).toBe("cf_0123456789abcdef01234567");
    expect(canonicalDetailId("creative-family", "video name")).toBeNull();
    expect(canonicalDetailId("campaign", "120045678901234")).toBe(
      "120045678901234",
    );
    expect(canonicalDetailId("campaign", "Summer campaign")).toBeNull();
    expect(
      canonicalDetailId(
        "data-health-issue",
        "issue_0123456789abcdef01234567",
      ),
    ).toBe("issue_0123456789abcdef01234567");
  });

  it("groups Creative variants under one Creative Family", () => {
    const familyId = "cf_0123456789abcdef01234567";
    const base = {
      creativeFamilyId: familyId,
      name: "V29-VA",
      assetKey: "video:123",
      aliases: ["V29-VA"],
      format: "Video",
      linkLabel: "Đang chạy",
      linkCount: 2,
      currentAdCount: 2,
      activeAdCount: 1,
      readiness: "Sẵn sàng",
      performanceLabel: "Đã có dữ liệu",
      imageUrl: "/creative-placeholder.svg",
      duration: "00:15",
      ratio: "9:16",
      pageName: "Growth Page",
      eventMapping: { install: true, registration: true },
      entityLinks: {
        creativeFamilyId: familyId,
        assetId: "asset_1",
        metaCreativeIds: ["creative_1"],
        adIds: ["ad_1"],
        campaignIds: ["campaign_1"],
        adAccountIds: ["act_1"],
        pageIds: ["page_1"],
      },
    } satisfies Omit<CreativeRow, "id" | "platform">;
    const rows: CreativeRow[] = [
      { ...base, id: "variant-android", platform: "Android" },
      { ...base, id: "variant-ios", platform: "iOS" },
    ];

    const detail = creativeFamilyContract(familyId, rows, freshness);

    expect(detail).toMatchObject({
      creative_family_id: familyId,
      asset_id: "asset_1",
      entity_links: {
        campaign_ids: ["campaign_1"],
      },
      freshness: {
        sync_status: "healthy",
      },
    });
    expect(detail?.variants).toHaveLength(2);
  });

  it("keeps canonical Result values authoritative across OS and currency variants", () => {
    const familyId = "cf_0123456789abcdef01234567";
    const context: ReportingContext = {
      businessIds: ["bm_1"],
      adAccountIds: ["act_1"],
      dateFrom: "2026-07-01",
      dateTo: "2026-07-30",
      compareMode: "none",
      objectiveKey: "leads",
      primaryResultKey: "lead",
      currency: "USD",
      currencyMode: "single",
      reportingTimezoneMode: "account_local",
      attributionSettingKey: "7d_click_1d_view",
      actionReportTime: "mixed",
      syncVersion: "run-9",
    };
    const base: Omit<CreativeRow, "id" | "platform" | "performance"> = {
      creativeFamilyId: familyId,
      name: "Lead asset",
      assetKey: "image:lead",
      aliases: ["Lead asset"],
      format: "Banner",
      linkLabel: "Đang chạy",
      linkCount: 2,
      currentAdCount: 2,
      activeAdCount: 2,
      readiness: "Sẵn sàng",
      performanceLabel: "Đã có dữ liệu",
      imageUrl: "/creative-placeholder.svg",
      duration: null,
      ratio: "1:1",
      pageName: "Growth Page",
      eventMapping: { install: true, registration: true },
    };
    const performanceBase = {
      spend: 100,
      impressions: 5_000,
      dailyReachSum: 4_000,
      linkCtr: 2,
      installs: 99,
      registrations: 50,
      cpi: 1,
      costPerRegistration: 2,
      hookRate: null,
      holdRate: null,
      osBaselineCpi: null,
      rating: null,
      dateFrom: "2026-07-01",
      dateTo: "2026-07-30",
    } as const;
    const rows: CreativeRow[] = [
      {
        ...base,
        id: "variant-usd-android",
        platform: "Android",
        performance: {
          ...performanceBase,
          currency: "USD",
          resultValues: { lead: 10 },
          evaluation: {
            resultKey: "lead",
            metricKey: "cost_per_result",
            actualValue: 10,
            benchmarkValue: 12,
            deltaPercent: -16.67,
            peerGroupLabel: "Account · Leads · USD",
            sampleSize: 4,
            eligibility: "eligible",
            dataConfidence: "high",
            performanceStatus: "above_benchmark",
            fatigueStatus: "insufficient",
            recommendationKey: "scale_controlled",
            reasons: ["Cost/Lead thấp hơn benchmark."],
          },
        },
      },
      {
        ...base,
        id: "variant-usd-ios",
        platform: "iOS",
        performance: {
          ...performanceBase,
          currency: "USD",
          // Canonical values are intentionally absent on the second OS row.
          // Once any Family row has them, legacy installs must not leak in.
        },
      },
      {
        ...base,
        id: "variant-vnd-android",
        platform: "Android",
        performance: {
          ...performanceBase,
          currency: "VND",
          resultValues: { lead: 20 },
          evaluation: null,
        },
      },
    ];

    const detail = creativeFamilyContract(
      familyId,
      rows,
      freshness,
      context,
    );

    expect(detail?.result_values).toEqual([
      {
        variant_id: "variant-usd-android",
        currency: "USD",
        canonical_result_key: "lead",
        value: 10,
      },
      {
        variant_id: "variant-vnd-android",
        currency: "VND",
        canonical_result_key: "lead",
        value: 20,
      },
    ]);
    expect(detail?.variants[1]?.performance?.result_values).toEqual({});
    expect(detail?.variants[1]?.performance?.result_values).not.toEqual({
      install: 99,
    });
    expect(detail?.variants[0]?.performance?.evaluation).toMatchObject({
      result_key: "lead",
      metric_key: "cost_per_result",
      peer_group_label: "Account · Leads · USD",
      sample_size: 4,
      performance_status: "above_benchmark",
      recommendation_key: "scale_controlled",
    });
    expect(detail?.reporting_context).toEqual({
      business_ids: ["bm_1"],
      ad_account_ids: ["act_1"],
      date_from: "2026-07-01",
      date_to: "2026-07-30",
      compare_mode: "none",
      objective_key: "leads",
      primary_result_key: "lead",
      currency: "USD",
      currency_mode: "single",
      reporting_timezone_mode: "account_local",
      attribution_setting_key: "7d_click_1d_view",
      action_report_time: "mixed",
      sync_version: "run-9",
    });
  });

  it("aggregates repeated sync warnings into a stable issue detail", () => {
    const runs: SyncRunView[] = [
      {
        id: "run-1",
        kind: "Đồng bộ",
        status: "partial",
        startedAt: "30/07/2026",
        finishedAt: "30/07/2026",
        startedAtIso: "2026-07-30T07:00:00.000Z",
        finishedAtIso: "2026-07-30T07:02:00.000Z",
        summary: "1 cảnh báo",
        warnings: [
          {
            code: "META_RESOURCE_FILTER_FALLBACK",
            resource: "act_123/ads",
            message: "Technical warning one",
          },
        ],
      },
      {
        id: "run-2",
        kind: "Đồng bộ",
        status: "partial",
        startedAt: "30/07/2026",
        finishedAt: "30/07/2026",
        startedAtIso: "2026-07-30T08:00:00.000Z",
        finishedAtIso: "2026-07-30T08:02:00.000Z",
        summary: "1 cảnh báo",
        warnings: [
          {
            code: "META_RESOURCE_FILTER_FALLBACK",
            resource: "act_123/ads",
            message: "Technical warning two",
          },
        ],
      },
    ];
    const issueId = dataHealthIssueDetails(runs)[0]?.issue.issueId;
    expect(issueId).toMatch(/^issue_[a-f0-9]{24}$/);

    const detail = dataHealthIssueContract(
      issueId as string,
      runs,
      freshness,
    );

    expect(detail).toMatchObject({
      issue_id: issueId,
      occurrence_count: 2,
      affected_group_count: 1,
      affected_entities: [
        {
          entity_type: "ad_account",
          entity_id: "act_123",
        },
      ],
    });
    expect(detail?.occurrences).toHaveLength(2);
    expect(detail?.user_message).not.toContain("META_RESOURCE");
  });
});
