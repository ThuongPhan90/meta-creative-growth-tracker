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
  },
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
  resolveReportContext: vi.fn(() => ({
    dateFrom: "2026-07-01",
    dateTo: "2026-07-30",
    account: "act_1",
  })),
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
  resolveReportContext: mocks.resolveReportContext,
}));

import { GET } from "./route";

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
  });

  it("uses owner-bound exact lookup with the full reporting context", async () => {
    const request = new NextRequest(
      `https://tracker.example/api/creative-families/${familyId}` +
        "?from=2026-07-01&to=2026-07-30" +
        "&account=act_1&campaign=campaign_1&currency=VND",
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: familyId }),
    });

    expect(response.status).toBe(200);
    expect(mocks.requireOwnerDetailSnapshot).toHaveBeenCalledWith(
      request,
    );
    expect(mocks.getCreativeFamilyRowsForReport).toHaveBeenCalledWith({
      snapshot,
      repository,
      creativeFamilyId: familyId,
      dateFrom: "2026-07-01",
      dateTo: "2026-07-30",
      currency: "VND",
      accountMetaId: "act_1",
      campaignMetaId: "campaign_1",
    });
    expect(mocks.detailSuccess).toHaveBeenCalledWith({
      creative_family_id: familyId,
      result_truncated: false,
    });
  });
});
