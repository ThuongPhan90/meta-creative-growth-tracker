import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LiveDeliverySummary } from "@/lib/db";

import { LiveDeliveryStrip } from "./live-delivery-strip";

function metric(
  value: number | null,
  state: "ready" | "partial" | "unavailable" = "ready",
) {
  return {
    value,
    state,
    coverage: {
      includedAccounts: value === null ? 0 : 1,
      selectedAccounts: 1,
    },
  };
}

function summary(
  overrides: Partial<LiveDeliverySummary> = {},
): LiveDeliverySummary {
  return {
    inventoryObservedAt: "2026-07-30T03:00:00.000Z",
    reportingSnapshot: {
      syncVersion: "latest",
      publishedAt: "2026-07-30T03:00:00.000Z",
      state: "available",
    },
    latestRun: {
      status: "succeeded",
      finishedAt: "2026-07-30T03:00:00.000Z",
    },
    state: "ready",
    metricDateMin: "2026-07-30",
    metricDateMax: "2026-07-30",
    selectedAccountCount: 1,
    inventoryReadyAccountCount: 1,
    deliveryEligibleAccountCount: 1,
    deliveryReadyAccountCount: 1,
    accounts: [],
    activeCampaigns: metric(1),
    activeAdSets: metric(1),
    activeAds: metric(1),
    activeAdsComparableForDelivery: metric(1),
    activeDeliveringAds: metric(1),
    activeWithoutDelivery: metric(0),
    mappedActiveCreativeFamilies: metric(1),
    mappingCoverage: {
      activeAdsTotal: 1,
      activeAdsWithCreativeFamily: 1,
      percent: 1,
    },
    ...overrides,
  };
}

function render(summaryValue: LiveDeliverySummary) {
  return renderToStaticMarkup(
    createElement(LiveDeliveryStrip, {
      summary: summaryValue,
      query: {
        from: "2026-07-03",
        to: "2026-08-01",
        account_ids: "act_1",
      },
    }),
  );
}

describe("LiveDeliveryStrip", () => {
  it("does not present unavailable delivery as a verified zero-active scope", () => {
    const html = render(
      summary({
        state: "unavailable",
        inventoryObservedAt: null,
        reportingSnapshot: {
          syncVersion: null,
          publishedAt: null,
          state: "unavailable",
        },
        selectedAccountCount: 2,
        inventoryReadyAccountCount: 0,
        deliveryEligibleAccountCount: 0,
        deliveryReadyAccountCount: 0,
        activeCampaigns: metric(null, "unavailable"),
        activeAdSets: metric(null, "unavailable"),
        activeAds: metric(null, "unavailable"),
        activeAdsComparableForDelivery: metric(null, "unavailable"),
        activeDeliveringAds: metric(null, "unavailable"),
        activeWithoutDelivery: metric(null, "unavailable"),
        mappedActiveCreativeFamilies: metric(null, "unavailable"),
        mappingCoverage: {
          activeAdsTotal: 0,
          activeAdsWithCreativeFamily: 0,
          percent: null,
        },
      }),
    );

    expect(html).toContain("Coverage delivery chưa khả dụng");
    expect(html).toContain("Chưa thể xác định Ads bật chưa có delivery gần nhất.");
    expect(html).not.toContain("Không có Ads đang bật trong phạm vi đã chọn");
  });

  it("keeps the verified zero-active message for a ready empty scope", () => {
    const html = render(
      summary({
        deliveryEligibleAccountCount: 0,
        deliveryReadyAccountCount: 0,
        activeCampaigns: metric(0),
        activeAdSets: metric(0),
        activeAds: metric(0),
        activeAdsComparableForDelivery: metric(0),
        activeDeliveringAds: metric(0),
        activeWithoutDelivery: metric(0),
        mappedActiveCreativeFamilies: metric(0),
        mappingCoverage: {
          activeAdsTotal: 0,
          activeAdsWithCreativeFamily: 0,
          percent: null,
        },
      }),
    );

    expect(html).toContain("Không có Ads đang bật trong phạm vi đã chọn");
  });

  it("shows the account-local metric date range when account freshness differs", () => {
    const html = render(
      summary({
        state: "partial",
        metricDateMin: "2026-07-30",
        metricDateMax: "2026-07-31",
      }),
    );

    expect(html).toContain(
      "Khoảng delivery: 30/07/2026–31/07/2026",
    );
  });
});
