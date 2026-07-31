import { describe, expect, it } from "vitest";

import { summarizeDelivery } from "./delivery-summary";

describe("summarizeDelivery", () => {
  it("aggregates one currency and derives ratios from totals", () => {
    const summary = summarizeDelivery([
      {
        currency: "vnd",
        spend: 100,
        impressions: 1_000,
        linkClicks: 100,
        installs: 4,
        registrations: 2,
        video3sViews: 500,
        video100Views: 125,
      },
      {
        currency: "VND",
        spend: 50,
        impressions: 500,
        linkClicks: 25,
        installs: 1,
        registrations: 1,
        video3sViews: 250,
        video100Views: 75,
      },
    ]);

    expect(summary.currencyMode).toBe("single");
    expect(summary.singleCurrency).toMatchObject({
      currency: "VND",
      spend: 150,
      impressions: 1_500,
      linkClicks: 125,
      installs: 5,
      registrations: 3,
      cpi: 30,
      costPerRegistration: 50,
    });
    expect(summary.singleCurrency?.linkCtr).toBeCloseTo(8.3333, 3);
    expect(summary.singleCurrency?.hookRate).toBe(50);
  });

  it("keeps monetary totals split across currencies", () => {
    const summary = summarizeDelivery([
      {
        currency: "USD",
        spend: 100,
        impressions: 1_000,
        linkClicks: 100,
        installs: 10,
        registrations: 4,
        video3sViews: 300,
        video100Views: 100,
      },
      {
        currency: "VND",
        spend: 2_500_000,
        impressions: 2_000,
        linkClicks: 200,
        installs: 20,
        registrations: 8,
        video3sViews: 600,
        video100Views: 200,
      },
    ]);

    expect(summary.currencyMode).toBe("split");
    expect(summary.singleCurrency).toBeNull();
    expect(summary.byCurrency.map((row) => row.currency)).toEqual([
      "USD",
      "VND",
    ]);
    expect(summary.installs).toBe(30);
    expect(summary.registrations).toBe(12);
  });

  it("drops invalid currency rows and clamps invalid numbers", () => {
    const summary = summarizeDelivery([
      {
        currency: "UNKNOWN",
        spend: 10,
        impressions: 10,
        linkClicks: 1,
        installs: 1,
        registrations: 1,
        video3sViews: 1,
        video100Views: 1,
      },
      {
        currency: "USD",
        spend: Number.NaN,
        impressions: -1,
        linkClicks: 0,
        installs: 0,
        registrations: 0,
        video3sViews: 0,
        video100Views: 0,
      },
    ]);

    expect(summary.byCurrency).toHaveLength(1);
    expect(summary.singleCurrency).toMatchObject({
      currency: "USD",
      spend: 0,
      impressions: 0,
      cpi: null,
      costPerRegistration: null,
    });
  });
});
