import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const familyId = "cf_0123456789abcdef01234567";
const repository = { ownerBound: true };
const snapshot = {
  settings: {
    timezone: "Asia/Ho_Chi_Minh",
    lookbackDays: 30,
  },
  freshness: {
    lastSyncedAt: "2026-07-30T08:00:00.000Z",
    dataThroughAt: "2026-07-30T07:55:00.000Z",
    syncStatus: "healthy",
    freshnessSeconds: 300,
    syncMode: "scheduled",
    syncVersion: "run-9",
  },
  syncRuns: [],
};

const reportingContext = {
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
  syncVersion: "run-9",
};

const mocks = vi.hoisted(() => ({
  getCreativeFamilyRowsForReport: vi.fn(),
  canonicalDetailId: vi.fn(
    (_kind: string, value: string) => value,
  ),
  creativeFamilyContract: vi.fn(() => ({
    creative_family_id: "cf_0123456789abcdef01234567",
  })),
  requireOwnerDetailSnapshot: vi.fn(),
  detailSuccess: vi.fn(
    (data: unknown) => Response.json({ ok: true, data }),
  ),
  detailErrorResponse: vi.fn(
    () => Response.json({ ok: false }, { status: 500 }),
  ),
  resolveReportingRequest: vi.fn(),
}));

vi.mock("@/lib/app-data", () => ({
  getCreativeFamilyRowsForReport:
    mocks.getCreativeFamilyRowsForReport,
}));
vi.mock("@/lib/detail-api", () => ({
  canonicalDetailId: mocks.canonicalDetailId,
  creativeFamilyContract: mocks.creativeFamilyContract,
  DetailApiError: class DetailApiError extends Error {},
  detailSuccess: mocks.detailSuccess,
  detailErrorResponse: mocks.detailErrorResponse,
  requireOwnerDetailSnapshot: mocks.requireOwnerDetailSnapshot,
}));
vi.mock("@/lib/reporting", () => ({
  resolveReportingRequest: mocks.resolveReportingRequest,
}));

import { GET } from "./route";
import { GET as REPORTING_GET } from "../../reporting/creatives/[id]/route";

describe("Creative Family detail API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnerDetailSnapshot.mockResolvedValue({
      repository,
      snapshot,
    });
    mocks.getCreativeFamilyRowsForReport.mockResolvedValue([
      { creativeFamilyId: familyId },
    ]);
    mocks.resolveReportingRequest.mockReturnValue({
      context: reportingContext,
      resolved: reportingContext,
      warnings: [],
    });
  });

  it("uses owner-bound exact lookup with the full reporting context", async () => {
    const request = new NextRequest(
      `https://tracker.example/api/creative-families/${familyId}` +
        "?from=2026-07-01&to=2026-07-30" +
        "&account=act_1&campaign=campaign_1&currency=VND" +
        "&objective=leads&result=lead" +
        "&attribution=7d_click_1d_view" +
        "&action_report_time=mixed&sync_version=run-9",
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: familyId }),
    });

    expect(response.status).toBe(200);
    expect(mocks.requireOwnerDetailSnapshot).toHaveBeenCalledWith(
      request,
    );
    expect(mocks.resolveReportingRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        searchParams: request.nextUrl.searchParams,
        timeZone: "Asia/Ho_Chi_Minh",
        lookbackDays: 30,
        defaults: expect.objectContaining({
          syncVersion: "run-9",
        }),
      }),
    );
    expect(mocks.getCreativeFamilyRowsForReport).toHaveBeenCalledWith({
      snapshot,
      repository,
      creativeFamilyId: familyId,
      dateFrom: "2026-07-01",
      dateTo: "2026-07-30",
      currency: "VND",
      accountMetaIds: ["act_1"],
      campaignMetaId: "campaign_1",
      attributionWindow: "7d_click_1d_view",
      actionReportTime: "mixed",
      syncVersion: "run-9",
      reportContext: reportingContext,
    });
    expect(mocks.creativeFamilyContract).toHaveBeenCalledWith(
      familyId,
      [{ creativeFamilyId: familyId }],
      snapshot.freshness,
      reportingContext,
    );
    expect(mocks.detailSuccess).toHaveBeenCalledWith({
      creative_family_id: familyId,
      result_truncated: false,
    });
  });

  it("keeps the legacy handler separate from the standardized reporting envelope", () => {
    expect(REPORTING_GET).not.toBe(GET);
  });
});
