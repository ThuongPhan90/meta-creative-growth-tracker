import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  legacyManualSync: vi.fn(),
  requireOwnerDetailSnapshot: vi.fn(),
  detailErrorResponse: vi.fn(
    () => Response.json({ ok: false }, { status: 500 }),
  ),
  resolveSnapshotReportingRequest: vi.fn(),
}));

vi.mock("../route", () => ({
  POST: mocks.legacyManualSync,
}));
vi.mock("@/lib/detail-api", () => ({
  requireOwnerDetailSnapshot:
    mocks.requireOwnerDetailSnapshot,
  detailErrorResponse: mocks.detailErrorResponse,
}));
vi.mock("@/lib/reporting/snapshot-reporting-request", () => ({
  resolveSnapshotReportingRequest:
    mocks.resolveSnapshotReportingRequest,
}));

import { POST } from "./route";

const context = {
  businessIds: ["bm_1"],
  adAccountIds: ["act_1"],
  dateFrom: "2026-07-01",
  dateTo: "2026-07-31",
  compareMode: "none",
  objectiveKey: "all",
  currency: "USD",
  currencyMode: "single",
  reportingTimezoneMode: "account_local",
  attributionSettingKey: "account_default",
  actionReportTime: "mixed",
  syncVersion: "sync_2",
} as const;

function request() {
  return new NextRequest(
    "https://tracker.example/api/sync/manual?kind=incremental",
    {
      method: "POST",
      headers: {
        Origin: "https://tracker.example",
      },
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOwnerDetailSnapshot.mockResolvedValue({
    snapshot: {
      freshness: {
        dataThroughAt: "2026-07-31T23:59:59.000Z",
        lastSyncedAt: "2026-08-01T01:14:00.000Z",
        syncStatus: "warning",
      },
    },
  });
  mocks.resolveSnapshotReportingRequest.mockReturnValue({
    context,
    warnings: [],
  });
});

describe("POST /api/sync/manual canonical wrapper", () => {
  it("wraps a completed legacy sync in the common envelope", async () => {
    mocks.legacyManualSync.mockResolvedValue(
      Response.json({
        ok: true,
        message: "Sync completed.",
        run: {
          id: "sync_2",
          kind: "incremental",
          status: "succeeded",
          warningCount: 2,
        },
      }),
    );

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(body.data).toEqual({
      message: "Sync completed.",
      run: {
        id: "sync_2",
        kind: "incremental",
        status: "succeeded",
        warningCount: 2,
      },
    });
    expect(body).not.toHaveProperty("ok");
    expect(body.meta).toMatchObject({
      context: {
        adAccountIds: ["act_1"],
        syncVersion: "sync_2",
      },
      dataThrough: "2026-07-31",
      lastSuccessfulSyncAt: "2026-08-01T01:14:00.000Z",
      syncStatus: "completed_with_warnings",
      coverage: {
        syncRun: { covered: 1, total: 1, ratio: 1 },
        adAccounts: { covered: 1, total: 1, ratio: 1 },
      },
    });
    expect(body.meta.warnings).toEqual([
      expect.objectContaining({
        code: "MANUAL_SYNC_COMPLETED_WITH_WARNINGS",
        source: "sync",
        details: {
          syncRunId: "sync_2",
          warningCount: 2,
        },
      }),
    ]);
  });

  it("preserves a successful 202 already-running outcome", async () => {
    mocks.legacyManualSync.mockResolvedValue(
      Response.json(
        {
          ok: true,
          message: "Another sync is running.",
          code: "SYNC_ALREADY_RUNNING",
        },
        { status: 202 },
      ),
    );

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.data).toEqual({
      message: "Another sync is running.",
      code: "SYNC_ALREADY_RUNNING",
    });
    expect(body.meta.coverage.syncRun).toMatchObject({
      covered: 0,
      total: 1,
      ratio: 0,
    });
    expect(body.meta.warnings).toEqual([
      expect.objectContaining({
        code: "SYNC_ALREADY_RUNNING",
        severity: "info",
      }),
    ]);
  });

  it("returns a legacy 409 failure unchanged", async () => {
    mocks.legacyManualSync.mockResolvedValue(
      Response.json(
        {
          ok: false,
          code: "META_REAUTH_REQUIRED",
          error: "Reconnect Meta.",
        },
        {
          status: 409,
          headers: {
            "X-Legacy-Error": "preserved",
          },
        },
      ),
    );

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      ok: false,
      code: "META_REAUTH_REQUIRED",
      error: "Reconnect Meta.",
    });
    expect(response.headers.get("x-legacy-error")).toBe(
      "preserved",
    );
    expect(
      mocks.requireOwnerDetailSnapshot,
    ).not.toHaveBeenCalled();
  });
});
