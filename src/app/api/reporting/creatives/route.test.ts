import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CreativeRow } from "@/types/view-models";

const mocks = vi.hoisted(() => ({
  getCreativeRowsForReport: vi.fn(),
  requireOwnerDetailSnapshot: vi.fn(),
  detailErrorResponse: vi.fn(
    () => Response.json({ ok: false }, { status: 500 }),
  ),
}));

vi.mock("@/lib/app-data", () => ({
  getCreativeRowsForReport: mocks.getCreativeRowsForReport,
}));
vi.mock("@/lib/detail-api", () => ({
  requireOwnerDetailSnapshot: mocks.requireOwnerDetailSnapshot,
  detailErrorResponse: mocks.detailErrorResponse,
}));

import { GET } from "./route";

const snapshot = {
  reportingScope: null,
  settings: {
    timezone: "UTC",
    lookbackDays: 30,
    currency: "USD",
    compareDefault: "previous_period",
  },
  freshness: {
    dataThroughAt: "2026-07-30T23:59:59.999Z",
    lastSyncedAt: "2026-07-31T01:14:00.000Z",
    syncVersion: "run_latest",
    syncStatus: "healthy",
  },
  syncRuns: [{ id: "run_latest", status: "success" }],
};

const creative: CreativeRow = {
  id: "asset_1:ANDROID:USD",
  creativeFamilyId: "cf_0123456789abcdef01234567",
  name: "Lead family",
  assetKey: "video:lead",
  aliases: ["Lead family"],
  format: "Video",
  platform: "Android",
  linkLabel: "Running",
  linkCount: 1,
  currentAdCount: 1,
  activeAdCount: 1,
  readiness: "Sẵn sàng" as CreativeRow["readiness"],
  performanceLabel: "Available",
  imageUrl: "/creative-placeholder.svg",
  duration: "00:15",
  ratio: "9:16",
  pageName: "Page",
  eventMapping: { install: true, registration: true },
  entityLinks: {
    creativeFamilyId: "cf_0123456789abcdef01234567",
    assetId: "asset_1",
    metaCreativeIds: ["meta_1"],
    adIds: ["ad_1"],
    campaignIds: ["campaign_1"],
    adAccountIds: ["act_1"],
    pageIds: ["page_1"],
  },
  performance: {
    currency: "USD",
    spend: 200,
    impressions: 10_000,
    dailyReachSum: 8_000,
    linkCtr: 2,
    installs: 500,
    registrations: 250,
    cpi: 0.4,
    costPerRegistration: 0.8,
    resultValues: {},
    hookRate: 30,
    holdRate: 20,
    osBaselineCpi: null,
    rating: null,
    dateFrom: "2026-07-01",
    dateTo: "2026-07-30",
    evaluation: null,
  },
};

describe("GET /api/reporting/creatives", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnerDetailSnapshot.mockResolvedValue({ snapshot });
    mocks.getCreativeRowsForReport.mockResolvedValue({
      creatives: [creative],
      truncated: false,
      delivery: [],
    });
  });

  it("pins the canonical report context and returns the full envelope", async () => {
    const request = new NextRequest(
      "https://tracker.example/api/reporting/creatives" +
        "?from=2026-07-01&to=2026-07-30" +
        "&account_ids=act_1&campaign=campaign_1" +
        "&objective=leads&result=lead&currency=USD" +
        "&attribution=7d_click_1d_view" +
        "&action_report_time=mixed&sync_version=run_9",
    );

    const response = await GET(request);
    const body = await response.json();

    expect(mocks.requireOwnerDetailSnapshot).toHaveBeenCalledWith(
      request,
    );
    expect(mocks.getCreativeRowsForReport).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot,
        dateFrom: "2026-07-01",
        dateTo: "2026-07-30",
        accountMetaIds: ["act_1"],
        campaignMetaId: "campaign_1",
        currency: "USD",
        attributionWindow: "7d_click_1d_view",
        actionReportTime: "mixed",
        syncVersion: "run_9",
        reportContext: expect.objectContaining({
          objectiveKey: "leads",
          primaryResultKey: "lead",
          syncVersion: "run_9",
        }),
      }),
    );
    expect(body.data.creatives).toHaveLength(1);
    expect(
      body.data.creatives[0].performance_by_currency[0],
    ).toMatchObject({
      result_values: {},
      result_values_source:
        "normalized_meta_attributed_result_facts",
      primary_result_value: null,
      performance_status: "not_eligible",
      fatigue_status: "insufficient",
    });
    expect(
      body.data.creatives[0].performance_by_currency[0]
        .result_values,
    ).not.toHaveProperty("install");
    expect(body.meta).toMatchObject({
      context: {
        adAccountIds: ["act_1"],
        objectiveKey: "leads",
        primaryResultKey: "lead",
        currency: "USD",
        syncVersion: "run_9",
      },
      dataThrough: "2026-07-30",
      lastSuccessfulSyncAt: "2026-07-31T01:14:00.000Z",
      syncStatus: "completed",
      coverage: {
        resultMapping: {
          covered: 0,
          total: 1,
          ratio: 0,
        },
      },
    });
    expect(body.meta.warnings).toEqual([
      expect.objectContaining({
        code: "CREATIVE_RESULT_MAPPING_GAP",
        source: "coverage",
      }),
    ]);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store",
    );
    expect(response.headers.get("Vary")).toBe("Cookie");
  });
});
