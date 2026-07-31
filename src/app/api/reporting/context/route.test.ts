import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireOwnerDetailSnapshot: vi.fn(),
  detailErrorResponse: vi.fn(
    () => Response.json({ ok: false }, { status: 500 }),
  ),
}));

vi.mock("@/lib/detail-api", () => ({
  requireOwnerDetailSnapshot: mocks.requireOwnerDetailSnapshot,
  detailErrorResponse: mocks.detailErrorResponse,
}));

import { GET } from "./route";

describe("GET /api/reporting/context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnerDetailSnapshot.mockResolvedValue({
      snapshot: {
        settings: {
          timezone: "Asia/Ho_Chi_Minh",
          lookbackDays: 30,
          currency: null,
          compareDefault: "previous_period",
        },
        freshness: {
          dataThroughAt: "2026-07-30T23:59:59.999Z",
          lastSyncedAt: "2026-07-31T01:14:00.000Z",
          syncStatus: "warning",
        },
        syncRuns: [
          {
            id: "sync_42",
            status: "success",
          },
        ],
        assets: [
          {
            id: "biz_1",
            name: "Business One",
            kind: "Business",
            isCurrent: true,
          },
          {
            id: "act_1",
            name: "Account One",
            kind: "Ad Account",
            isCurrent: true,
            parentName: "Business One",
            currency: "USD",
            timezone: "America/Los_Angeles",
          },
        ],
      },
    });
  });

  it("returns the effective V2 context, freshness, coverage and scope", async () => {
    const request = new NextRequest(
      "https://tracker.example/api/reporting/context" +
        "?from=2026-07-01&to=2026-07-30" +
        "&business_ids=biz_1&account_ids=act_1" +
        "&objective=sales&result=purchase&currency=USD" +
        "&action_report_time=conversion",
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(body.meta).toMatchObject({
      context: {
        businessIds: ["biz_1"],
        adAccountIds: ["act_1"],
        dateFrom: "2026-07-01",
        dateTo: "2026-07-30",
        objectiveKey: "sales",
        primaryResultKey: "purchase",
        currency: "USD",
        currencyMode: "single",
        actionReportTime: "conversion",
        syncVersion: "sync_42",
      },
      dataThrough: "2026-07-30",
      lastSuccessfulSyncAt: "2026-07-31T01:14:00.000Z",
      syncStatus: "completed_with_warnings",
      coverage: {
        businesses: { covered: 1, total: 1, ratio: 1 },
        adAccounts: { covered: 1, total: 1, ratio: 1 },
      },
      warnings: [],
    });
    expect(body.data.availableScope.selectionMode).toBe("explicit");
  });

  it("exposes backend fallbacks instead of applying them silently", async () => {
    const request = new NextRequest(
      "https://tracker.example/api/reporting/context" +
        "?from=2026-02-30&currency=US+dollars",
    );

    const response = await GET(request);
    const body = await response.json();

    expect(body.meta.warnings).toContainEqual(
      expect.objectContaining({
        code: "REPORTING_CONTEXT_FALLBACK",
        source: "backend_fallback",
      }),
    );
  });
});
