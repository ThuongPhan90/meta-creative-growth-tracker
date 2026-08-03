import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LiveDeliverySummary } from "@/lib/db";

import { DataQualityCompactV3 } from "./data-quality-compact";

function metric(value: number) {
  return {
    value,
    state: "ready" as const,
    coverage: { includedAccounts: 9, selectedAccounts: 9 },
  };
}

function readySummary(): LiveDeliverySummary {
  return {
    inventoryObservedAt: "2026-08-01T03:00:00.000Z",
    reportingSnapshot: {
      syncVersion: "sync_20260801",
      publishedAt: "2026-08-01T03:00:00.000Z",
      state: "available",
    },
    latestRun: { status: "succeeded", finishedAt: "2026-08-01T03:00:00.000Z" },
    state: "ready",
    metricDateMin: "2026-08-01",
    metricDateMax: "2026-08-01",
    selectedAccountCount: 9,
    inventoryReadyAccountCount: 9,
    deliveryEligibleAccountCount: 9,
    deliveryReadyAccountCount: 9,
    accounts: [],
    activeCampaigns: metric(3),
    activeAdSets: metric(4),
    activeAds: metric(4),
    activeAdsComparableForDelivery: metric(4),
    activeDeliveringAds: metric(4),
    activeWithoutDelivery: metric(0),
    mappedActiveCreativeFamilies: metric(2),
    mappingCoverage: {
      activeAdsTotal: 4,
      activeAdsWithCreativeFamily: 2,
      percent: 50,
    },
  };
}

describe("V6 Data Quality compact acceptance", () => {
  it("collapses a ready state to one operational line with explicit delivery and mapping coverage", () => {
    const markup = renderToStaticMarkup(
      <DataQualityCompactV3
        liveDelivery={readySummary()}
        query={{
          from: "2026-07-03",
          to: "2026-08-01",
          account_ids: "act_1,act_2",
          objective: "sales",
          result: "purchase",
          currency: "VND",
          compare: "previous_period",
          attribution: "account_default",
          action_report_time: "mixed",
          sync_version: "sync_20260801",
        }}
      />,
    );

    expect(markup).toContain('aria-label="Chất lượng dữ liệu"');
    expect(markup).toContain("Dữ liệu ổn định");
    expect(markup).toContain("Delivery-ready 9/9 Ad Account");
    expect(markup).toContain("Creative mapping 50%");
    expect(markup).not.toMatch(/Creative mapping 5[.,]000%/);
    expect(markup).toContain("Xem chi tiết");
    expect(markup).toContain(
      'href="/data-health?from=2026-07-03&amp;to=2026-08-01&amp;account_ids=act_1%2Cact_2&amp;objective=sales&amp;result=purchase&amp;currency=VND&amp;compare=previous_period&amp;attribution=account_default&amp;action_report_time=mixed&amp;sync_version=sync_20260801"',
    );
    expect(markup).not.toContain("quality-v3-title");
    expect(markup).not.toContain("Kiểm tra coverage và mapping");
  });
});
