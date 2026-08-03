import { describe, expect, it } from "vitest";

import {
  buildCreativeWatchlist,
  evaluateCreativeWatchlistItem,
  filterCreativeWatchlist,
  type CreativeWatchlistCandidate,
} from "./creative-watchlist";

const options = { minimumImpressions: 1_000, minimumResults: 5 };

function candidate(
  creativeId: string,
  overrides: Partial<CreativeWatchlistCandidate> = {},
): CreativeWatchlistCandidate {
  return {
    creativeId,
    objectiveKey: "leads",
    resultKey: "lead",
    currency: "VND",
    activeAds: 2,
    spend: 100,
    impressions: 5_000,
    primaryResults: 10,
    costPerResult: 100,
    benchmarkCostPerResult: 100,
    dataStatus: "ready",
    fatigueStatus: "stable",
    ...overrides,
  };
}

describe("evaluateCreativeWatchlistItem", () => {
  it.each([
    [80, "better_than_benchmark"],
    [120, "within_benchmark"],
    [120.01, "needs_review"],
  ] as const)(
    "uses V5 Cost/Result benchmark boundaries for %d",
    (costPerResult, expected) => {
      const item = evaluateCreativeWatchlistItem(
        candidate("creative", { costPerResult }),
        options,
      );

      expect(item.performance).toMatchObject({
        status: expected,
        reasonCode: "evaluated",
      });
    },
  );

  it("keeps data, performance and fatigue as separate states", () => {
    const item = evaluateCreativeWatchlistItem(
      candidate("partial", {
        dataStatus: "partial",
        fatigueStatus: "fatigue_risk",
        costPerResult: 200,
      }),
      options,
    );

    expect(item.dataStatus).toBe("partial");
    expect(item.performance).toMatchObject({
      status: "not_evaluable",
      reasonCode: "data_not_ready",
    });
    expect(item.fatigueStatus).toBe("fatigue_risk");
    expect(item.priorityTier).toBe("action_required");
  });

  it("does not rate performance below the Result definition minimum", () => {
    const item = evaluateCreativeWatchlistItem(
      candidate("below-result-threshold", {
        primaryResults: 4,
        costPerResult: 80,
        benchmarkCostPerResult: 100,
      }),
      options,
    );

    expect(item.performance).toMatchObject({
      status: "not_evaluable",
      benchmarkDeltaPercent: null,
      reasonCode: "minimum_results_not_met",
    });
    expect(item.priorityTier).toBe("insufficient");
  });

  it("marks verified active delivery with zero results as an action", () => {
    const item = evaluateCreativeWatchlistItem(
      candidate("zero-result", {
        activeAds: 1,
        impressions: 1_000,
        primaryResults: 0,
        costPerResult: 1,
      }),
      options,
    );

    expect(item.action).toBe("zero_result_delivery");
    expect(item.priorityTier).toBe("action_required");
    expect(item.performance).toMatchObject({
      status: "not_evaluable",
      reasonCode: "zero_result_delivery",
    });
  });

  it("does not classify unverified, inactive or low-delivery zero results as an action", () => {
    expect(
      evaluateCreativeWatchlistItem(
        candidate("partial", {
          dataStatus: "partial",
          primaryResults: 0,
          costPerResult: null,
        }),
        options,
      ).action,
    ).toBe("none");
    expect(
      evaluateCreativeWatchlistItem(
        candidate("inactive", {
          activeAds: 0,
          primaryResults: 0,
          costPerResult: null,
        }),
        options,
      ).action,
    ).toBe("none");
    expect(
      evaluateCreativeWatchlistItem(
        candidate("small", {
          impressions: 999,
          primaryResults: 0,
          costPerResult: null,
        }),
        options,
      ).action,
    ).toBe("none");
  });
});

describe("buildCreativeWatchlist", () => {
  it("keeps legacy views and provides the V6 priority union without changing group-local ranking", () => {
    const items = buildCreativeWatchlist(
      [
        candidate("action", { primaryResults: 0, costPerResult: null }),
        candidate("monitor", { costPerResult: 100 }),
        candidate("insufficient", { primaryResults: 4, costPerResult: 80 }),
        candidate("good", { costPerResult: 80 }),
        candidate("inactive", { activeAds: 0, costPerResult: 100 }),
      ],
      options,
    )[0]!.items;

    expect(
      filterCreativeWatchlist(items, "action").map((item) => item.creativeId),
    ).toEqual(["action"]);
    expect(
      filterCreativeWatchlist(items, "monitor").map((item) => item.creativeId),
    ).toEqual(["monitor", "inactive"]);
    expect(
      filterCreativeWatchlist(items, "priority").map((item) => item.creativeId),
    ).toEqual(["action", "monitor", "inactive"]);
    expect(
      filterCreativeWatchlist(items, "insufficient").map(
        (item) => item.creativeId,
      ),
    ).toEqual(["insufficient"]);
    expect(
      filterCreativeWatchlist(items, "good").map((item) => item.creativeId),
    ).toEqual(["good"]);
    expect(
      filterCreativeWatchlist(items, "running").every(
        (item) => (item.activeAds ?? 0) > 0,
      ),
    ).toBe(true);
    expect(
      filterCreativeWatchlist(items, "running").map((item) => item.creativeId),
    ).not.toContain("inactive");
    expect(filterCreativeWatchlist(items, "all")).toBe(items);
  });

  it("ranks a group by tier, active Ads, Spend, worst benchmark delta, then fatigue", () => {
    const groups = buildCreativeWatchlist(
      [
        candidate("tier-first", {
          costPerResult: 150,
          activeAds: 1,
        }),
        candidate("active-ads", {
          activeAds: 5,
        }),
        candidate("spend", {
          activeAds: 2,
          spend: 500,
        }),
        candidate("delta-worse", {
          activeAds: 2,
          spend: 100,
          costPerResult: 120,
        }),
        candidate("fatigue-monitor", {
          activeAds: 2,
          spend: 100,
          costPerResult: 110,
          fatigueStatus: "monitor",
        }),
        candidate("fatigue-stable", {
          activeAds: 2,
          spend: 100,
          costPerResult: 110,
          fatigueStatus: "stable",
        }),
      ],
      options,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((item) => item.creativeId)).toEqual([
      "tier-first",
      "active-ads",
      "spend",
      "delta-worse",
      "fatigue-monitor",
      "fatigue-stable",
    ]);
    expect(groups[0].items.map((item) => item.rank)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it("creates independent ranking groups and never compares VND and USD values", () => {
    const groups = buildCreativeWatchlist(
      [
        candidate("vnd", { currency: "VND", spend: 50_000_000 }),
        candidate("usd", { currency: "usd", spend: 1 }),
        candidate("other-result", { resultKey: "purchase", spend: 999 }),
      ],
      options,
    );

    expect(groups).toHaveLength(3);
    expect(
      groups.map((group) => [group.resultKey, group.currency, group.items[0].creativeId]),
    ).toEqual([
      ["lead", "USD", "usd"],
      ["lead", "VND", "vnd"],
      ["purchase", "VND", "other-result"],
    ]);
    expect(groups.every((group) => group.items[0].rank === 1)).toBe(true);
  });
});
