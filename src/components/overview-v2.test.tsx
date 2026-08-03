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
import { formatMoney } from "@/lib/presentation/formatters";
import type {
  CreativeRow,
  DashboardViewModel,
} from "@/types/view-models";

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
    objective: "app_promotion",
    objectives: [
      { key: "app_promotion", label: "Quảng bá ứng dụng" },
    ],
    result: "install",
    results: [
      {
        key: "install",
        label: "Meta-attributed Install",
        objectiveKeys: ["app_promotion"],
      },
    ],
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

describe("Overview reporting scope form", () => {
  it("preserves the exact campaign filter when applying report controls", () => {
    const html = renderOverview({
      query: {
        ...baseOverviewProps.query,
        campaign: " campaign_123 ",
      },
    });

    expect(html).toContain(
      '<input type="hidden" name="campaign" value="campaign_123"/>',
    );
    expect(html).not.toContain('name="ignored"');
  });
});

describe("Overview objective-specific layout", () => {
  it("renders only global delivery, objective sections and an objective CTA for all objectives", () => {
    const allObjectivesContext: ReportingContext = {
      ...appPromotionContext,
      objectiveKey: "all",
      primaryResultKey: undefined,
    };
    const allObjectivesMetrics = buildDynamicResultMetrics({
      context: allObjectivesContext,
      definitions: DEFAULT_RESULT_DEFINITIONS,
      canonicalResults: [
        {
          canonicalKey: "lead",
          objectiveKey: "leads",
          value: 10,
          spend: 200,
          configured: true,
          hasData: true,
        },
        {
          canonicalKey: "purchase",
          objectiveKey: "sales",
          value: 2,
          spend: 100,
          configured: true,
          hasData: true,
        },
      ],
      spend: 300,
      impressions: 20_000,
      reach: 15_000,
      clicks: 500,
      value: null,
    });
    const html = renderOverview({
      resultMetrics: allObjectivesMetrics,
      reportingBar: {
        ...baseOverviewProps.reportingBar,
        objective: "all",
        result: undefined,
        objectives: [
          { key: "leads", label: "Khách hàng tiềm năng" },
          { key: "sales", label: "Doanh số" },
        ],
        results: [
          {
            key: "lead",
            label: "Meta-attributed Lead",
            objectiveKeys: ["leads"],
          },
          {
            key: "purchase",
            label: "Meta-attributed Purchase",
            objectiveKeys: ["sales"],
          },
        ],
      },
    });

    expect(html).toContain('aria-label="KPI hiệu quả"');
    expect(html).toContain('aria-label="Kết quả theo mục tiêu"');
    expect(html).toContain(
      `10 Meta-attributed Lead · Cost/Lead ${formatMoney(20, "VND")}`,
    );
    expect(html).toContain(
      `2 Meta-attributed Purchase · Cost/Purchase ${formatMoney(
        50,
        "VND",
      )}`,
    );
    expect(html).toContain(
      `Spend ${formatMoney(200, "VND")} (66,7%)`,
    );
    expect(html).toContain(
      `Spend ${formatMoney(100, "VND")} (33,3%)`,
    );
    expect(html).toContain(
      "Chọn một mục tiêu để xếp hạng và đánh giá Creative",
    );
    expect(html).toContain("Phân tích Khách hàng tiềm năng");
    expect(html).toContain("objective=leads");
    expect(html).not.toContain("v2-evaluation-gate");
    expect(html).not.toContain("v2-overview-grid");
    expect(html).not.toContain("<h2>Top Creative</h2>");
    expect(html).not.toContain("<h2>Creative cần hành động</h2>");
    expect(html).not.toContain("v2-trend-panel");
    expect(html).not.toContain("v2-overview-scatter");
    expect(html).not.toContain("<h2>Chất lượng dữ liệu</h2>");
  });

  it("distinguishes a selected Result with unavailable canonical data from an unselected Result", () => {
    const unavailableContext: ReportingContext = {
      ...appPromotionContext,
      objectiveKey: "leads",
      primaryResultKey: "lead",
    };
    const unavailableMetrics = buildDynamicResultMetrics({
      context: unavailableContext,
      definitions: DEFAULT_RESULT_DEFINITIONS,
      canonicalResults: [],
      spend: 300,
      impressions: 20_000,
      reach: 15_000,
      clicks: 500,
      value: null,
    });
    const html = renderOverview({
      resultMetrics: unavailableMetrics,
      reportingBar: {
        ...baseOverviewProps.reportingBar,
        objective: "leads",
        result: "lead",
        objectives: [
          { key: "leads", label: "Khách hàng tiềm năng" },
        ],
        results: [
          {
            key: "lead",
            label: "Meta-attributed Lead",
            objectiveKeys: ["leads"],
          },
        ],
      },
    });

    expect(html).toContain(
      "Meta-attributed Lead đã được chọn nhưng dữ liệu chuẩn hóa chưa sẵn sàng",
    );
    expect(html).toContain(
      "Chưa thể xếp hạng theo Meta-attributed Lead",
    );
    expect(html).toContain(
      "chưa thể đề xuất hành động khi normalized result cấp Creative Family chưa sẵn sàng",
    );
    expect(html).not.toContain(
      "Chọn một kết quả để đánh giá Creative",
    );
  });

  it("renders context and canonical report warnings with one actionable health link", () => {
    const html = renderOverview({
      reportWarnings: [
        "Objective không hợp lệ; đã dùng mặc định.",
        "Normalized Result snapshot chưa khả dụng.",
      ],
    });

    expect(html).toContain('role="alert"');
    expect(html).toContain(
      "Objective không hợp lệ; đã dùng mặc định.",
    );
    expect(html).toContain(
      "Normalized Result snapshot chưa khả dụng.",
    );
    const warningLink = html.match(
      /href="([^"]*coverage=event[^"]*)"/,
    )?.[1];
    expect(warningLink).toBeDefined();
    expect(warningLink).toContain("from=2026-07-01");
    expect(warningLink).toContain("account=act_123");
  });
});

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
        metric: "link_clicks",
        sort: "desc",
        view: "table",
        hash: "#creative-results",
      },
      {
        metric: "link_ctr",
        sort: "desc",
        view: "table",
        hash: "#creative-results",
      },
      {
        metric: "cpc_link",
        sort: "asc",
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
    const resultPointTags = pointTags.filter((tag) =>
      tag.includes('data-trend-series="result"'),
    );
    const efficiencyPointTags = pointTags.filter((tag) =>
      tag.includes('data-trend-series="efficiency"'),
    );

    expect(html).toContain('aria-label="Chú giải biểu đồ xu hướng"');
    expect(html).toContain("Meta-attributed · theo ngày");
    expect(html).toContain("Đơn vị: VND");
    expect(html).toContain("Meta-attributed Install (kết quả)");
    expect(html).toContain("Cost/Install (VND)");
    expect(html).toContain('data-trend-axis-tick="max"');
    expect(html).toContain('data-trend-axis-tick="min"');
    expect(html).toContain(
      'aria-labelledby="overview-trend-result-install-title overview-trend-result-install-description"',
    );
    expect(html).toContain(
      'aria-labelledby="overview-trend-efficiency-install-title overview-trend-efficiency-install-description"',
    );
    expect(pointTags).toHaveLength(6);
    expect(resultPointTags).toHaveLength(3);
    expect(efficiencyPointTags).toHaveLength(3);
    expect(
      pointTags.every(
        (tag) =>
          tag.includes('tabindex="0"') &&
          tag.includes('role="img"'),
      ),
    ).toBe(true);
    expect(resultPointTags[0]).toContain(
      'title="2026-07-01 · Meta-attributed Install:',
    );
    expect(efficiencyPointTags[0]).toContain(
      'data-trend-date="2026-07-01"',
    );
    expect(efficiencyPointTags[0]).toContain(
      'title="2026-07-01 · Cost/Install:',
    );
    expect(efficiencyPointTags[0]).toContain(
      'data-tooltip="2026-07-01 · Cost/Install:',
    );
  });

  it("renders the primary Result trend without inventing an efficiency series", () => {
    const awarenessContext: ReportingContext = {
      ...appPromotionContext,
      objectiveKey: "awareness",
      primaryResultKey: "reach",
    };
    const awarenessMetrics = buildDynamicResultMetrics({
      context: awarenessContext,
      definitions: DEFAULT_RESULT_DEFINITIONS,
      canonicalResults: [
        {
          canonicalKey: "reach",
          objectiveKey: "awareness",
          value: 800,
          configured: true,
          hasData: true,
        },
      ],
      spend: 100,
      impressions: 1_000,
      reach: 800,
      clicks: 25,
      value: null,
    });
    const reachTrend = [700, 760, 800].map((reach, index) => ({
      date: `2026-07-0${index + 1}`,
      currency: "VND",
      spend: 100,
      resultValues: { reach },
      efficiencyValues: { reach: null },
    }));
    const html = renderOverview({
      resultMetrics: awarenessMetrics,
      trend: reachTrend,
      reportingBar: {
        ...baseOverviewProps.reportingBar,
        objective: "awareness",
        result: "reach",
        objectives: [{ key: "awareness", label: "Nhận biết" }],
        results: [
          {
            key: "reach",
            label: "Reach",
            objectiveKeys: ["awareness"],
          },
        ],
      },
    });

    expect(html).toContain("Xu hướng Reach");
    expect(html).toContain('data-trend-series="result"');
    expect(html).not.toContain('data-trend-series="efficiency"');
    expect(html).not.toContain("Cost/Reach");
    expect(
      html.match(/class="v2-trend-point"/g) ?? [],
    ).toHaveLength(3);
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

describe("Overview Creative fatigue", () => {
  it("uses only evaluable fatigue statuses and keeps insufficient data separate", () => {
    const seed = canonicalDemoCreatives.find(
      (creative) => creative.performance?.evaluation,
    );
    expect(seed?.performance?.evaluation).toBeTruthy();
    const statuses = [
      "fatigue_risk",
      "monitor",
      "stable",
      "insufficient",
    ] as const;
    const creatives = statuses.map(
      (fatigueStatus, index): CreativeRow => ({
        ...seed!,
        id: `fatigue_${index}`,
        creativeFamilyId: `cf_fatigue_${index}`,
        assetKey: `fatigue_asset_${index}`,
        aliases: [`Fatigue ${index}`],
        performance: {
          ...seed!.performance!,
          evaluation: {
            ...seed!.performance!.evaluation!,
            fatigueStatus,
          },
        },
      }),
    );
    const html = renderOverview({ creatives });

    expect(html).toContain("Dấu hiệu mỏi Creative");
    expect(html).toContain("Có dấu hiệu mỏi");
    expect(html).toContain("Theo dõi thêm");
    expect(html).toContain("Chưa thấy dấu hiệu mỏi");
    expect(html).toContain("1 Creative chưa đủ dữ liệu xu hướng");
    expect(html).toContain("không được gán trạng thái mỏi");
  });
});

describe("Overview scatter accessibility", () => {
  it("renders benchmark geometry, quadrants, confidence borders, and complete bubble semantics", () => {
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
    expect(html).toContain(
      'aria-label="Chú giải viền theo độ tin cậy dữ liệu"',
    );
    expect(html).toContain('data-scatter-reference="median-spend"');
    expect(html).toContain('style="left:49%"');
    expect(html).toContain(
      `Median Spend: ${formatMoney(9_300_000, "VND")}`,
    );
    expect(html).toContain(
      'data-scatter-reference="result-benchmark"',
    );
    expect(html).toContain(
      `Benchmark Cost/Install (trung vị): ${formatMoney(34_000, "VND")}`,
    );
    expect(
      html.match(/data-scatter-quadrant=/g) ?? [],
    ).toHaveLength(4);
    for (const label of [
      "Tiếp tục test",
      "Cần kiểm tra",
      "Có tiềm năng",
      "Ứng viên mở rộng",
    ]) {
      expect(html).toContain(label);
    }
    expect(bubbles.length).toBeGreaterThan(0);
    expect(
      bubbles.every(
        (bubble) =>
          bubble.includes("Trạng thái:") &&
          bubble.includes("Spend:") &&
          bubble.includes("Cost/Install:") &&
          bubble.includes("Meta-attributed Install:") &&
          bubble.includes("Độ tin cậy:") &&
          bubble.includes("So với benchmark:"),
      ),
    ).toBe(true);
    expect(html).toContain("v2-scatter__point--confidence-high");
    expect(html).toContain("v2-scatter__point--confidence-medium");
    expect(html).toContain("v2-scatter__point--confidence-low");
    expect(html).toContain('class="v2-scatter__tooltip ');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("Độ tin cậy: Cao");
    expect(html).toContain("So với benchmark:");
  });

  it("keeps the median Spend reference but ignores benchmark, delta, and confidence from another Result", () => {
    const creativesWithoutBenchmark = canonicalDemoCreatives.map(
      (creative): CreativeRow => ({
        ...creative,
        performance: creative.performance
          ? {
              ...creative.performance,
              evaluation: creative.performance.evaluation
                ? {
                    ...creative.performance.evaluation,
                    resultKey: "purchase",
                    benchmarkValue: 1,
                    deltaPercent: 99,
                    dataConfidence: "high",
                  }
                : null,
            }
          : null,
      }),
    );
    const html = renderOverview({
      creatives: creativesWithoutBenchmark,
    });

    expect(html).toContain('data-scatter-reference="median-spend"');
    expect(html).not.toContain(
      'data-scatter-reference="result-benchmark"',
    );
    expect(html).not.toContain("data-scatter-quadrant=");
    expect(html).toContain("Benchmark chưa khả dụng");
    expect(html).toContain("v2-scatter__point--confidence-unknown");
    const bubbles =
      html.match(
        /<a\b[^>]*class="v2-scatter__point[^"]*"[^>]*>/g,
      ) ?? [];
    expect(bubbles.length).toBeGreaterThan(0);
    expect(
      bubbles.every(
        (bubble) =>
          bubble.includes("Độ tin cậy:") &&
          !bubble.includes("So với benchmark:"),
      ),
    ).toBe(true);
  });

  it("does not apply Cost/Result benchmark lines or Cost quadrants to a ROAS scatter", () => {
    const salesContext: ReportingContext = {
      ...appPromotionContext,
      objectiveKey: "sales",
      primaryResultKey: "purchase_value",
    };
    const roasMetrics = buildDynamicResultMetrics({
      context: salesContext,
      definitions: DEFAULT_RESULT_DEFINITIONS,
      canonicalResults: [
        {
          canonicalKey: "purchase_value",
          objectiveKey: "sales",
          value: 42_000_000,
          configured: true,
          hasData: true,
          spend: 21_000_000,
        },
      ],
      spend: 21_000_000,
      impressions: 120_000,
      reach: 80_000,
      clicks: 2_000,
      value: 42_000_000,
    });
    const roasCreatives = canonicalDemoCreatives.map(
      (creative, index): CreativeRow => ({
        ...creative,
        performance: creative.performance
          ? {
              ...creative.performance,
              resultValues: {
                ...creative.performance.resultValues,
                purchase_value:
                  creative.performance.spend * (1.4 + index * 0.2),
              },
              evaluation: creative.performance.evaluation
                ? {
                    ...creative.performance.evaluation,
                    resultKey: "purchase_value",
                    metricKey: "roas",
                    actualValue: 1.4 + index * 0.2,
                    benchmarkValue: 1.5,
                    deltaPercent: ((1.4 + index * 0.2 - 1.5) / 1.5) * 100,
                  }
                : null,
            }
          : null,
      }),
    );
    const html = renderOverview({
      creatives: roasCreatives,
      resultMetrics: roasMetrics,
      reportingBar: {
        ...baseOverviewProps.reportingBar,
        objective: "sales",
        result: "purchase_value",
        objectives: [{ key: "sales", label: "Doanh số" }],
        results: [
          {
            key: "purchase_value",
            label: "Meta-attributed Purchase Value",
            objectiveKeys: ["sales"],
          },
        ],
      },
    });

    expect(html).toContain("Meta-attributed ROAS");
    expect(html).toContain('data-scatter-reference="median-spend"');
    expect(html).not.toContain(
      'data-scatter-reference="result-benchmark"',
    );
    expect(html).not.toContain("data-scatter-quadrant=");
    expect(html).not.toContain("Cost cao");
    expect(html).not.toContain("Cost tốt");
    expect(html).toContain(
      "Đường benchmark Cost/Result không áp dụng cho chỉ số Y hiện tại",
    );
  });
});
