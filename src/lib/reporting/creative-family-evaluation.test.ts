import { describe, expect, it } from "vitest";

import type {
  CanonicalCreativeFamilyResultTotals,
  CreativePerformanceItem,
} from "@/lib/db";
import type { CreativeRow } from "@/types/view-models";

import { enrichCreativeFamiliesWithCanonicalResults } from "./creative-family-evaluation";
import type { ReportingContext } from "./report-context";
import type { ResultDefinition } from "./result-definition";

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
  syncVersion: "sync_1",
};

const leadDefinition: ResultDefinition = {
  id: "result_lead",
  canonicalKey: "lead",
  label: "Meta-attributed Lead",
  shortLabel: "Lead",
  objectiveKeys: ["leads"],
  rawActionTypes: ["lead"],
  unit: "count",
  efficiencyMetric: "cost_per_result",
  direction: "lower_is_better",
  defaultForObjective: true,
  minimumResults: 5,
  minimumImpressions: 1_000,
  enabled: true,
};

function row(
  id: string,
  familyId: string,
  spend: number,
  impressions: number,
): CreativeRow {
  return {
    id,
    creativeFamilyId: familyId,
    name: familyId,
    assetKey: `image:${familyId}`,
    aliases: [familyId],
    format: "Banner",
    platform: "Android",
    linkLabel: "Đang chạy",
    linkCount: 1,
    currentAdCount: 1,
    activeAdCount: 1,
    readiness: "Sẵn sàng",
    performanceLabel: "Đã có dữ liệu",
    imageUrl: "/creative-placeholder.svg",
    duration: null,
    ratio: "1:1",
    pageName: "Page",
    eventMapping: { install: null, registration: null },
    entityLinks: {
      creativeFamilyId: familyId,
      assetId: `asset_${familyId}`,
      metaCreativeIds: [],
      adIds: [`ad_${familyId}`],
      campaignIds: ["campaign_1"],
      adAccountIds: ["act_1"],
      pageIds: ["page_1"],
    },
    performance: {
      currency: "USD",
      spend,
      impressions,
      dailyReachSum: 0,
      linkCtr: 2,
      installs: 999,
      registrations: 999,
      cpi: spend / 999,
      costPerRegistration: spend / 999,
      hookRate: null,
      holdRate: null,
      osBaselineCpi: null,
      rating: "TỐT",
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      confidence: {
        dataStatus: "ready",
        confidence: "high",
        coverageRatio: 1,
        minimumThresholdMet: true,
        reasonCodes: [],
      },
      ratingExplanation: null,
    },
  };
}

function performance(
  familyId: string,
  spend: number,
  results: number,
): CreativePerformanceItem {
  return {
    creativeAssetId: `asset_${familyId}`,
    creativeFamilyId: familyId,
    assetKey: `image:${familyId}`,
    assetType: "image",
    name: familyId,
    thumbnailUrl: null,
    operatingSystem: "ANDROID",
    currency: "USD",
    spend,
    impressions: 5_000,
    dailyReachSum: 0,
    linkClicks: 100,
    installs: 0,
    registrations: results,
    video3sViews: 0,
    video100Views: 0,
    linkCtr: 2,
    cpi: null,
    costPerRegistration: results > 0 ? spend / results : null,
    hookRate: null,
    holdRate: null,
    metricDays: 30,
  };
}

function available(
  values: Array<{
    familyId: string | null;
    value: number;
    allocationMethod?: "single_asset" | "unallocated";
  }>,
): CanonicalCreativeFamilyResultTotals {
  return {
    available: true,
    syncVersion: "sync_1",
    resultMappingVersion: "mapping_1",
    results: values.map((item) => ({
      adAccountMetaId: "act_1",
      creativeFamilyId: item.familyId,
      allocationMethod:
        item.allocationMethod ??
        (item.familyId ? "single_asset" : "unallocated"),
      canonicalResultKey: "lead",
      objectiveKey: "leads",
      metricSource: "action",
      currency: "USD",
      value: item.value,
    })),
  };
}

describe("enrichCreativeFamiliesWithCanonicalResults", () => {
  it("writes one normalized Family total and evaluates against exact peers", () => {
    const rows = [
      row("target:android", "cf_target", 60, 3_000),
      {
        ...row("target:ios", "cf_target", 40, 2_000),
        platform: "iOS" as const,
      },
    ];
    const peerIds = ["cf_peer_1", "cf_peer_2", "cf_peer_3"];
    const peerPerformance = peerIds.map((id) =>
      performance(id, 200, 10),
    );
    const result = enrichCreativeFamiliesWithCanonicalResults({
      rows,
      actualResults: available([
        { familyId: "cf_target", value: 10 },
        { familyId: null, value: 1_000, allocationMethod: "unallocated" },
      ]),
      benchmarkResults: available(
        peerIds.map((familyId) => ({ familyId, value: 10 })),
      ),
      benchmarkPerformance: [
        {
          adAccountMetaId: "act_1",
          items: peerPerformance,
        },
      ],
      assetFamilyIds: Object.fromEntries(
        peerIds.map((id) => [`asset_${id}`, id]),
      ),
      accountBusinessIds: { act_1: ["bm_1"] },
      context,
      definitions: [leadDefinition],
      benchmarkWindowDays: 30,
      labels: { accountNames: { act_1: "Account 1" } },
    });

    expect(result[0].performance?.resultValues).toEqual({ lead: 10 });
    expect(result[1].performance?.resultValues).toEqual({});
    expect(result[0].performance?.evaluation).toMatchObject({
      resultKey: "lead",
      metricKey: "cost_per_result",
      actualValue: 10,
      benchmarkValue: 20,
      sampleSize: 3,
      performanceStatus: "above_benchmark",
      eligibility: "eligible",
      fatigueStatus: "insufficient",
    });
    expect(result[1].performance?.evaluation).toBeNull();
  });

  it("keeps unavailable live facts explicit and never exposes legacy values", () => {
    const unavailable: CanonicalCreativeFamilyResultTotals = {
      available: false,
      reason: "reporting_snapshot_stale",
      results: [],
    };
    const result = enrichCreativeFamiliesWithCanonicalResults({
      rows: [row("target", "cf_target", 100, 5_000)],
      actualResults: unavailable,
      benchmarkResults: unavailable,
      benchmarkPerformance: [],
      assetFamilyIds: {},
      accountBusinessIds: { act_1: ["bm_1"] },
      context,
      definitions: [leadDefinition],
      benchmarkWindowDays: 30,
    });

    expect(result[0].performance?.resultValues).toEqual({});
    expect(result[0].performance?.evaluation).toBeNull();
    expect(result[0].performance?.installs).toBe(999);
  });
});
