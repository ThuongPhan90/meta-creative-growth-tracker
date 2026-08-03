import { describe, expect, it } from "vitest";

import type { ResultDefinition } from "@/lib/reporting";
import type {
  CreativeRow,
  DataStatus,
} from "@/types/view-models";

import {
  buildOverviewCreativeWatchlistModel,
  OVERVIEW_WATCHLIST_VIEWS,
} from "./creative-watchlist-model";

const purchaseDefinition: ResultDefinition = {
  id: "result_purchase",
  canonicalKey: "purchase",
  label: "Purchase",
  shortLabel: "Purchase",
  objectiveKeys: ["sales"],
  rawActionTypes: ["purchase"],
  unit: "count",
  efficiencyMetric: "cost_per_result",
  direction: "lower_is_better",
  defaultForObjective: true,
  minimumResults: 5,
  minimumImpressions: 1_000,
  enabled: true,
};

function creative({
  id,
  spend,
  activeAds,
  dataStatus,
  actualCost,
  fatigueStatus = "stable",
}: {
  id: string;
  spend: number;
  activeAds: number;
  dataStatus: DataStatus;
  actualCost: number;
  fatigueStatus?: "stable" | "monitor" | "fatigue_risk" | "insufficient";
}): CreativeRow {
  return {
    id,
    creativeFamilyId: `cf_${id}`,
    name: `Creative ${id}`,
    assetKey: `asset_${id}`,
    aliases: [`Creative ${id}`],
    format: "Video",
    platform: "Android",
    linkLabel: "Ads",
    linkCount: activeAds || 1,
    currentAdCount: activeAds,
    activeAdCount: activeAds,
    readiness: "Sẵn sàng",
    performanceLabel: "Đã có dữ liệu",
    imageUrl: `/creative/${id}.jpg`,
    duration: "00:15",
    ratio: "9:16",
    pageName: "Growth",
    eventMapping: { install: true, registration: true },
    performance: {
      currency: "VND",
      spend,
      impressions: 5_000,
      dailyReachSum: 4_000,
      linkCtr: 2,
      installs: 10,
      registrations: 5,
      cpi: spend / 10,
      costPerRegistration: spend / 5,
      resultValues: { purchase: 10 },
      hookRate: 25,
      holdRate: 8,
      osBaselineCpi: null,
      rating: null,
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      confidence: {
        dataStatus,
        confidence: dataStatus === "ready" ? "high" : "low",
        coverageRatio: dataStatus === "ready" ? 1 : 0.4,
        minimumThresholdMet: dataStatus === "ready",
        reasonCodes: [],
      },
      evaluation: {
        resultKey: "purchase",
        metricKey: "cost_per_result",
        actualValue: actualCost,
        benchmarkValue: 100,
        deltaPercent: actualCost - 100,
        peerGroupLabel: "Sales · VND",
        sampleSize: 20,
        eligibility: "eligible",
        dataConfidence: dataStatus === "ready" ? "high" : "low",
        performanceStatus:
          actualCost > 120
            ? "needs_review"
            : actualCost < 80
              ? "above_benchmark"
              : "within_benchmark",
        fatigueStatus,
        recommendationKey: "hold_monitor",
        reasons: [],
      },
    },
  };
}

describe("buildOverviewCreativeWatchlistModel", () => {
  it("ranks the full scope before returning no more than five rows per tab and twenty unique rows", () => {
    const creatives = [
      ...Array.from({ length: 8 }, (_, index) =>
        creative({
          id: `action_${index}`,
          spend: 1_000 + index,
          activeAds: 1,
          dataStatus: "ready",
          actualCost: 150,
        }),
      ),
      ...Array.from({ length: 8 }, (_, index) =>
        creative({
          id: `monitor_${index}`,
          spend: 800 + index,
          activeAds: 1,
          dataStatus: "ready",
          actualCost: 100,
        }),
      ),
      ...Array.from({ length: 8 }, (_, index) =>
        creative({
          id: `insufficient_${index}`,
          spend: 600 + index,
          activeAds: 0,
          dataStatus: "insufficient",
          actualCost: 100,
          fatigueStatus: "insufficient",
        }),
      ),
      ...Array.from({ length: 8 }, (_, index) =>
        creative({
          id: `good_${index}`,
          spend: 400 + index,
          activeAds: 0,
          dataStatus: "ready",
          actualCost: 70,
        }),
      ),
    ];

    const model = buildOverviewCreativeWatchlistModel({
      creatives,
      objectiveKey: "sales",
      resultKey: "purchase",
      resultDefinitions: [purchaseDefinition],
      currency: "vnd",
    });

    expect(model.canEvaluate).toBe(true);
    expect(model.resultLabel).toBe("Purchase");
    for (const view of OVERVIEW_WATCHLIST_VIEWS) {
      expect(model.itemIdsByView[view].length, view).toBeLessThanOrEqual(5);
    }
    expect(model.items.length).toBeLessThanOrEqual(20);
    expect(new Set(model.items.map((item) => item.creativeId)).size).toBe(
      model.items.length,
    );
    expect(model.itemIdsByView.priority).toEqual([
      "cf_action_7",
      "cf_action_6",
      "cf_action_5",
      "cf_action_4",
      "cf_action_3",
    ]);
    expect(model.itemIdsByView.insufficient).toEqual([
      "cf_insufficient_7",
      "cf_insufficient_6",
      "cf_insufficient_5",
      "cf_insufficient_4",
      "cf_insufficient_3",
    ]);
    const availableIds = new Set(model.items.map((item) => item.creativeId));
    expect(
      Object.values(model.itemIdsByView)
        .flat()
        .every((id) => availableIds.has(id)),
    ).toBe(true);
    expect(model.items[0]).not.toHaveProperty("performanceLabel");
    expect(model.items[0]).not.toHaveProperty("eventMapping");
  });

  it("returns a serializable empty model when the reporting context cannot be evaluated", () => {
    const model = buildOverviewCreativeWatchlistModel({
      creatives: [],
      objectiveKey: "all",
      resultKey: undefined,
      resultDefinitions: [purchaseDefinition],
      currency: "",
    });

    expect(model).toEqual({
      canEvaluate: false,
      resultLabel: "Kết quả",
      items: [],
      itemIdsByView: {
        priority: [],
        running: [],
        insufficient: [],
        all: [],
      },
    });
    expect(() => JSON.stringify(model)).not.toThrow();
  });
});
