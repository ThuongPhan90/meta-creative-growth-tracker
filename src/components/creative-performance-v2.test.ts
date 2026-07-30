import { describe, expect, it } from "vitest";

import {
  sortCreativeFamiliesForMetric,
  type CreativeFamilyViewItem,
} from "./creative-performance-v2";

function family(
  id: string,
  metrics: {
    spend: number;
    installs: number;
    registrations: number;
    cpi: number | null;
    cpa: number | null;
  } | null,
): CreativeFamilyViewItem {
  return {
    id,
    name: id,
    assetKey: id,
    aliases: [],
    format: "Video",
    platforms: ["Android"],
    imageUrl: "/creative-analytics-empty.png",
    duration: null,
    ratio: null,
    pageName: null,
    adCount: 1,
    activeAdCount: 1,
    readiness: "Sẵn sàng",
    currencies: metrics ? ["VND"] : [],
    entityLinks: undefined,
    performance: metrics
      ? {
          currency: "VND",
          spend: metrics.spend,
          impressions: 1_000,
          dailyReachSum: 800,
          linkCtr: 1,
          installs: metrics.installs,
          registrations: metrics.registrations,
          cpi: metrics.cpi,
          costPerRegistration: metrics.cpa,
          hookRate: null,
          holdRate: null,
          osBaselineCpi: null,
          rating: null,
          dateFrom: "2026-07-01",
          dateTo: "2026-07-30",
        }
      : null,
  };
}

describe("Creative metric drill-down ordering", () => {
  const highConversion = family("high-conversion", {
    spend: 100,
    installs: 10,
    registrations: 9,
    cpi: 10,
    cpa: 11,
  });
  const highScale = family("high-scale", {
    spend: 200,
    installs: 20,
    registrations: 4,
    cpi: 5,
    cpa: 50,
  });
  const missing = family("missing", null);

  it.each([
    ["spend", "desc", ["high-scale", "high-conversion", "missing"]],
    ["installs", "desc", ["high-scale", "high-conversion", "missing"]],
    ["registrations", "desc", ["high-conversion", "high-scale", "missing"]],
    ["cpi", "asc", ["high-scale", "high-conversion", "missing"]],
    ["cpa", "asc", ["high-conversion", "high-scale", "missing"]],
    ["conversion", "desc", ["high-conversion", "high-scale", "missing"]],
  ] as const)("sorts %s %s and keeps missing data last", (metric, sort, ids) => {
    expect(
      sortCreativeFamiliesForMetric(
        [missing, highConversion, highScale],
        metric,
        sort,
      ).map((item) => item.id),
    ).toEqual(ids);
  });
});
