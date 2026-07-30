import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DashboardViewModel } from "@/types/view-models";

import { OverviewV2 } from "./overview-v2";

const dashboard: DashboardViewModel = {
  mode: "connected",
  ownerName: "Owner",
  connectionLabel: "Đang hoạt động",
  connectionDetail: "Kết nối chỉ đọc",
  lastSyncAt: "30/07/2026 08:00",
  hasDelivery: true,
  counts: {
    businesses: 1,
    adAccounts: 2,
    pages: 3,
    creatives: 0,
  },
  events: [],
  checklist: [],
};

describe("Overview KPI drill-down", () => {
  it("targets the matching Creative metric and safe sort direction", () => {
    const html = renderToStaticMarkup(
      createElement(OverviewV2, {
        dashboard,
        creatives: [],
        trend: [],
        connected: true,
        query: {
          from: "2026-07-01",
          account: "act_123",
          currency: "VND",
          ignored: "must-not-propagate",
        },
        dateFrom: "2026-07-01",
        dateTo: "2026-07-30",
        account: "act_123",
        accounts: [{ id: "act_123", name: "Primary" }],
        reportingCurrency: "VND",
        currencyOptions: ["VND"],
        compare: "previous_period",
        freshness: "30 phút trước",
      }),
    );

    const drillDowns = Array.from(
      html.matchAll(/href="([^"]*metric=[^"]*)"/g),
      (match) =>
        new URL(
          match[1].replaceAll("&amp;", "&"),
          "https://tracker.test",
        ),
    );

    expect(
      drillDowns.map((url) => ({
        metric: url.searchParams.get("metric"),
        sort: url.searchParams.get("sort"),
        view: url.searchParams.get("view"),
        hash: url.hash,
      })),
    ).toEqual([
      {
        metric: "spend",
        sort: "desc",
        view: "table",
        hash: "#creative-results",
      },
      {
        metric: "installs",
        sort: "desc",
        view: "table",
        hash: "#creative-results",
      },
      {
        metric: "registrations",
        sort: "desc",
        view: "table",
        hash: "#creative-results",
      },
      {
        metric: "cpi",
        sort: "asc",
        view: "table",
        hash: "#creative-results",
      },
      {
        metric: "cpa",
        sort: "asc",
        view: "table",
        hash: "#creative-results",
      },
      {
        metric: "conversion",
        sort: "desc",
        view: "table",
        hash: "#creative-results",
      },
    ]);
    expect(drillDowns.every((url) => url.searchParams.get("account") === "act_123"))
      .toBe(true);
    expect(
      drillDowns.every(
        (url) => url.searchParams.get("ignored") === null,
      ),
    ).toBe(true);
  });
});
