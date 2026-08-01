import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  buildApplicationResultMetrics: vi.fn(() => ({
    kpiCards: [],
    dynamicTableColumns: [],
    scatter: {
      enabled: false,
      x: { metric: "spend", label: "Spend", valueType: "currency" },
      y: null,
      bubbleSize: null,
      unavailableReason: "result_unavailable",
    },
    crossObjectiveSections: [],
    availableResults: [],
    metadata: {
      resultAttribution: "meta_attributed",
      costSortMode: "disabled_no_result",
      currencyMode: "split",
      primaryResultKey: null,
    },
  })),
  getCanonicalResultsForReport: vi.fn(async () => ({
    definitions: [],
    values: [],
    state: "live",
    warning: null,
  })),
  getDeliveryForReport: vi.fn(),
  getLiveDeliveryForReport: vi.fn(async () => ({
    state: "unavailable",
    selectedAccountCount: 0,
  })),
  requireOwnerDetailSnapshot: vi.fn(),
  detailErrorResponse: vi.fn(
    () => Response.json({ ok: false }, { status: 500 }),
  ),
}));

vi.mock("@/lib/app-data", () => ({
  buildApplicationResultMetrics: mocks.buildApplicationResultMetrics,
  getCanonicalResultsForReport: mocks.getCanonicalResultsForReport,
  getDeliveryForReport: mocks.getDeliveryForReport,
  getLiveDeliveryForReport: mocks.getLiveDeliveryForReport,
}));
vi.mock("@/lib/detail-api", () => ({
  requireOwnerDetailSnapshot: mocks.requireOwnerDetailSnapshot,
  detailErrorResponse: mocks.detailErrorResponse,
}));

import { GET } from "./route";

const snapshot = {
  settings: {
    timezone: "UTC",
    lookbackDays: 30,
    currency: null,
    compareDefault: "previous_period",
  },
  freshness: {
    dataThroughAt: "2026-07-30T23:59:59.999Z",
    lastSyncedAt: "2026-07-31T01:14:00.000Z",
    syncStatus: "healthy",
  },
  syncRuns: [{ id: "sync_42", status: "success" }],
};

describe("GET /api/reporting/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnerDetailSnapshot.mockResolvedValue({ snapshot });
    mocks.getDeliveryForReport.mockImplementation(
      async ({
        accountMetaIds = [],
      }: {
        accountMetaIds?: string[];
      }) =>
        accountMetaIds.map((accountMetaId) => ({
          operatingSystem: "UNKNOWN",
          currency: accountMetaId === "act_usd" ? "USD" : "VND",
          spend: accountMetaId === "act_usd" ? 100 : 2_500_000,
          impressions: 1_000,
          linkClicks: 100,
          installs: 10,
          registrations: 5,
          video3sViews: 300,
          video100Views: 100,
          metricDays: 30,
        })),
    );
  });

  it("uses canonical delivery for every selected account and splits currency", async () => {
    const request = new NextRequest(
      "https://tracker.example/api/reporting/overview" +
        "?from=2026-07-01&to=2026-07-30" +
        "&account_ids=act_usd,act_vnd",
    );

    const response = await GET(request);
    const body = await response.json();

    expect(mocks.getDeliveryForReport).toHaveBeenCalledOnce();
    expect(mocks.getLiveDeliveryForReport).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          adAccountIds: ["act_usd", "act_vnd"],
        }),
      }),
    );
    expect(mocks.getDeliveryForReport).toHaveBeenCalledWith(
      expect.objectContaining({
        accountMetaIds: ["act_usd", "act_vnd"],
      }),
    );
    expect(body.data.delivery).toMatchObject({
      currencyMode: "split",
      singleCurrency: null,
      installs: 20,
      registrations: 10,
    });
    expect(body.data.delivery.byCurrency).toEqual([
      expect.objectContaining({ currency: "USD", spend: 100 }),
      expect.objectContaining({ currency: "VND", spend: 2_500_000 }),
    ]);
    expect(body.data.liveDelivery).toMatchObject({
      state: "unavailable",
    });
    expect(body.meta.context).toMatchObject({
      adAccountIds: ["act_usd", "act_vnd"],
      syncVersion: "sync_42",
      currencyMode: "split",
    });
  });

  it("preserves Objective and Result after the normalized engine is published", async () => {
    const request = new NextRequest(
      "https://tracker.example/api/reporting/overview" +
        "?objective=sales&result=purchase",
    );

    const response = await GET(request);
    const body = await response.json();

    expect(body.meta.context.objectiveKey).toBe("sales");
    expect(body.meta.context.primaryResultKey).toBe("purchase");
    expect(mocks.getCanonicalResultsForReport).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          objectiveKey: "sales",
          primaryResultKey: "purchase",
        }),
      }),
    );
    expect(mocks.getDeliveryForReport).toHaveBeenCalledWith(
      expect.objectContaining({
        reportContext: expect.objectContaining({
          objectiveKey: "sales",
          primaryResultKey: "purchase",
        }),
      }),
    );
    expect(body.meta.warnings).toEqual([]);
  });
});
