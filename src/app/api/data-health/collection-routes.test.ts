import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwnerDetailSnapshot: vi.fn(),
  detailErrorResponse: vi.fn(
    () => Response.json({ ok: false }, { status: 500 }),
  ),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/detail-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/detail-api")>();
  return {
    ...actual,
    requireOwnerDetailSnapshot:
      mocks.requireOwnerDetailSnapshot,
    detailErrorResponse: mocks.detailErrorResponse,
  };
});

import { GET as getIssues } from "./issues/route";
import { GET as getSummary } from "./summary/route";
import { GET as getSyncRuns } from "../sync-runs/route";

const syncRuns = [
  {
    id: "run_2",
    kind: "Đồng bộ Insights · Lịch chạy",
    status: "partial",
    startedAt: "31/07/2026 08:00",
    finishedAt: "31/07/2026 08:05",
    startedAtIso: "2026-07-31T01:00:00.000Z",
    finishedAtIso: "2026-07-31T01:05:00.000Z",
    durationSeconds: 300,
    recordCount: 1_200,
    errorCount: 75,
    summary: "1 cảnh báo cần kiểm tra",
    technicalSummary: "Stage: insights",
    warnings: [
      {
        code: "META_INSIGHT_ROW_UNMAPPED",
        resource: "act_1/ads",
        message: "Raw warning message two",
      },
    ],
  },
  {
    id: "run_1",
    kind: "Đồng bộ Insights · Thủ công",
    status: "success",
    startedAt: "30/07/2026 08:00",
    finishedAt: "30/07/2026 08:04",
    startedAtIso: "2026-07-30T01:00:00.000Z",
    finishedAtIso: "2026-07-30T01:04:00.000Z",
    durationSeconds: 240,
    recordCount: 1_100,
    errorCount: 25,
    summary: "1 cảnh báo cần kiểm tra",
    technicalSummary: null,
    warnings: [
      {
        code: "META_INSIGHT_ROW_UNMAPPED",
        resource: "act_1/ads",
        message: "Raw warning message one",
      },
    ],
  },
] as const;

function snapshot() {
  return {
    reportingScope: {
      available: {
        businesses: [],
        adAccounts: [
          {
            id: "act_1",
            currency: "USD",
          },
        ],
      },
      selected: {
        businessIds: ["bm_1"],
        adAccountIds: ["act_1"],
      },
      unavailableSelected: {
        businessIds: [],
        adAccountIds: [],
      },
    },
    settings: {
      timezone: "UTC",
      lookbackDays: 30,
      currency: "USD",
      compareDefault: "none",
    },
    freshness: {
      dataThroughAt: "2026-07-30T23:59:59.999Z",
      lastSyncedAt: "2026-07-31T01:05:00.000Z",
      syncStatus: "partial",
      syncVersion: "sync_42",
      freshnessSeconds: 3_600,
      syncMode: "scheduled",
    },
    syncRuns: [...syncRuns],
    dashboard: {
      events: [
        {
          name: "Purchase",
          android: "ready",
          ios: "warning",
          total: 12,
        },
      ],
    },
    creatives: [
      {
        id: "variant_a",
        creativeFamilyId: "cf_a",
        entityLinks: {
          campaignIds: ["campaign_1"],
          adIds: ["ad_1"],
        },
      },
      {
        id: "variant_b",
        creativeFamilyId: null,
        entityLinks: {
          campaignIds: [],
          adIds: ["ad_2"],
        },
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOwnerDetailSnapshot.mockResolvedValue({
    repository: {},
    connection: { connectionId: "connection_1" },
    snapshot: snapshot(),
  });
});

function expectPrivate(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe(
    "private, no-store",
  );
  expect(response.headers.get("Vary")).toBe("Cookie");
}

describe("read-only Data Health collection APIs", () => {
  it("returns a summary with stable coverage and distinct freshness fields", async () => {
    const response = await getSummary(
      new NextRequest(
        "https://tracker.example/api/data-health/summary" +
          "?from=2026-07-01&to=2026-07-30",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(body.data).toMatchObject({
      attentionLevel: "warning",
      issueCounts: {
        critical: 0,
        error: 0,
        warning: 1,
        info: 0,
        total: 1,
      },
      coverage: [
        {
          key: "campaign",
          covered: 1,
          total: 2,
          missing: 1,
          ratio: 0.5,
        },
        {
          key: "ad",
          covered: 2,
          total: 2,
          missing: 0,
          ratio: 1,
        },
        {
          key: "creative",
          covered: 1,
          total: 2,
          missing: 1,
          ratio: 0.5,
        },
        {
          key: "event",
          covered: 1,
          total: 2,
          missing: 1,
          ratio: 0.5,
        },
      ],
      latestRun: {
        syncRunId: "run_2",
        status: "partial",
        warningEntryCount: 1,
      },
    });
    expect(body).not.toHaveProperty("ok");
    expect(body.data).not.toHaveProperty("meta");
    expect(body.meta).toMatchObject({
      context: {
        businessIds: ["bm_1"],
        adAccountIds: ["act_1"],
        dateFrom: "2026-07-01",
        dateTo: "2026-07-30",
        currency: "USD",
        currencyMode: "single",
        syncVersion: "sync_42",
      },
      dataThrough: "2026-07-30",
      lastSuccessfulSyncAt: "2026-07-31T01:05:00.000Z",
      syncStatus: "partial",
      coverage: {
        campaign: {
          covered: 1,
          total: 2,
          ratio: 0.5,
          basis: "synchronized_creative_families",
        },
        ad: {
          covered: 2,
          total: 2,
          ratio: 1,
        },
        creative: {
          covered: 1,
          total: 2,
          ratio: 0.5,
        },
        event: {
          covered: 1,
          total: 2,
          ratio: 0.5,
          basis: "objective_result_mapping_cells",
        },
      },
      warnings: [
        {
          code: "DATA_HEALTH_COVERAGE_GAP",
          source: "coverage",
          severity: "warning",
        },
      ],
    });
    expect(JSON.stringify(body.data)).not.toContain(
      "META_INSIGHT_ROW_UNMAPPED",
    );
  });

  it("aggregates repeated warnings under one stable public issue without raw codes", async () => {
    const response = await getIssues(
      new NextRequest(
        "https://tracker.example/api/data-health/issues" +
          "?from=2026-07-01&to=2026-07-30",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(body.data.issues).toHaveLength(1);
    expect(body.data.issues[0]).toMatchObject({
      issueId: expect.stringMatching(/^issue_[a-f0-9]{24}$/),
      severity: "warning",
      occurrenceCount: 2,
      occurrenceBasis: "sync_warning_entries",
      affectedGroupCount: 1,
      affectedEntities: [
        {
          entityType: "ad_account",
          entityId: "act_1",
        },
      ],
      firstOccurredAt: "2026-07-30T01:04:00.000Z",
      lastOccurredAt: "2026-07-31T01:05:00.000Z",
      detailHref: expect.stringMatching(
        /^\/api\/data-health\/issues\/issue_/,
      ),
    });
    expect(body.data.pagination).toEqual({
      page: 1,
      limit: 50,
      offset: 0,
      total: 1,
    });
    expect(body.data).not.toHaveProperty("meta");
    expect(body.meta).toMatchObject({
      context: {
        businessIds: ["bm_1"],
        adAccountIds: ["act_1"],
        syncVersion: "sync_42",
      },
      dataThrough: "2026-07-30",
      lastSuccessfulSyncAt: "2026-07-31T01:05:00.000Z",
      syncStatus: "partial",
    });
    expect(JSON.stringify(body.data.issues)).not.toContain(
      "META_INSIGHT_ROW_UNMAPPED",
    );
    expect(body.data.technicalDetail.rawCodesAvailableAt).toBe(
      "/api/data-health/issues/:issueId",
    );
  });

  it("keeps raw sync codes only inside technicalDetail", async () => {
    const response = await getSyncRuns(
      new NextRequest(
        "https://tracker.example/api/sync-runs?status=partial" +
          "&from=2026-07-01&to=2026-07-30",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(body.data.syncRuns).toHaveLength(1);
    const run = body.data.syncRuns[0];
    expect(run).toMatchObject({
      syncRunId: "run_2",
      status: "partial",
      startedAt: "2026-07-31T01:00:00.000Z",
      finishedAt: "2026-07-31T01:05:00.000Z",
      evidence: {
        warningEntryCount: 1,
        reportedRowCount: 75,
        reportedRowCountBasis:
          "sync_run_aggregate_not_allocated_to_issue_codes",
      },
      technicalDetail: {
        summary: "Stage: insights",
        warnings: [
          {
            code: "META_INSIGHT_ROW_UNMAPPED",
            resource: "act_1/ads",
            message: "Raw warning message two",
          },
        ],
      },
    });
    expect(run).not.toHaveProperty("code");
    expect(run).not.toHaveProperty("warnings");
    expect(body.data).not.toHaveProperty("meta");
    expect(body.meta).toMatchObject({
      context: {
        businessIds: ["bm_1"],
        adAccountIds: ["act_1"],
        syncVersion: "sync_42",
      },
      dataThrough: "2026-07-30",
      lastSuccessfulSyncAt: "2026-07-31T01:05:00.000Z",
      syncStatus: "partial",
    });
  });
});
