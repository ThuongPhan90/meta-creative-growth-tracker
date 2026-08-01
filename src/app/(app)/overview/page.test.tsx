import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getApplicationSnapshot: vi.fn(),
  resolveApplicationReportContext: vi.fn(),
  getCreativeRowsForReport: vi.fn(),
  getOverviewTrendForReport: vi.fn(),
  getDeliveryForReport: vi.fn(),
  getLiveDeliveryForReport: vi.fn(),
  getCanonicalResultsForReport: vi.fn(),
  buildApplicationResultMetrics: vi.fn(),
  buildReportingBarModel: vi.fn(),
  formatFreshnessFields: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/app-data", () => ({
  getApplicationSnapshot: mocks.getApplicationSnapshot,
  resolveApplicationReportContext:
    mocks.resolveApplicationReportContext,
  getCreativeRowsForReport: mocks.getCreativeRowsForReport,
  getOverviewTrendForReport: mocks.getOverviewTrendForReport,
  getDeliveryForReport: mocks.getDeliveryForReport,
  getLiveDeliveryForReport: mocks.getLiveDeliveryForReport,
  getCanonicalResultsForReport:
    mocks.getCanonicalResultsForReport,
  buildApplicationResultMetrics:
    mocks.buildApplicationResultMetrics,
}));

vi.mock("@/components/creative-performance-v2", () => ({
  CreativeDrawerContent: vi.fn(() => null),
  groupCreativeFamiliesForView: vi.fn(() => []),
}));

vi.mock("@/components/overview-v2", () => ({
  OverviewV2: vi.fn(() => null),
}));

vi.mock("@/components/ui/entity-drawer", () => ({
  EntityDrawer: vi.fn(() => null),
}));

vi.mock("@/lib/presentation/freshness-presentation", () => ({
  formatFreshnessFields: mocks.formatFreshnessFields,
}));

vi.mock("@/lib/presentation/reporting-bar", () => ({
  buildReportingBarModel: mocks.buildReportingBarModel,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import OverviewPage from "./page";

const snapshot = {
  demoMode: false,
  authenticated: true,
  connection: {
    connectionId: "connection_1",
    status: "connected",
  },
  dashboard: {
    connectionDetail: "Connected",
  },
  assets: [],
  freshness: {
    syncVersion: "20",
  },
  reportingScope: null,
  settings: {
    timezone: "Asia/Ho_Chi_Minh",
    lookbackDays: 30,
    compareDefault: "none",
  },
};

const context = {
  businessIds: ["business_1"],
  adAccountIds: ["act_1"],
  dateFrom: "2026-07-02",
  dateTo: "2026-07-31",
  compareMode: "none",
  objectiveKey: "sales",
  primaryResultKey: "purchase",
  currency: "VND",
  currencyMode: "single",
  reportingTimezoneMode: "account_local",
  attributionSettingKey: "account_default",
  actionReportTime: "mixed",
  syncVersion: "20",
  warnings: [],
  debug: {
    fallbackApplied: false,
    fallbackFields: [],
    normalizedFields: [],
    legacyQueryKeys: [],
  },
  defaultFrom: "2026-07-02",
  defaultTo: "2026-07-31",
  account: "act_1",
  compare: "none",
};

type OverviewPageElement = ReactElement<{
  reportWarnings: readonly string[];
  query: Record<string, string | string[] | undefined>;
}>;

const canonicalQuery = {
  from: "2026-07-02",
  to: "2026-07-31",
  business_ids: "business_1",
  account_ids: "act_1",
  objective: "sales",
  result: "purchase",
  currency: "VND",
  compare: "none",
  attribution: "account_default",
  action_report_time: "mixed",
  sync_version: "20",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redirect.mockImplementation((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  });
  mocks.getApplicationSnapshot.mockResolvedValue(snapshot);
  mocks.resolveApplicationReportContext.mockReturnValue(context);
  mocks.getCreativeRowsForReport.mockResolvedValue({
    creatives: [],
    delivery: [],
  });
  mocks.getOverviewTrendForReport.mockResolvedValue([]);
  mocks.getDeliveryForReport.mockResolvedValue([]);
  mocks.getLiveDeliveryForReport.mockResolvedValue({
    state: "unavailable",
    selectedAccountCount: 1,
  });
  mocks.getCanonicalResultsForReport.mockResolvedValue({
    definitions: [],
    values: [],
    objectiveSpendByObjective: {},
    periodReach: null,
    periodReachUnavailableReason: "exact_snapshot_unavailable",
    state: "unavailable",
    warning:
      "Kết quả chuẩn hóa chưa khả dụng cho snapshot hiện tại.",
  });
  mocks.buildApplicationResultMetrics.mockReturnValue({
    kpiCards: [],
    crossObjectiveSections: [],
  });
  mocks.buildReportingBarModel.mockReturnValue({});
  mocks.formatFreshnessFields.mockReturnValue({});
});

describe("Overview page canonical reporting context", () => {
  it("redirects all-objective URLs without a Result while preserving drawer and tab state", async () => {
    mocks.resolveApplicationReportContext.mockReturnValue({
      ...context,
      objectiveKey: "all",
      primaryResultKey: undefined,
      currency: "",
      currencyMode: "split",
      warnings: [
        {
          code: "result_not_available_for_objective",
          field: "primaryResultKey",
          message:
            "primaryResultKey was removed because all Objectives were selected.",
          input: "install",
          fallback: undefined,
        },
      ],
    });

    await expect(
      OverviewPage({
        searchParams: Promise.resolve({
          objective: "all",
          result: "install",
          campaign: "campaign_1",
          selected: "creative_1",
          tab: "trend & fatigue",
        }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:");

    expect(mocks.redirect).toHaveBeenCalledOnce();
    const href = mocks.redirect.mock.calls[0]?.[0] as string;
    const redirected = new URL(href, "https://tracker.test");
    expect(redirected.pathname).toBe("/overview");
    expect(redirected.searchParams.get("objective")).toBe("all");
    expect(redirected.searchParams.has("result")).toBe(false);
    expect(redirected.searchParams.has("currency")).toBe(false);
    expect(redirected.searchParams.get("campaign")).toBe(
      "campaign_1",
    );
    expect(redirected.searchParams.get("selected")).toBe(
      "creative_1",
    );
    expect(redirected.searchParams.get("tab")).toBe(
      "trend & fatigue",
    );
    expect(redirected.searchParams.get("notice")).toBe(
      "result_removed",
    );
    expect(mocks.getCreativeRowsForReport).not.toHaveBeenCalled();
  });

  it("redirects Objective aliases and incompatible Result fallbacks to canonical keys", async () => {
    mocks.resolveApplicationReportContext.mockReturnValue({
      ...context,
      warnings: [
        {
          code: "result_not_available_for_objective",
          field: "primaryResultKey",
          message:
            "primaryResultKey was not available for the selected Objective and the Objective default was used.",
          input: "install",
          fallback: "purchase",
        },
      ],
    });

    await expect(
      OverviewPage({
        searchParams: Promise.resolve({
          ...canonicalQuery,
          objective: "OUTCOME_SALES",
          result: "install",
          campaign: "campaign_42",
          selected: "creative_2",
          tab: "actions#review",
        }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:");

    const href = mocks.redirect.mock.calls[0]?.[0] as string;
    const redirected = new URL(href, "https://tracker.test");
    expect(redirected.searchParams.get("objective")).toBe("sales");
    expect(redirected.searchParams.get("result")).toBe("purchase");
    expect(redirected.searchParams.get("campaign")).toBe(
      "campaign_42",
    );
    expect(redirected.searchParams.get("selected")).toBe(
      "creative_2",
    );
    expect(redirected.searchParams.get("tab")).toBe(
      "actions#review",
    );
    expect(redirected.searchParams.get("notice")).toBe(
      "result_fallback",
    );
  });

  it("shows a canonical Result fallback notice once without propagating it to links", async () => {
    mocks.getCanonicalResultsForReport.mockResolvedValue({
      definitions: [],
      values: [],
      objectiveSpendByObjective: { sales: 1_000 },
      periodReach: null,
      periodReachUnavailableReason: "exact_snapshot_unavailable",
      state: "live",
      warning: null,
    });
    const queryWithNotice = {
      ...canonicalQuery,
      campaign: "campaign_42",
      selected: "creative_2",
      tab: "actions#review",
      notice: "result_fallback",
    };

    const element = (await OverviewPage({
      searchParams: Promise.resolve(queryWithNotice),
    })) as OverviewPageElement;

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(element.props.query).toEqual({
      ...canonicalQuery,
      campaign: "campaign_42",
      selected: "creative_2",
      tab: "actions#review",
    });
    expect(element.props.query).not.toHaveProperty("notice");
    expect(element.props.query).toMatchObject({
      campaign: "campaign_42",
      selected: "creative_2",
      tab: "actions#review",
    });
    expect(element.props.reportWarnings).toEqual([
      "Result trong URL không phù hợp với Objective đã chọn; hệ thống đã dùng Result mặc định.",
    ]);
    expect(
      element.props.reportWarnings.filter((warning) =>
        warning.includes("Result trong URL"),
      ),
    ).toHaveLength(1);
    expect(mocks.buildApplicationResultMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        objectiveSpendByObjective: { sales: 1_000 },
      }),
    );
  });

  it("renders a canonical URL without redirecting again", async () => {
    const element = (await OverviewPage({
      searchParams: Promise.resolve(canonicalQuery),
    })) as OverviewPageElement;

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(element.props.query).toEqual(canonicalQuery);
    expect(element.props.reportWarnings).toEqual([
      "Kết quả chuẩn hóa chưa khả dụng cho snapshot hiện tại.",
    ]);
  });

  it("applies the campaign scope to current and previous canonical Result totals", async () => {
    const previousPeriodContext = {
      ...context,
      compareMode: "previous_period" as const,
      compare: "previous_period" as const,
    };
    mocks.resolveApplicationReportContext.mockReturnValue(
      previousPeriodContext,
    );

    await OverviewPage({
      searchParams: Promise.resolve({
        ...canonicalQuery,
        compare: "previous_period",
        campaign: "campaign_42",
      }),
    });

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(
      mocks.getCanonicalResultsForReport,
    ).toHaveBeenNthCalledWith(1, {
      snapshot,
      context: previousPeriodContext,
      campaignMetaIds: ["campaign_42"],
    });
    expect(
      mocks.getCanonicalResultsForReport,
    ).toHaveBeenNthCalledWith(2, {
      snapshot,
      context: {
        ...previousPeriodContext,
        dateFrom: "2026-06-02",
        dateTo: "2026-07-01",
      },
      campaignMetaIds: ["campaign_42"],
    });
    expect(mocks.getCreativeRowsForReport).toHaveBeenCalledWith(
      expect.objectContaining({ campaignMetaId: "campaign_42" }),
    );
    expect(mocks.getOverviewTrendForReport).toHaveBeenCalledWith(
      expect.objectContaining({ campaignMetaId: "campaign_42" }),
    );
    expect(mocks.getDeliveryForReport).toHaveBeenCalledWith(
      expect.objectContaining({ campaignMetaId: "campaign_42" }),
    );
  });
});
