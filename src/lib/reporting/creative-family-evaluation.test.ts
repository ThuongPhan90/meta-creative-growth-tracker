import { describe, expect, it } from "vitest";

import type {
  CanonicalCreativeFamilyResultTotals,
  CreativePerformanceItem,
} from "@/lib/db";
import type { CreativeRow } from "@/types/view-models";

import {
  enrichCreativeFamiliesWithCanonicalResults,
  type CreativeFamilyFatiguePeriod,
} from "./creative-family-evaluation";
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

const V5_PEER_IDS = [
  "cf_peer_1",
  "cf_peer_2",
  "cf_peer_3",
  "cf_peer_4",
  "cf_peer_5",
] as const;

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

const linkClickDefinition: ResultDefinition = {
  ...leadDefinition,
  id: "result_link_click",
  canonicalKey: "link_click",
  label: "Link Click",
  shortLabel: "Click",
  objectiveKeys: ["traffic"],
  rawActionTypes: ["link_click"],
};

const purchaseValueAsActionDefinition: ResultDefinition = {
  ...leadDefinition,
  id: "result_purchase_value",
  canonicalKey: "purchase_value",
  label: "Purchase Value",
  shortLabel: "Value",
  objectiveKeys: ["sales"],
  rawActionTypes: ["purchase"],
  rawValueActionTypes: [],
  unit: "currency",
  efficiencyMetric: "roas",
  direction: "higher_is_better",
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
    allocationMethod?: "exact" | "single_asset" | "unallocated";
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

function fatiguePeriod({
  spend,
  impressions = 5_000,
  linkClicks,
  results,
  days = 3,
}: {
  spend: number;
  impressions?: number;
  linkClicks: number;
  results: number;
  days?: number;
}): CreativeFamilyFatiguePeriod {
  return {
    days,
    results: available([{ familyId: "cf_target", value: results }]),
    performance: [
      {
        adAccountMetaId: "act_1",
        items: [
          {
            ...performance("cf_target", spend, results),
            spend,
            impressions,
            linkClicks,
            linkCtr:
              impressions > 0
                ? (linkClicks / impressions) * 100
                : null,
          },
        ],
      },
    ],
  };
}

function evaluationWithFatigue({
  earlier,
  later,
  windowDays,
}: {
  earlier: CreativeFamilyFatiguePeriod;
  later: CreativeFamilyFatiguePeriod;
  windowDays: number;
}) {
  const peerIds = V5_PEER_IDS;
  const result = enrichCreativeFamiliesWithCanonicalResults({
    rows: [row("target", "cf_target", 100, 5_000)],
    actualResults: available([{ familyId: "cf_target", value: 10 }]),
    benchmarkResults: available(
      peerIds.map((familyId) => ({ familyId, value: 10 })),
    ),
    benchmarkPerformance: [
      {
        adAccountMetaId: "act_1",
        items: peerIds.map((familyId) =>
          performance(familyId, 200, 10),
        ),
      },
    ],
    assetFamilyIds: Object.fromEntries(
      peerIds.map((id) => [`asset_${id}`, id]),
    ),
    accountBusinessIds: { act_1: ["bm_1"] },
    context,
    definitions: [leadDefinition],
    benchmarkWindowDays: 30,
    fatigueComparison: { earlier, later, windowDays },
  });
  return result[0].performance?.evaluation;
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
    const peerIds = V5_PEER_IDS;
    const peerPerformance = peerIds.map((id) =>
      performance(id, 200, 10),
    );
    const result = enrichCreativeFamiliesWithCanonicalResults({
      rows,
      actualResults: available([
        {
          familyId: "cf_target",
          value: 10,
          allocationMethod: "exact",
        },
        { familyId: null, value: 1_000, allocationMethod: "unallocated" },
      ]),
      benchmarkResults: available(
        peerIds.map((familyId) => ({
          familyId,
          value: 10,
          allocationMethod: "exact",
        })),
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
      sampleSize: 5,
      performanceStatus: "above_benchmark",
      eligibility: "eligible",
      fatigueStatus: "insufficient",
    });
    expect(result[1].performance?.evaluation).toBeNull();
  });

  it("never lowers the V5 peer floor below five", () => {
    const peerIds = V5_PEER_IDS.slice(0, 3);
    const result = enrichCreativeFamiliesWithCanonicalResults({
      rows: [row("target", "cf_target", 100, 5_000)],
      actualResults: available([{ familyId: "cf_target", value: 10 }]),
      benchmarkResults: available(
        peerIds.map((familyId) => ({ familyId, value: 10 })),
      ),
      benchmarkPerformance: [
        {
          adAccountMetaId: "act_1",
          items: peerIds.map((familyId) =>
            performance(familyId, 200, 10),
          ),
        },
      ],
      assetFamilyIds: Object.fromEntries(
        peerIds.map((id) => [`asset_${id}`, id]),
      ),
      accountBusinessIds: { act_1: ["bm_1"] },
      context,
      definitions: [leadDefinition],
      benchmarkWindowDays: 30,
      minimumPeerSampleSize: 3,
    });

    expect(result[0].performance?.evaluation).toMatchObject({
      sampleSize: 3,
      benchmarkValue: null,
      performanceStatus: "not_eligible",
    });
  });

  it("uses hydrated action aliases for an owner-remapped currency Result", () => {
    const salesContext: ReportingContext = {
      ...context,
      objectiveKey: "sales",
      primaryResultKey: "purchase_value",
    };
    const actualResults: CanonicalCreativeFamilyResultTotals = {
      available: true,
      syncVersion: "sync_1",
      resultMappingVersion: "mapping_1",
      results: [
        {
          adAccountMetaId: "act_1",
          creativeFamilyId: "cf_target",
          allocationMethod: "single_asset",
          canonicalResultKey: "purchase_value",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "USD",
          value: 3,
        },
        {
          adAccountMetaId: "act_1",
          creativeFamilyId: "cf_target",
          allocationMethod: "single_asset",
          canonicalResultKey: "purchase_value",
          objectiveKey: "sales",
          metricSource: "action_value",
          currency: "USD",
          value: 450,
        },
      ],
    };

    const result = enrichCreativeFamiliesWithCanonicalResults({
      rows: [row("target", "cf_target", 100, 5_000)],
      actualResults,
      benchmarkResults: {
        ...actualResults,
        results: [],
      },
      benchmarkPerformance: [],
      assetFamilyIds: {},
      accountBusinessIds: { act_1: ["bm_1"] },
      context: salesContext,
      definitions: [purchaseValueAsActionDefinition],
      benchmarkWindowDays: 30,
    });

    expect(result[0].performance?.resultValues).toEqual({
      purchase_value: 3,
    });
  });

  it("uses native Link Click delivery and keeps fatigue unavailable without exact Family Reach", () => {
    const trafficContext: ReportingContext = {
      ...context,
      objectiveKey: "traffic",
      primaryResultKey: "link_click",
    };
    const batch = (
      values: Array<{
        familyId: string;
        metricSource: "action" | "delivery";
        value: number;
      }>,
    ): CanonicalCreativeFamilyResultTotals => ({
      available: true,
      syncVersion: "sync_1",
      resultMappingVersion: "mapping_1",
      results: values.map((item) => ({
        adAccountMetaId: "act_1",
        creativeFamilyId: item.familyId,
        allocationMethod: "single_asset",
        canonicalResultKey: "link_click",
        objectiveKey: "traffic",
        metricSource: item.metricSource,
        currency: "USD",
        value: item.value,
      })),
    });
    const peers = V5_PEER_IDS;
    const period = ({
      days,
      spend,
      impressions,
      linkClicks,
      actionResults,
    }: {
      days: number;
      spend: number;
      impressions: number;
      linkClicks: number;
      actionResults: number;
    }): CreativeFamilyFatiguePeriod => ({
      days,
      results: batch([
        {
          familyId: "cf_target",
          metricSource: "action",
          value: actionResults,
        },
        {
          familyId: "cf_target",
          metricSource: "delivery",
          value: linkClicks,
        },
      ]),
      performance: [
        {
          adAccountMetaId: "act_1",
          items: [
            {
              ...performance("cf_target", spend, linkClicks),
              spend,
              impressions,
              linkClicks,
              linkCtr: (linkClicks / impressions) * 100,
            },
          ],
        },
      ],
    });

    const result = enrichCreativeFamiliesWithCanonicalResults({
      rows: [row("target", "cf_target", 100, 5_000)],
      actualResults: batch([
        {
          familyId: "cf_target",
          metricSource: "action",
          value: 999,
        },
        {
          familyId: "cf_target",
          metricSource: "delivery",
          value: 10,
        },
      ]),
      benchmarkResults: batch(
        peers.flatMap((familyId) => [
          { familyId, metricSource: "action" as const, value: 999 },
          { familyId, metricSource: "delivery" as const, value: 10 },
        ]),
      ),
      benchmarkPerformance: [
        {
          adAccountMetaId: "act_1",
          items: peers.map((familyId) =>
            performance(familyId, 200, 10),
          ),
        },
      ],
      assetFamilyIds: Object.fromEntries(
        peers.map((id) => [`asset_${id}`, id]),
      ),
      accountBusinessIds: { act_1: ["bm_1"] },
      context: trafficContext,
      definitions: [linkClickDefinition],
      benchmarkWindowDays: 30,
      fatigueComparison: {
        earlier: period({
          days: 3,
          spend: 300,
          impressions: 15_000,
          linkClicks: 300,
          actionResults: 3_000,
        }),
        later: period({
          days: 4,
          spend: 400,
          impressions: 20_000,
          linkClicks: 240,
          actionResults: 4_000,
        }),
        windowDays: 7,
      },
    });

    expect(result[0].performance?.resultValues).toEqual({
      link_click: 10,
    });
    expect(result[0].performance?.evaluation).toMatchObject({
      resultKey: "link_click",
      actualValue: 10,
      benchmarkValue: 20,
      fatigueStatus: "insufficient",
    });
  });

  it("fails closed instead of inferring fatigue from daily Reach sums", () => {
    const evaluation = evaluationWithFatigue({
      earlier: fatiguePeriod({
        days: 7,
        spend: 200 * 7,
        impressions: 5_000 * 7,
        linkClicks: 100 * 7,
        results: 10 * 7,
      }),
      later: fatiguePeriod({
        days: 7,
        spend: 240 * 7,
        impressions: 5_000 * 7,
        linkClicks: 70 * 7,
        results: 8 * 7,
      }),
      windowDays: 14,
    });

    expect(evaluation?.fatigueStatus).toBe("insufficient");
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
