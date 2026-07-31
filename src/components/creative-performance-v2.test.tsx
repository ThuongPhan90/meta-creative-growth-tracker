import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { demoCreatives } from "@/lib/demo-data";
import {
  buildDynamicResultMetrics,
  DEFAULT_RESULT_DEFINITIONS,
  type ReportingContext,
} from "@/lib/reporting";
import { withCanonicalCreativeResultValues } from "@/lib/reporting/legacy-result-bridge";
import {
  CreativeDrawerContent,
  CreativePerformanceV2,
  creativeDetailBackHref,
  creativeDetailBackLabel,
  creativeDrawerTabHref,
  creativeFullDetailHref,
  creativeScatterPointStyle,
  groupCreativeFamiliesForView,
} from "./creative-performance-v2";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

const appPromotionContext: ReportingContext = {
  businessIds: [],
  adAccountIds: [],
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
const canonicalDemoCreatives = withCanonicalCreativeResultValues({
  rows: demoCreatives,
  context: appPromotionContext,
  definitions: DEFAULT_RESULT_DEFINITIONS,
  legacyBridge: true,
});
const family =
  groupCreativeFamiliesForView(canonicalDemoCreatives)[0];
const resultMetrics = buildDynamicResultMetrics({
  context: appPromotionContext,
  definitions: DEFAULT_RESULT_DEFINITIONS,
  canonicalResults: [
    {
      canonicalKey: "install",
      objectiveKey: "app_promotion",
      value: demoCreatives[0].performance?.installs ?? 0,
      configured: true,
      hasData: true,
      spend: demoCreatives[0].performance?.spend ?? 0,
    },
  ],
  spend: demoCreatives[0].performance?.spend ?? 0,
  impressions: demoCreatives[0].performance?.impressions ?? 0,
  reach: null,
  clicks: 0,
  value: null,
});

function anchorByLabel(markup: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag = markup.match(
    new RegExp(`<a[^>]*aria-label="${escapedLabel}"[^>]*>`),
  )?.[0];
  expect(tag).toBeDefined();
  const encodedHref = tag?.match(/href="([^"]+)"/)?.[1];
  expect(encodedHref).toBeDefined();
  return new URL(
    encodedHref!.replaceAll("&amp;", "&"),
    "https://tracker.test",
  );
}

describe("Creative V2 navigation and audit interactions", () => {
  it("does not rank a family by the numerically largest currency", () => {
    const base = canonicalDemoCreatives[0];
    const grouped = groupCreativeFamiliesForView([
      base,
      {
        ...base,
        id: `${base.id}:usd`,
        performance: base.performance
          ? {
              ...base.performance,
              currency: "USD",
              spend: 100,
              cpi: 10,
            }
          : null,
      },
    ]);

    expect(grouped[0].currencies.sort()).toEqual(["USD", "VND"]);
    expect(grouped[0].performance).toBeNull();
  });

  it.each(["/overview", "/library"] as const)(
    "keeps drawer tabs on the %s origin with its query",
    (originPathname) => {
      const target = new URL(
        creativeDrawerTabHref({
          familyId: family.id,
          query: {
            from: "2026-07-01",
            to: "2026-07-30",
            currency: "VND",
            view: "grid",
            selected: family.id,
            tab: "preview",
          },
          tab: "rating",
          originPathname,
        }),
        "https://tracker.test",
      );

      expect(target.pathname).toBe(originPathname);
      expect(target.searchParams.get("selected")).toBe(family.id);
      expect(target.searchParams.get("tab")).toBe("rating");
      expect(target.searchParams.get("view")).toBe("grid");
      expect(target.searchParams.get("from")).toBe("2026-07-01");
      expect(target.searchParams.get("currency")).toBe("VND");
    },
  );

  it("keeps a whitelisted origin through full detail tabs and Back", () => {
    const initialDetail = new URL(
      creativeFullDetailHref({
        familyId: family.id,
        query: {
          from: "2026-07-01",
          currency: "VND",
          view: "grid",
          selected: family.id,
        },
        tab: "preview",
        originPathname: "/library",
      }),
      "https://tracker.test",
    );
    expect(initialDetail.pathname).toBe(`/creatives/${family.id}`);
    expect(initialDetail.searchParams.get("origin")).toBe("library");
    expect(initialDetail.searchParams.get("tab")).toBe("preview");
    expect(initialDetail.searchParams.get("selected")).toBeNull();
    expect(initialDetail.searchParams.get("view")).toBe("grid");

    const detailTab = new URL(
      creativeDrawerTabHref({
        familyId: family.id,
        query: {
          from: "2026-07-01",
          currency: "VND",
          origin: "library",
          tab: "preview",
        },
        tab: "rating",
        fullPage: true,
      }),
      "https://tracker.test",
    );
    expect(detailTab.pathname).toBe(`/creatives/${family.id}`);
    expect(detailTab.searchParams.get("origin")).toBe("library");
    expect(detailTab.searchParams.get("tab")).toBe("rating");

    const back = new URL(
      creativeDetailBackHref({
        from: "2026-07-01",
        currency: "VND",
        view: "grid",
        q: "motion",
        origin: "library",
        selected: family.id,
        tab: "rating",
      }),
      "https://tracker.test",
    );
    expect(back.pathname).toBe("/library");
    expect(back.searchParams.get("from")).toBe("2026-07-01");
    expect(back.searchParams.get("currency")).toBe("VND");
    expect(back.searchParams.get("view")).toBe("grid");
    expect(back.searchParams.get("q")).toBe("motion");
    expect(back.searchParams.has("origin")).toBe(false);
    expect(back.searchParams.has("selected")).toBe(false);
    expect(back.searchParams.has("tab")).toBe(false);
    expect(creativeDetailBackLabel({ origin: "library" })).toBe(
      "Quay lại Thư viện Creative",
    );
    expect(
      creativeDetailBackHref({
        origin: "https://malicious.example",
        from: "2026-07-01",
      }),
    ).toBe("/creatives?from=2026-07-01");
  });

  it("renders canonical Ads and a clear Campaign structure CTA in usage", () => {
    const markup = renderToStaticMarkup(
      <CreativeDrawerContent
        family={family}
        query={{
          from: "2026-07-01",
          to: "2026-07-30",
          currency: "VND",
          selected: family.id,
          tab: "usage",
        }}
        originPathname="/library"
      />,
    );

    expect(markup).toContain("Ads");
    expect(markup).toContain("800000000000001");
    expect(markup).toContain("Sao chép Ad ID");
    expect(markup).toContain("Ad Set → Ads");
    expect(markup).toContain("Mở cấu trúc Campaign 700000000000001");
    expect(markup).toContain(
      "/campaigns/700000000000001?from=2026-07-01&amp;to=2026-07-30&amp;currency=VND&amp;tab=structure",
    );
    expect(markup).toContain(
      `/library?from=2026-07-01&amp;to=2026-07-30&amp;currency=VND&amp;selected=${family.id}&amp;tab=rating`,
    );
    expect(markup).toContain(
      `/creatives/${family.id}?from=2026-07-01&amp;to=2026-07-30&amp;currency=VND&amp;tab=usage&amp;origin=library`,
    );
  });

  it("renders a transparent evaluation for a non-Install Result", () => {
    const leadDefinition = {
      ...DEFAULT_RESULT_DEFINITIONS.find(
        (definition) => definition.canonicalKey === "lead",
      )!,
      minimumResults: 5,
      minimumImpressions: 1_000,
    };
    const leadMetrics = buildDynamicResultMetrics({
      context: {
        businessIds: ["bm_1"],
        adAccountIds: ["act_1"],
        dateFrom: "2026-07-01",
        dateTo: "2026-07-30",
        compareMode: "none",
        objectiveKey: "leads",
        primaryResultKey: "lead",
        currency: "VND",
        currencyMode: "single",
        reportingTimezoneMode: "account_local",
        attributionSettingKey: "7d_click_1d_view",
        actionReportTime: "mixed",
        syncVersion: "sync_test",
      },
      definitions: [leadDefinition],
      canonicalResults: [
        {
          canonicalKey: "lead",
          objectiveKey: "leads",
          value: 10,
          configured: true,
          hasData: true,
          spend: 1_000,
        },
      ],
      spend: 1_000,
      impressions: 5_000,
      reach: null,
      clicks: 100,
      value: null,
    });
    const evaluatedFamily = {
      ...family,
      performance: family.performance
        ? {
            ...family.performance,
            spend: 1_000,
            impressions: 5_000,
            resultValues: { lead: 10 },
            evaluation: {
              resultKey: "lead",
              metricKey: "cost_per_result",
              actualValue: 100,
              benchmarkValue: 125,
              deltaPercent: -20,
              peerGroupLabel:
                "Account 1 · leads · Lead · image · VND",
              sampleSize: 8,
              eligibility: "eligible" as const,
              dataConfidence: "high" as const,
              performanceStatus: "above_benchmark" as const,
              fatigueStatus: "insufficient" as const,
              recommendationKey: "scale_controlled" as const,
              reasons: [
                "Cost/Lead thấp hơn benchmark 20%.",
                "Chưa đủ dữ liệu xu hướng để đánh giá độ mỏi.",
              ],
            },
          }
        : null,
    };

    const markup = renderToStaticMarkup(
      <CreativeDrawerContent
        family={evaluatedFamily}
        query={{ result: "lead", tab: "rating" }}
        resultMetrics={leadMetrics}
      />,
    );

    expect(markup).toContain("Đánh giá theo Meta-attributed Lead");
    expect(markup).toContain("Tốt hơn benchmark");
    expect(markup).toContain(
      '<details class="v2-benchmark-disclosure" id="benchmark-explanation"',
    );
    expect(markup).toContain(
      'aria-label="Giải thích benchmark cho Meta-attributed Lead"',
    );
    expect(markup).toContain("Giá trị hiện tại");
    expect(markup).toContain("Chênh lệch");
    expect(markup).toContain("Peer group");
    expect(markup).toContain("Cỡ mẫu");
    expect(markup).toContain("Account 1 · leads · Lead · image · VND");
    expect(markup).toContain("8 Creative Family");
    expect(markup).toContain("Chưa đủ dữ liệu");
    expect(markup).toContain("Có thể tiếp tục mở rộng có kiểm soát");
  });

  it("renders App Promotion labels and evaluation from the canonical demo bridge", () => {
    const markup = renderToStaticMarkup(
      <CreativeDrawerContent
        family={family}
        query={{ result: "install", tab: "rating" }}
        resultMetrics={resultMetrics}
      />,
    );

    expect(family.performance?.resultValues?.install).toBe(
      demoCreatives[0].performance?.installs,
    );
    expect(family.performance?.evaluation?.resultKey).toBe("install");
    expect(markup).toContain("Đánh giá theo Meta-attributed Install");
    expect(markup).toContain("Cost/Install");
    expect(markup).not.toContain("Đánh giá tổng hợp");
  });

  it("renders accessible scatter legend, axes, bubble label, and focus tooltip", () => {
    const markup = renderToStaticMarkup(
      <CreativePerformanceV2
        creatives={[canonicalDemoCreatives[0]]}
        delivery={[
          {
            currency: "VND",
            spend:
              canonicalDemoCreatives[0].performance?.spend ?? 0,
            impressions:
              canonicalDemoCreatives[0].performance
                ?.impressions ?? 0,
            linkClicks: 0,
            installs:
              canonicalDemoCreatives[0].performance
                ?.installs ?? 0,
            registrations:
              canonicalDemoCreatives[0].performance
                ?.registrations ?? 0,
            video3sViews: 0,
            video100Views: 0,
          },
        ]}
        connected
        query={{
          objective: "app_promotion",
          result: "install",
        }}
        dateFrom="2026-07-01"
        dateTo="2026-07-30"
        accounts={[]}
        account=""
        reportingCurrency="VND"
        currencyOptions={["VND"]}
        compare="previous_period"
        freshness="Dữ liệu mới"
        reportingBar={{
          businesses: [],
          scopeAccounts: [],
          selectedBusinessIds: [],
          selectedAccountIds: [],
          persistScope: false,
          objective: "app_promotion",
          objectives: [],
          results: [],
        }}
        resultMetrics={resultMetrics}
      />,
    );
    const bubbles =
      markup.match(
        /<a\b[^>]*class="v2-scatter__point[^"]*"[^>]*>/g,
      ) ?? [];

    expect(markup).toContain(
      'aria-label="Chú giải trạng thái hiệu suất"',
    );
    expect(markup).toContain("Tốt hơn benchmark");
    expect(markup).toContain("Trong ngưỡng");
    expect(markup).toContain("Cần theo dõi");
    expect(markup).toContain("Chưa thể đánh giá");
    expect(markup).toContain("Trục X · Spend (VND)");
    expect(markup).toContain(
      "Trục Y · Cost/Install (VND) · thấp hơn tốt hơn",
    );
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0]).toContain("Trạng thái:");
    expect(bubbles[0]).toContain("Spend:");
    expect(bubbles[0]).toContain("Cost/Install:");
    expect(bubbles[0]).toContain(
      "Meta-attributed Install:",
    );
    expect(markup).toContain('class="v2-scatter__tooltip ');
  });

  it("makes table Ads count and rating open their matching detail tabs", () => {
    const markup = renderToStaticMarkup(
      <CreativePerformanceV2
        creatives={[canonicalDemoCreatives[0]]}
        delivery={[
          {
            currency: "VND",
            spend: demoCreatives[0].performance?.spend ?? 0,
            impressions:
              demoCreatives[0].performance?.impressions ?? 0,
            linkClicks: 0,
            installs:
              demoCreatives[0].performance?.installs ?? 0,
            registrations:
              demoCreatives[0].performance?.registrations ?? 0,
            video3sViews: 0,
            video100Views: 0,
          },
        ]}
        connected
        query={{
          from: "2026-07-01",
          to: "2026-07-30",
          currency: "VND",
          view: "table",
          objective: "app_promotion",
          result: "install",
        }}
        dateFrom="2026-07-01"
        dateTo="2026-07-30"
        accounts={[]}
        account=""
        reportingCurrency="VND"
        currencyOptions={["VND"]}
        compare="previous_period"
        freshness="Dữ liệu mới"
        reportingBar={{
          businesses: [],
          scopeAccounts: [],
          selectedBusinessIds: [],
          selectedAccountIds: [],
          persistScope: false,
          objective: "app_promotion",
          objectives: [],
          results: [],
        }}
        resultMetrics={resultMetrics}
      />,
    );

    const usage = anchorByLabel(
      markup,
      `Xem ${family.adCount} Ads đang dùng ${family.name}`,
    );
    expect(usage.pathname).toBe("/creatives");
    expect(usage.searchParams.get("selected")).toBe(family.id);
    expect(usage.searchParams.get("tab")).toBe("usage");

    const rating = anchorByLabel(
      markup,
      `Mở giải thích benchmark ${family.name}`,
    );
    expect(rating.pathname).toBe("/creatives");
    expect(rating.searchParams.get("selected")).toBe(family.id);
    expect(rating.searchParams.get("tab")).toBe("rating");
    expect(rating.searchParams.get("explain")).toBe("benchmark");
    expect(rating.hash).toBe("#benchmark-explanation");
  });

  it("keeps visual bubble sizing separate from the CSS hitbox", () => {
    expect(creativeScatterPointStyle(32, 48, 19)).toEqual({
      left: "32%",
      top: "48%",
      "--bubble-size": "19px",
    });
    expect(creativeScatterPointStyle(32, 48, 19)).not.toHaveProperty(
      "width",
    );
    expect(creativeScatterPointStyle(32, 48, 19)).not.toHaveProperty(
      "height",
    );
  });
});
