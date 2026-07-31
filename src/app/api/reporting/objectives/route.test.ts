import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireOwnerDetailSnapshot: vi.fn(),
  detailErrorResponse: vi.fn(() =>
    Response.json(
      { code: "OWNER_SESSION_REQUIRED" },
      {
        status: 401,
        headers: {
          "Cache-Control": "private, no-store",
          Vary: "Cookie",
          "X-Detail-Error": "owner",
        },
      },
    ),
  ),
  resolveSnapshotReportingRequest: vi.fn(),
}));

vi.mock("@/lib/detail-api", () => ({
  requireOwnerDetailSnapshot: mocks.requireOwnerDetailSnapshot,
  detailErrorResponse: mocks.detailErrorResponse,
}));
vi.mock("@/lib/reporting/snapshot-reporting-request", () => ({
  resolveSnapshotReportingRequest:
    mocks.resolveSnapshotReportingRequest,
}));

import { GET } from "./route";

const context = {
  businessIds: ["bm_1"],
  adAccountIds: ["act_1"],
  dateFrom: "2026-07-01",
  dateTo: "2026-07-31",
  compareMode: "none",
  objectiveKey: "all",
  currency: "VND",
  currencyMode: "single",
  reportingTimezoneMode: "account_local",
  attributionSettingKey: "account_default",
  actionReportTime: "mixed",
  syncVersion: "sync_1",
} as const;

describe("GET /api/reporting/objectives", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnerDetailSnapshot.mockResolvedValue({
      snapshot: {
        freshness: {
          dataThroughAt: "2026-07-30T23:59:59.000Z",
          lastSyncedAt: "2026-07-31T08:14:00.000Z",
          syncStatus: "healthy",
        },
      },
    });
    mocks.resolveSnapshotReportingRequest.mockReturnValue({
      context,
      warnings: [],
    });
  });

  it("returns the authenticated friendly registry in the common envelope", async () => {
    const response = await GET(
      new NextRequest(
        "https://tracker.example/api/reporting/objectives",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(body.data.objectives).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "app_promotion",
          label: "Quảng bá ứng dụng",
        }),
        expect.objectContaining({
          key: "sales",
          label: "Doanh số",
        }),
      ]),
    );
    expect(body.meta.context.syncVersion).toBe("sync_1");
    expect(body.meta.dataThrough).toBe("2026-07-30");
    expect(body).not.toHaveProperty("ok");
  });

  it("requires the owner-bound reporting snapshot", async () => {
    const error = new Error("OWNER_SESSION_REQUIRED");
    mocks.requireOwnerDetailSnapshot.mockRejectedValue(error);
    const response = await GET(
      new NextRequest(
        "https://tracker.example/api/reporting/objectives",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      code: "OWNER_SESSION_REQUIRED",
    });
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("x-detail-error")).toBe(
      "owner",
    );
    expect(mocks.detailErrorResponse).toHaveBeenCalledWith(error);
  });
});
