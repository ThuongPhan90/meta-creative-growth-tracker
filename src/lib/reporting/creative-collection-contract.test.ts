import { describe, expect, it } from "vitest";

import type {
  CreativePerformanceSummary,
  CreativeRow,
} from "@/types/view-models";
import type { ReportingContext } from "./report-context";
import {
  buildCreativeCollection,
  buildCreativeCollectionCoverage,
  buildCreativeDistribution,
  creativeResultValuesSource,
} from "./creative-collection-contract";

const context = {
  primaryResultKey: "lead",
} satisfies Pick<ReportingContext, "primaryResultKey">;

const performanceBase = {
  currency: "USD",
  spend: 100,
  impressions: 5_000,
  dailyReachSum: 4_000,
  linkCtr: 2,
  installs: 99,
  registrations: 50,
  cpi: 100 / 99,
  costPerRegistration: 2,
  hookRate: null,
  holdRate: null,
  osBaselineCpi: null,
  rating: null,
  dateFrom: "2026-07-01",
  dateTo: "2026-07-30",
  confidence: {
    dataStatus: "ready",
    confidence: "high",
    coverageRatio: 1,
    minimumThresholdMet: true,
    reasonCodes: [],
  },
} satisfies CreativePerformanceSummary;

function creative({
  id,
  familyId,
  platform = "Android",
  performance = performanceBase,
}: {
  id: string;
  familyId: string;
  platform?: CreativeRow["platform"];
  performance?: CreativePerformanceSummary | null;
}): CreativeRow {
  return {
    id,
    creativeFamilyId: familyId,
    name: familyId,
    assetKey: `asset:${familyId}`,
    aliases: [familyId],
    format: "Video",
    platform,
    linkLabel: "Running",
    linkCount: 2,
    currentAdCount: 2,
    activeAdCount: 1,
    readiness: "Sẵn sàng" as CreativeRow["readiness"],
    performanceLabel: "Available",
    imageUrl: "/creative-placeholder.svg",
    duration: "00:15",
    ratio: "9:16",
    pageName: "Page",
    eventMapping: { install: true, registration: true },
    performance,
    entityLinks: {
      creativeFamilyId: familyId,
      assetId: `asset_${familyId}`,
      metaCreativeIds: [`meta_${id}`],
      adIds: [`ad_${familyId}`],
      campaignIds: [`campaign_${familyId}`],
      adAccountIds: ["act_1"],
      pageIds: ["page_1"],
    },
  };
}

describe("creative collection reporting contract", () => {
  it("keeps canonical resultValues authoritative across OS variants", () => {
    const familyId = "cf_0123456789abcdef01234567";
    const rows = [
      creative({
        id: "android",
        familyId,
        performance: {
          ...performanceBase,
          resultValues: { lead: 4 },
          evaluation: {
            resultKey: "lead",
            metricKey: "cost_per_result",
            actualValue: 25,
            benchmarkValue: 30,
            deltaPercent: -16.67,
            peerGroupLabel: "Account · Leads · Video · USD",
            sampleSize: 5,
            eligibility: "eligible",
            dataConfidence: "high",
            performanceStatus: "above_benchmark",
            fatigueStatus: "stable",
            recommendationKey: "scale_controlled",
            reasons: ["Cost per lead is below benchmark."],
          },
        },
      }),
      creative({
        id: "ios",
        familyId,
        platform: "iOS",
        performance: {
          ...performanceBase,
          spend: 50,
          impressions: 2_500,
          // This variant deliberately has no canonical value. Once another
          // Family row has resultValues, legacy installs cannot leak in.
        },
      }),
    ];

    const collection = buildCreativeCollection(rows, context);
    const performance =
      collection[0]?.performance_by_currency[0];

    expect(collection).toHaveLength(1);
    expect(performance).toMatchObject({
      spend: 150,
      impressions: 7_500,
      result_values: { lead: 4 },
      result_values_source:
        "normalized_meta_attributed_result_facts",
      primary_result_value: 4,
      cost_per_primary_result: 37.5,
      performance_status: "above_benchmark",
      data_confidence: "high",
      fatigue_status: "stable",
    });
    expect(
      collection[0]?.variants[1]?.performance?.result_values,
    ).toEqual({});
    expect(
      collection[0]?.variants[1]?.performance?.result_values,
    ).not.toHaveProperty("install");
    expect(creativeResultValuesSource(collection)).toBe(
      "normalized_meta_attributed_result_facts",
    );
    expect(
      buildCreativeCollectionCoverage(collection, context)
        .resultMapping,
    ).toMatchObject({ covered: 1, total: 1, ratio: 1 });
  });

  it("uses the demo legacy bridge only when resultValues is absent", () => {
    const collection = buildCreativeCollection(
      [
        creative({
          id: "legacy",
          familyId: "cf_111111111111111111111111",
        }),
      ],
      { primaryResultKey: "install" },
    );

    expect(
      collection[0]?.performance_by_currency[0],
    ).toMatchObject({
      result_values: {
        install: 99,
        complete_registration: 50,
      },
      result_values_source: "demo_legacy_bridge",
      primary_result_value: 99,
    });
  });

  it("counts families once and keeps status dimensions independent", () => {
    const reviewedFamily = "cf_222222222222222222222222";
    const unevaluatedFamily = "cf_333333333333333333333333";
    const collection = buildCreativeCollection(
      [
        creative({
          id: "review-android",
          familyId: reviewedFamily,
          performance: {
            ...performanceBase,
            resultValues: { lead: 6 },
            evaluation: {
              resultKey: "lead",
              metricKey: "cost_per_result",
              actualValue: 40,
              benchmarkValue: 30,
              deltaPercent: 33.33,
              peerGroupLabel: "Peer",
              sampleSize: 5,
              eligibility: "eligible",
              dataConfidence: "low",
              performanceStatus: "needs_review",
              fatigueStatus: "fatigue_risk",
              recommendationKey: "refresh_creative",
              reasons: ["Review."],
            },
          },
        }),
        creative({
          id: "review-ios",
          familyId: reviewedFamily,
          platform: "iOS",
          performance: {
            ...performanceBase,
            resultValues: {},
          },
        }),
        creative({
          id: "unevaluated",
          familyId: unevaluatedFamily,
          performance: {
            ...performanceBase,
            resultValues: {},
            confidence: {
              ...performanceBase.confidence,
              confidence: "medium",
            },
            evaluation: null,
          },
        }),
      ],
      context,
    );

    const distribution = buildCreativeDistribution(collection);
    const count = (
      items: readonly { key: string; count: number }[],
      key: string,
    ) => items.find((item) => item.key === key)?.count;

    expect(distribution.total_creative_families).toBe(2);
    expect(
      count(distribution.performance_status, "needs_review"),
    ).toBe(1);
    expect(
      count(distribution.performance_status, "not_eligible"),
    ).toBe(1);
    expect(count(distribution.data_confidence, "low")).toBe(1);
    expect(count(distribution.data_confidence, "medium")).toBe(1);
    expect(
      count(distribution.fatigue_status, "fatigue_risk"),
    ).toBe(1);
    expect(
      count(distribution.fatigue_status, "insufficient"),
    ).toBe(1);
  });
});
