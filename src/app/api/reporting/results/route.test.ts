import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  legacyResultDefinitions: vi.fn(),
  requireOwnerDetailSnapshot: vi.fn(),
  detailErrorResponse: vi.fn((error: unknown) => {
    const typed = error as {
      status?: number;
      code?: string;
    };
    return Response.json(
      { code: typed.code ?? "OWNER_SESSION_REQUIRED" },
      {
        status: typed.status ?? 401,
        headers: {
          "Cache-Control": "private, no-store",
          Vary: "Cookie",
          "X-Detail-Error": "preserved",
        },
      },
    );
  }),
  resolveSnapshotReportingRequest: vi.fn(),
}));

vi.mock("../../result-definitions/route", () => ({
  GET: mocks.legacyResultDefinitions,
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
  objectiveKey: "sales",
  primaryResultKey: "purchase",
  currency: "USD",
  currencyMode: "single",
  reportingTimezoneMode: "account_local",
  attributionSettingKey: "7d_click_1d_view",
  actionReportTime: "conversion",
  syncVersion: "sync_12",
} as const;

describe("GET /api/reporting/results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnerDetailSnapshot.mockResolvedValue({
      snapshot: {
        freshness: {
          dataThroughAt: "2026-07-30T23:59:59.000Z",
          lastSyncedAt: "2026-07-31T08:14:00.000Z",
          syncStatus: "warning",
        },
      },
    });
    mocks.resolveSnapshotReportingRequest.mockReturnValue({
      context,
      warnings: [],
    });
    mocks.legacyResultDefinitions.mockResolvedValue(
      Response.json({
        data: {
          resultDefinitions: [
            { canonicalKey: "purchase", enabled: true },
            { canonicalKey: "purchase_value", enabled: true },
          ],
          resultMappings: [
            {
              canonicalResultKey: "purchase",
              enabled: true,
            },
          ],
          source: "database",
        },
        warnings: [],
      }),
    );
  });

  it("wraps the hydrated registry in exact reporting metadata", async () => {
    const response = await GET(
      new NextRequest(
        "https://tracker.example/api/reporting/results" +
          "?objective=sales&result=purchase",
      ),
    );
    const body = await response.json();

    expect(body.data.source).toBe("database");
    expect(body.meta.context).toMatchObject({
      objectiveKey: "sales",
      primaryResultKey: "purchase",
      syncVersion: "sync_12",
    });
    expect(body.meta.syncStatus).toBe(
      "completed_with_warnings",
    );
    expect(body.meta.coverage.resultMappings).toMatchObject({
      covered: 1,
      total: 2,
      ratio: 0.5,
    });
    expect(body).not.toHaveProperty("ok");
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("moves registry fallback warnings into top-level metadata", async () => {
    mocks.legacyResultDefinitions.mockResolvedValue(
      Response.json({
        data: {
          resultDefinitions: [
            { canonicalKey: "purchase", enabled: true },
          ],
          resultMappings: [],
          source: "built_in_defaults",
        },
        meta: {
          warnings: [
            {
              code: "RESULT_REGISTRY_FALLBACK",
              severity: "warning",
              message:
                "Đang dùng Result Registry dự phòng.",
            },
          ],
        },
      }),
    );

    const body = await (
      await GET(
        new NextRequest(
          "https://tracker.example/api/reporting/results",
        ),
      )
    ).json();

    expect(body.meta.warnings[0]).toMatchObject({
      code: "RESULT_REGISTRY_FALLBACK",
      source: "reporting",
    });
    expect(body).not.toHaveProperty("warnings");
  });

  it("preserves a 409 detail error response without wrapping it as success", async () => {
    const error = Object.assign(
      new Error("META_NOT_CONNECTED"),
      {
        status: 409,
        code: "META_NOT_CONNECTED",
      },
    );
    mocks.requireOwnerDetailSnapshot.mockRejectedValue(error);

    const response = await GET(
      new NextRequest(
        "https://tracker.example/api/reporting/results",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({ code: "META_NOT_CONNECTED" });
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("x-detail-error")).toBe(
      "preserved",
    );
    expect(body).not.toHaveProperty("data");
    expect(mocks.detailErrorResponse).toHaveBeenCalledWith(error);
  });
});
