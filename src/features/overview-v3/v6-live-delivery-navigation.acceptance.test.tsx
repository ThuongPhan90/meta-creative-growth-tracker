import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LiveDeliverySummary } from "@/lib/db";

import { LiveDeliveryStripV3 } from "./live-delivery-strip";

const REPORTING_CONTEXT = {
  from: "2026-07-03",
  to: "2026-08-01",
  business_ids: "bm_1,bm_2",
  account_ids: "act_1,act_2",
  objective: "sales",
  result: "purchase",
  currency: "VND",
  compare: "previous_period",
  attribution: "account_default",
  action_report_time: "mixed",
  sync_version: "sync_20260801",
} as const;

function metric(value: number) {
  return {
    value,
    state: "ready" as const,
    coverage: { includedAccounts: 2, selectedAccounts: 2 },
  };
}

function summary(): LiveDeliverySummary {
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
    selectedAccountCount: 2,
    inventoryReadyAccountCount: 2,
    deliveryEligibleAccountCount: 2,
    deliveryReadyAccountCount: 2,
    accounts: [],
    activeCampaigns: metric(3),
    activeAdSets: metric(4),
    activeAds: metric(5),
    activeAdsComparableForDelivery: metric(5),
    activeDeliveringAds: metric(4),
    activeWithoutDelivery: metric(1),
    mappedActiveCreativeFamilies: metric(4),
    mappingCoverage: {
      activeAdsTotal: 5,
      activeAdsWithCreativeFamily: 4,
      percent: 0.8,
    },
  };
}

function renderedLinks() {
  const markup = renderToStaticMarkup(
    <LiveDeliveryStripV3 summary={summary()} query={REPORTING_CONTEXT} />,
  );
  return [...markup.matchAll(/href="([^"]+)"/g)].map((match) =>
    new URL(match[1].replaceAll("&amp;", "&"), "https://tracker.test"),
  );
}

function findLink(
  links: URL[],
  pathname: string,
  local: Record<string, string>,
) {
  const link = links.find(
    (candidate) =>
      candidate.pathname === pathname &&
      Object.entries(local).every(
        ([key, value]) => candidate.searchParams.get(key) === value,
      ),
  );
  if (!link) {
    throw new Error(`Missing ${pathname} link for ${JSON.stringify(local)}`);
  }
  return link;
}

function expectReportingContext(link: URL) {
  for (const [key, value] of Object.entries(REPORTING_CONTEXT)) {
    expect(link.searchParams.get(key), key).toBe(value);
  }
  expect(link.searchParams.get("selected")).toBeNull();
  expect(link.searchParams.get("compare_ids")).toBeNull();
}

describe("V6 Live Delivery navigation acceptance", () => {
  it("makes each operational metric a correctly filtered V3 deep link without dropping report context", () => {
    const links = renderedLinks();
    const targets = [
      findLink(links, "/campaigns", { tab: "ads", status: "active" }),
      findLink(links, "/campaigns", { tab: "ads", delivery: "latest" }),
      findLink(links, "/creatives", { delivery: "active" }),
      findLink(links, "/campaigns", { status: "active" }),
      findLink(links, "/campaigns", { tab: "ads", delivery: "missing" }),
      findLink(links, "/data-health", {
        coverage: "delivery_ready_account",
      }),
    ];

    for (const target of targets) expectReportingContext(target);
  });
});
