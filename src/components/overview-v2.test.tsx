import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { demoCreatives } from "@/lib/demo-data";
import {
  buildDynamicResultMetrics,
  DEFAULT_RESULT_DEFINITIONS,
  type ReportingContext,
} from "@/lib/reporting";
import { withCanonicalCreativeResultValues } from "@/lib/reporting/legacy-result-bridge";
import type { DashboardViewModel } from "@/types/view-models";

import { OverviewV2 } from "./overview-v2";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

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

const appPromotionContext: ReportingContext = {
  businessIds: [],
  adAccountIds: ["act_123"],
  dateFrom: "2026-07-01",
  dateTo: "2026-07-30",
  compareMode: "previous_period",
  objectiveKey: "app_promotion",
  primaryResultKey: "install",
  currency: "VND",
  currencyMode: "single",
  reportingTimezoneMode: "account_local",
  attributionSettingKey: "account_default",
  actionReportTime: "mixed",
  syncVersion: "sync_test",
};
const resultMetrics = buildDynamicResultMetrics({
  context: appPromotionContext,
  definitions: DEFAULT_RESULT_DEFINITIONS,
  canonicalResults: [
    {
      canonicalKey: "install",
      objectiveKey: "app_promotion",
      value: 42,
      configured: true,
      hasData: true,
      spend: 4_200_000,
    },
  ],
  spend: 4_200_000,
  impressions: 120_000,
  reach: 80_000,
  clicks: 2_000,
  value: null,
});
const canonicalDemoCreatives = withCanonicalCreativeResultValues({
  rows: demoCreatives,
  context: appPromotionContext,
  definitions: DEFAULT_RESULT_DEFINITIONS,
  legacyBridge: true,
});

type OverviewProps = Parameters<typeof OverviewV2>[0];

const baseOverviewProps: OverviewProps = {
  dashboard,
  creatives: [],
  delivery: [],
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
  reportingBar: {
    businesses: [],
    scopeAccounts: [],
    selectedBusinessIds: [],
    selectedAccountIds: [],
    persistScope: false,
    objective: "all",
    objectives: [],
    results: [],
  },
  resultMetrics,
};

function renderOverview(overrides: Partial<OverviewProps> = {}) {
  return renderToStaticMarkup(
    createElement(OverviewV2, {
      ...baseOverviewProps,
      ...overrides,
    }),
  );
}

describe("Overview KPI drill-down", () => {
  it("targets the matching Creative metric and safe sort direction", () => {
    const html = renderOverview();

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
        metric: "impressions",
        sort: "desc",
        view: "table",
        hash: "#creative-results",
      },
      {
        metric: "reach",
        sort: "desc",
        view: "table",
        hash: "#creative-results",
      },
      {
        metric: "frequency",
        sort: "desc",
        view: "table",
        hash: "#creative-results",
      },
      {
        metric: "cpm",
        sort: "asc",
        view: "table",
        hash: "#creative-results",
      },
      {
        metric: "primary_result",
        sort: "desc",
        view: "table",
        hash: "#creative-results",
      },
      {
        metric: "cost_per_result",
        sort: "asc",
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

describe("Overview data warning navigation", () => {
  it("links each warning to its concrete coverage or health section", () => {
    const html = renderOverview({
      dashboard: {
        ...dashboard,
        checklist: [
          {
            label: "Event mapping",
            status: "warning",
            detail: "Thiếu mapping",
          },
          {
            label: "Quyền truy cập",
            status: "error",
            detail: "Token cần kiểm tra",
          },
          {
            label: "Lần đồng bộ cuối",
            status: "pending",
            detail: "Chưa đồng bộ",
          },
          {
            label: "Tín hiệu khác",
            status: "warning",
            detail: "Cần kiểm tra issue",
          },
        ],
      },
    });
    const anchors = html.match(/<a\b[^>]*>/g) ?? [];
    const warningUrl = (label: string) => {
      const anchor = anchors.find((tag) =>
        tag.includes(`aria-label="Xem chi tiết ${label}"`),
      );
      const rawHref = anchor?.match(/href="([^"]+)"/)?.[1];
      return rawHref
        ? new URL(
            rawHref.replaceAll("&amp;", "&"),
            "https://tracker.test",
          )
        : undefined;
    };
    const links = [
      warningUrl("Event mapping"),
      warningUrl("Quyền truy cập"),
      warningUrl("Lần đồng bộ cuối"),
      warningUrl("Tín hiệu khác"),
    ];

    expect(links[0]?.pathname).toBe(
      "/data-health",
    );
    expect(links[0]?.searchParams.get("coverage")).toBe("event");
    expect(links[1]?.hash).toBe(
      "#health-access",
    );
    expect(links[2]?.hash).toBe(
      "#sync-history",
    );
    expect(links[3]?.hash).toBe(
      "#health-issues",
    );
    for (const url of links) {
      expect(url).toBeDefined();
      expect(url?.searchParams.get("from")).toBe("2026-07-01");
      expect(url?.searchParams.get("account")).toBe("act_123");
      expect(url?.searchParams.get("currency")).toBe("VND");
      expect(url?.searchParams.has("ignored")).toBe(false);
    }
  });
});

describe("Overview trend chart accessibility", () => {
  const trend = [
    {
      date: "2026-07-01",
      currency: "VND",
      spend: 1_000_000,
      resultValues: { install: 10 },
      efficiencyValues: { install: 100_000 },
    },
    {
      date: "2026-07-02",
      currency: "VND",
      spend: 1_440_000,
      resultValues: { install: 12 },
      efficiencyValues: { install: 120_000 },
    },
    {
      date: "2026-07-03",
      currency: "VND",
      spend: 990_000,
      resultValues: { install: 11 },
      efficiencyValues: { install: 90_000 },
    },
  ];

  it("renders a labelled y-axis, min/max ticks, clear legend, and focusable point tooltips", () => {
    const html = renderOverview({ trend });
    const pointTags =
      html.match(/<span\b[^>]*class="v2-trend-point"[^>]*>/g) ?? [];

    expect(html).toContain('aria-label="Chú giải biểu đồ xu hướng"');
    expect(html).toContain("Meta-attributed · theo ngày");
    expect(html).toContain("Đơn vị: VND");
    expect(html).toContain("Cost/Install (VND)");
    expect(html).toContain('data-trend-axis-tick="max"');
    expect(html).toContain('data-trend-axis-tick="min"');
    expect(html).toContain(
      'aria-labelledby="overview-trend-title overview-trend-description"',
    );
    expect(pointTags).toHaveLength(3);
    expect(
      pointTags.every(
        (tag) =>
          tag.includes('tabindex="0"') &&
          tag.includes('role="img"') &&
          tag.includes("VND"),
      ),
    ).toBe(true);
    expect(pointTags[0]).toContain('data-trend-date="2026-07-01"');
    expect(pointTags[0]).toContain('title="2026-07-01 · Cost/Install:');
    expect(pointTags[0]).toContain('data-tooltip="2026-07-01 · Cost/Install:');
  });

  it("does not repurpose the legacy daily series for a normalized Result without daily facts", () => {
    const purchaseMetrics = buildDynamicResultMetrics({
      context: {
        businessIds: [],
        adAccountIds: ["act_123"],
        dateFrom: "2026-07-01",
        dateTo: "2026-07-30",
        compareMode: "none",
        objectiveKey: "sales",
        primaryResultKey: "purchase",
        currency: "VND",
        currencyMode: "single",
        reportingTimezoneMode: "account_local",
        attributionSettingKey: "account_default",
        actionReportTime: "mixed",
        syncVersion: "sync_test",
      },
      definitions: DEFAULT_RESULT_DEFINITIONS,
      canonicalResults: [
        {
          canonicalKey: "purchase",
          objectiveKey: "sales",
          value: 8,
          configured: true,
          hasData: true,
          spend: 4_200_000,
        },
      ],
      spend: 4_200_000,
      impressions: 120_000,
      reach: 80_000,
      clicks: 2_000,
      value: null,
    });
    const html = renderOverview({
      trend,
      resultMetrics: purchaseMetrics,
    });

    expect(html).not.toContain('class="v2-trend-chart"');
    expect(html).not.toContain("data-trend-date=");
    expect(html).toContain("normalized result theo ngày");
  });
});

describe("Overview scatter accessibility", () => {
  it("renders a text legend, unit-aware axes, and complete bubble semantics", () => {
    const html = renderOverview({
      creatives: canonicalDemoCreatives,
    });
    const bubbles =
      html.match(
        /<a\b[^>]*class="v2-scatter__point[^"]*"[^>]*>/g,
      ) ?? [];

    expect(html).toContain(
      'aria-label="Chú giải trạng thái hiệu suất"',
    );
    for (const label of [
      "Tốt hơn benchmark",
      "Trong ngưỡng",
      "Cần theo dõi",
      "Chưa thể đánh giá",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Trục X · Spend (VND)");
    expect(html).toContain(
      "Trục Y · Cost/Install (VND) · thấp hơn tốt hơn",
    );
    expect(bubbles.length).toBeGreaterThan(0);
    expect(
      bubbles.every(
        (bubble) =>
          bubble.includes("Trạng thái:") &&
          bubble.includes("Spend:") &&
          bubble.includes("Cost/Install:") &&
          bubble.includes("Meta-attributed Install:"),
      ),
    ).toBe(true);
    expect(html).toContain('class="v2-scatter__tooltip ');
    expect(html).toContain('aria-hidden="true"');
  });
});
