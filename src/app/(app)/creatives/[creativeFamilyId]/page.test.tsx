import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getApplicationContextSnapshot,
  getCanonicalResultsForReport,
  getCreativeFamilyRowsForReport,
  getDeliveryForReport,
  type ApplicationSnapshot,
} from "@/lib/app-data";
import { demoCreatives } from "@/lib/demo-data";
import {
  DEFAULT_RESULT_DEFINITIONS,
  type ReportingContext,
} from "@/lib/reporting";
import CreativeFamilyPage from "./page";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/lib/app-data", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/app-data")>();
  return {
    ...actual,
    getApplicationContextSnapshot: vi.fn(),
    getCreativeFamilyRowsForReport: vi.fn(),
    getCanonicalResultsForReport: vi.fn(),
    getDeliveryForReport: vi.fn(),
    resolveApplicationReportContext: vi.fn(
      (_snapshot, query): ReportingContext => ({
        businessIds: ["bm_demo"],
        adAccountIds: ["act_600000000000001"],
        dateFrom:
          (Array.isArray(query.from) ? query.from[0] : query.from) ??
          "2026-07-01",
        dateTo:
          (Array.isArray(query.to) ? query.to[0] : query.to) ??
          "2026-07-30",
        compareMode: "previous_period",
        objectiveKey: "app_promotion",
        primaryResultKey: "install",
        currency: "VND",
        currencyMode: "single",
        reportingTimezoneMode: "account_local",
        attributionSettingKey: "account_default",
        actionReportTime: "mixed",
        syncVersion: "sync_direct_url",
      }),
    ),
  };
});

vi.mock("server-only", () => ({}));

const familyId = "cf_111111111111111111111111";

function demoSnapshot() {
  return {
    demoMode: true,
    authenticated: false,
    configuredForLive: false,
    connection: null,
    settings: {
      timezone: "Asia/Ho_Chi_Minh",
      lookbackDays: 30,
      currency: "VND",
      compareDefault: "previous_period",
      minimumInstallThreshold: 20,
      installActionTypes: ["mobile_app_install"],
      registrationActionTypes: ["complete_registration"],
    },
  } as ApplicationSnapshot;
}

describe("Creative Family direct URL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApplicationContextSnapshot).mockResolvedValue(
      demoSnapshot(),
    );
    vi.mocked(getCreativeFamilyRowsForReport).mockResolvedValue(
      demoCreatives.filter(
        (creative) => creative.creativeFamilyId === familyId,
      ),
    );
    vi.mocked(getCanonicalResultsForReport).mockResolvedValue({
      definitions: [...DEFAULT_RESULT_DEFINITIONS],
      values: [],
      objectiveSpendByObjective: {},
      periodReach: null,
      periodReachUnavailableReason: "demo",
      state: "demo_legacy_bridge",
      warning: null,
    });
    vi.mocked(getDeliveryForReport).mockResolvedValue([]);
  });

  it("renders a bookmarked detail route and preserves reporting context on back navigation", async () => {
    const element = await CreativeFamilyPage({
      params: Promise.resolve({ creativeFamilyId: familyId }),
      searchParams: Promise.resolve({
        from: "2026-07-01",
        to: "2026-07-30",
        business_ids: "bm_demo",
        account_ids: "act_600000000000001",
        objective: "app_promotion",
        result: "install",
        currency: "VND",
        compare: "previous_period",
        origin: "library",
        tab: "preview",
      }),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("V01-2606-VA");
    expect(markup).toContain(familyId);
    expect(markup).toContain("Quay lại Thư viện Creative");
    expect(mocks.notFound).not.toHaveBeenCalled();

    const match = markup.match(/href="([^"]*\/library[^"]*)"/);
    expect(match?.[1]).toBeDefined();
    const backUrl = new URL(
      match![1].replaceAll("&amp;", "&"),
      "https://tracker.example",
    );
    expect(backUrl.searchParams.get("from")).toBe("2026-07-01");
    expect(backUrl.searchParams.get("to")).toBe("2026-07-30");
    expect(backUrl.searchParams.get("account_ids")).toBe(
      "act_600000000000001",
    );
    expect(backUrl.searchParams.get("objective")).toBe(
      "app_promotion",
    );
    expect(backUrl.searchParams.get("result")).toBe("install");
    expect(backUrl.searchParams.get("origin")).toBeNull();
    expect(backUrl.searchParams.get("tab")).toBeNull();
  });
});
