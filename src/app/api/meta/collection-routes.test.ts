import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwnerDetailSnapshot: vi.fn(),
  detailErrorResponse: vi.fn(() => {
    return new Response(
      JSON.stringify({
        ok: false,
        code: "OWNER_SESSION_REQUIRED",
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, no-store",
          Vary: "Cookie",
        },
      },
    );
  }),
}));

vi.mock("@/lib/detail-api", () => ({
  requireOwnerDetailSnapshot:
    mocks.requireOwnerDetailSnapshot,
  detailErrorResponse: mocks.detailErrorResponse,
}));

import { GET as getAdAccounts } from "./ad-accounts/route";
import { GET as getBusinesses } from "./businesses/route";
import { GET as getPages } from "./pages/route";

function snapshot() {
  return {
    settings: {
      timezone: "UTC",
      lookbackDays: 30,
      currency: null,
      compareDefault: "previous_period",
    },
    freshness: {
      dataThroughAt: "2026-07-30T23:59:59.999Z",
      lastSyncedAt: "2026-07-31T01:14:00.000Z",
      syncStatus: "warning",
      syncVersion: "sync_42",
    },
    syncRuns: [{ id: "sync_42", status: "success" }],
    reportingScope: {
      available: {
        businesses: [
          {
            id: "biz_1",
            name: "Business One",
            isActive: true,
            adAccountIds: ["act_1"],
          },
          {
            id: "biz_2",
            name: "Business Two",
            isActive: true,
            adAccountIds: ["act_2", "act_old"],
          },
        ],
        adAccounts: [
          {
            id: "act_1",
            name: "Account One",
            currency: "USD",
            timezone: "America/Los_Angeles",
            isActive: true,
            businessIds: ["biz_1"],
          },
          {
            id: "act_2",
            name: "Account Two",
            currency: "VND",
            timezone: "Asia/Ho_Chi_Minh",
            isActive: true,
            businessIds: ["biz_2"],
          },
          {
            id: "act_old",
            name: "Old Account",
            currency: "VND",
            timezone: "Asia/Ho_Chi_Minh",
            isActive: false,
            businessIds: ["biz_2"],
          },
        ],
      },
      selected: {
        businessIds: ["biz_1"],
        adAccountIds: ["act_1"],
      },
      unavailableSelected: {
        businessIds: ["biz_revoked"],
        adAccountIds: ["act_revoked"],
      },
    },
    assets: [
      {
        id: "biz_1",
        name: "Business One",
        kind: "Business",
        parentName: null,
        status: "ACTIVE",
        isCurrent: true,
        verificationStatus: "verified",
        lastSeenAt: "2026-07-31T01:00:00.000Z",
        accessToken: "secret_business_token",
      },
      {
        id: "biz_2",
        name: "Business Two",
        kind: "Business",
        parentName: null,
        status: "ACTIVE",
        isCurrent: true,
        verificationStatus: "not_verified",
        lastSeenAt: "2026-07-31T01:00:00.000Z",
      },
      {
        id: "biz_old",
        name: "Historical Business",
        kind: "Business",
        parentName: null,
        status: "INACTIVE",
        isCurrent: false,
      },
      {
        id: "act_1",
        name: "Account One",
        kind: "Ad Account",
        parentName: "Business One",
        status: "ACTIVE",
        isCurrent: true,
        currency: "USD",
        timezone: "America/Los_Angeles",
        lastSeenAt: "2026-07-31T01:00:00.000Z",
        encryptedAccessToken: "secret_account_token",
      },
      {
        id: "act_2",
        name: "Account Two",
        kind: "Ad Account",
        parentName: "Business Two",
        status: "ACTIVE",
        isCurrent: true,
        currency: "VND",
        timezone: "Asia/Ho_Chi_Minh",
        lastSeenAt: "2026-07-31T01:00:00.000Z",
      },
      {
        id: "act_old",
        name: "Old Account",
        kind: "Ad Account",
        parentName: "Business Two",
        status: "INACTIVE",
        isCurrent: false,
        currency: "VND",
        timezone: "Asia/Ho_Chi_Minh",
      },
      {
        id: "page_1",
        name: "Shop Page",
        kind: "Page",
        parentName: null,
        status: "DISCOVERED",
        category: "Retail",
        isCurrent: true,
        lastSeenAt: "2026-07-31T01:00:00.000Z",
        accessToken: "secret_page_token",
      },
      {
        id: "page_2",
        name: "Community Page",
        kind: "Page",
        parentName: null,
        status: "DISCOVERED",
        category: "Community",
        isCurrent: true,
      },
      {
        id: "page_old",
        name: "Historical Page",
        kind: "Page",
        parentName: null,
        status: "DISCOVERED",
        category: "Retail",
        isCurrent: false,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOwnerDetailSnapshot.mockResolvedValue({
    repository: {},
    connection: {
      connectionId: "connection_1",
      encryptedAccessToken: "connection_secret",
    },
    snapshot: snapshot(),
  });
});

function expectPrivate(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe(
    "private, no-store",
  );
  expect(response.headers.get("Vary")).toBe("Cookie");
}

describe("owner-scoped Meta collection routes", () => {
  it("enforces owner authentication before returning inventory", async () => {
    const authError = new Error("owner session missing");
    mocks.requireOwnerDetailSnapshot.mockRejectedValue(authError);

    const response = await getBusinesses(
      new NextRequest(
        "https://tracker.example/api/meta/businesses",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expectPrivate(response);
    expect(body).toEqual({
      ok: false,
      code: "OWNER_SESSION_REQUIRED",
    });
    expect(mocks.detailErrorResponse).toHaveBeenCalledWith(
      authError,
    );
  });

  it("returns businesses in the common envelope with persisted scope selection", async () => {
    const response = await getBusinesses(
      new NextRequest(
        "https://tracker.example/api/meta/businesses",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(body.data.businesses).toEqual([
      expect.objectContaining({
        businessId: "biz_1",
        adAccountIds: ["act_1"],
        selectedForReporting: true,
      }),
      expect.objectContaining({
        businessId: "biz_2",
        adAccountIds: ["act_2", "act_old"],
        selectedForReporting: false,
      }),
    ]);
    expect(body.data.inventory).toEqual({
      returned: 2,
      accessible: 2,
    });
    expect(body.meta).toMatchObject({
      context: {
        businessIds: ["biz_1"],
        adAccountIds: ["act_1"],
        currency: "USD",
        currencyMode: "single",
        syncVersion: "sync_42",
      },
      dataThrough: "2026-07-30",
      lastSuccessfulSyncAt: "2026-07-31T01:14:00.000Z",
      syncStatus: "completed_with_warnings",
      coverage: {
        assets: { covered: 2, total: 2, ratio: 1 },
        reportingScope: { covered: 1, total: 1, ratio: 1 },
      },
    });
    expect(body.meta.warnings).toContainEqual(
      expect.objectContaining({
        code: "REPORTING_CONTEXT_FALLBACK",
        source: "backend_fallback",
      }),
    );
    expect(JSON.stringify(body)).not.toContain("secret_");
    expect(JSON.stringify(body)).not.toContain("accessToken");
  });

  it("clamps explicit Ad Account scope to owner assets and applies business/currency filters", async () => {
    const response = await getAdAccounts(
      new NextRequest(
        "https://tracker.example/api/meta/ad-accounts" +
          "?business_ids=biz_2" +
          "&account_ids=act_2,act_unknown" +
          "&currency=VND&selected_only=1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(body.data.adAccounts).toEqual([
      expect.objectContaining({
        adAccountId: "act_2",
        businessIds: ["biz_2"],
        currency: "VND",
        selectedForReporting: true,
      }),
    ]);
    expect(body.meta.context).toMatchObject({
      businessIds: ["biz_2"],
      adAccountIds: ["act_2"],
      currency: "VND",
      currencyMode: "single",
    });
    expect(body.meta.warnings).toContainEqual(
      expect.objectContaining({
        code: "REPORTING_CONTEXT_FALLBACK",
        fallbacks: expect.arrayContaining([
          expect.objectContaining({
            field: "adAccountIds",
            requested: ["act_2", "act_unknown"],
            applied: ["act_2"],
            reason: "owner_asset_scope_enforced",
          }),
        ]),
      }),
    );
    expect(body.meta.coverage.reportingScope).toMatchObject({
      covered: 1,
      total: 1,
      ratio: 1,
    });
    expect(JSON.stringify(body)).not.toContain(
      "secret_account_token",
    );
  });

  it("filters Pages without inventing activity status or reporting-scope membership", async () => {
    const response = await getPages(
      new NextRequest(
        "https://tracker.example/api/meta/pages" +
          "?q=shop&category=retail",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(body.data.pages).toEqual([
      {
        pageId: "page_1",
        name: "Shop Page",
        category: "Retail",
        discoveryStatus: "discovered",
        activityStatus: "not_provided_by_meta",
        isCurrent: true,
        lastSeenAt: "2026-07-31T01:00:00.000Z",
      },
    ]);
    expect(body.meta.coverage.reportingScope).toMatchObject({
      covered: 0,
      total: 0,
      ratio: null,
      basis: "pages_not_part_of_reporting_scope",
    });
    expect(body.meta.context).toMatchObject({
      businessIds: ["biz_1"],
      adAccountIds: ["act_1"],
      syncVersion: "sync_42",
    });
    expect(JSON.stringify(body)).not.toContain(
      "secret_page_token",
    );
  });
});
