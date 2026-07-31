import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  legacyGetScope: vi.fn(),
  legacyPostScope: vi.fn(),
  requireOwnerDetailSnapshot: vi.fn(),
  detailErrorResponse: vi.fn(
    () => Response.json({ ok: false }, { status: 500 }),
  ),
  resolveSnapshotReportingRequest: vi.fn(),
}));

vi.mock("../reporting/scope/route", () => ({
  GET: mocks.legacyGetScope,
  POST: mocks.legacyPostScope,
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

import { GET, POST } from "./route";

const appUrl = "https://tracker.example";
const scope = {
  available: {
    businesses: [
      {
        id: "bm_1",
        name: "Business One",
        isActive: true,
        adAccountIds: ["act_1"],
        selected: true,
        selectionState: "all",
      },
    ],
    adAccounts: [
      {
        id: "act_1",
        name: "Account One",
        isActive: true,
        accountStatus: 1,
        currency: "USD",
        timezone: "UTC",
        businessIds: ["bm_1"],
        selected: true,
        isOrphan: false,
      },
    ],
  },
  selected: {
    businessIds: ["bm_1"],
    adAccountIds: ["act_1"],
    businessState: "all",
    adAccountState: "all",
    source: {
      businesses: "persisted",
      adAccounts: "persisted",
    },
  },
  unavailableSelected: {
    businessIds: [],
    adAccountIds: ["act_missing"],
  },
  confirmedAt: "2026-07-31T01:00:00.000Z",
  updatedAt: "2026-07-31T01:00:00.000Z",
} as const;

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
  syncVersion: "sync_1",
} as const;

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
});

describe("/api/scopes canonical wrapper", () => {
  it("wraps legacy GET scope data in the common reporting envelope", async () => {
    mocks.legacyGetScope.mockResolvedValue(
      Response.json({ ok: true, scope }),
    );
    const request = new NextRequest(
      `${appUrl}/api/scopes?account_ids=act_1`,
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(body.data.scope).toEqual(scope);
    expect(body).not.toHaveProperty("ok");
    expect(body.meta).toMatchObject({
      context: {
        businessIds: ["bm_1"],
        adAccountIds: ["act_1"],
        syncVersion: "sync_1",
      },
      dataThrough: "2026-07-30",
      lastSuccessfulSyncAt: "2026-07-31T08:14:00.000Z",
      syncStatus: "completed_with_warnings",
      coverage: {
        businesses: {
          covered: 1,
          total: 1,
          ratio: 1,
        },
        adAccounts: {
          covered: 1,
          total: 2,
          ratio: 0.5,
        },
      },
    });
    expect(body.meta.warnings).toEqual([
      expect.objectContaining({
        code: "REPORTING_SCOPE_MEMBERS_UNAVAILABLE",
        source: "coverage",
      }),
    ]);
  });

  it("wraps legacy POST success and preserves its HTTP status", async () => {
    mocks.legacyPostScope.mockResolvedValue(
      Response.json(
        {
          ok: true,
          message: "Đã lưu phạm vi báo cáo.",
          scope: {
            ...scope,
            unavailableSelected: {
              businessIds: [],
              adAccountIds: [],
            },
          },
        },
        { status: 201 },
      ),
    );
    const request = new NextRequest(`${appUrl}/api/scopes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: appUrl,
      },
      body: JSON.stringify({
        businessIds: ["bm_1"],
        adAccountIds: ["act_1"],
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data).toMatchObject({
      message: "Đã lưu phạm vi báo cáo.",
      scope: {
        selected: {
          businessIds: ["bm_1"],
          adAccountIds: ["act_1"],
        },
      },
    });
    expect(body.meta.warnings).toEqual([]);
    expect(body).not.toHaveProperty("ok");
  });

  it("returns a legacy 409 error unchanged and does not turn it into a success envelope", async () => {
    mocks.legacyGetScope.mockResolvedValue(
      Response.json(
        {
          ok: false,
          code: "META_NOT_CONNECTED",
          error: "Meta not connected",
        },
        {
          status: 409,
          headers: {
            "X-Legacy-Error": "preserved",
          },
        },
      ),
    );

    const response = await GET(
      new NextRequest(`${appUrl}/api/scopes`),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      ok: false,
      code: "META_NOT_CONNECTED",
      error: "Meta not connected",
    });
    expect(response.headers.get("x-legacy-error")).toBe(
      "preserved",
    );
    expect(
      mocks.requireOwnerDetailSnapshot,
    ).not.toHaveBeenCalled();
  });
});
