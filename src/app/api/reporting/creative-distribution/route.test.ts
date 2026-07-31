import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CreativePerformanceSummary,
  CreativeRow,
} from "@/types/view-models";

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
    compareDefault: "none",
  },
  freshness: {
    dataThroughAt: "2026-07-30T23:59:59.999Z",
    lastSyncedAt: "2026-07-31T01:14:00.000Z",
    syncVersion: "run_9",
    syncStatus: "partial",
  },
  syncRuns: [{ id: "run_9", status: "partial" }],
};

const performance = {
  currency: "USD",
  spend: 100,
  impressions: 5_000,
  dailyReachSum: 4_000,
  linkCtr: 2,
  installs: 100,
  registrations: 50,
  cpi: 1,
  costPerRegistration: 2,
  resultValues: {},
  hookRate: null,
  holdRate: null,
  osBaselineCpi: null,
  rating: null,
  dateFrom: "2026-07-01",
  dateTo: "2026-07-30",
  confidence: {
    dataStatus: "ready",
    confidence: "high",
    coverageRatio: 1,
    minimumThresholdMet: true,
    reasonCodes: [],
  },
} satisfies CreativePerformanceSummary;

function row({
  id,
  familyId,
  platform,
  familyPerformance,
}: {
  id: string;
  familyId: string;
  platform: CreativeRow["platform"];
  familyPerformance: CreativePerformanceSummary;
}): CreativeRow {
  return {
    id,
    creativeFamilyId: familyId,
    name: familyId,
    assetKey: `asset:${familyId}`,
    aliases: [familyId],
    format: "Video",
    platform,
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
    performance: familyPerformance,
  };
}

describe("GET /api/reporting/creative-distribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnerDetailSnapshot.mockResolvedValue({ snapshot });
    mocks.getCreativeRowsForReport.mockResolvedValue({
      creatives: [
        row({
          id: "winner-android",
          familyId: "cf_aaaaaaaaaaaaaaaaaaaaaaaa",
          platform: "Android",
          familyPerformance: {
            ...performance,
            resultValues: { lead: 10 },
            evaluation: {
              resultKey: "lead",
              metricKey: "cost_per_result",
              actualValue: 10,
              benchmarkValue: 12,
              deltaPercent: -16.67,
              peerGroupLabel: "Peer",
              sampleSize: 5,
              eligibility: "eligible",
              dataConfidence: "high",
              performanceStatus: "above_benchmark",
              fatigueStatus: "monitor",
              recommendationKey: "scale_controlled",
              reasons: ["Above benchmark."],
            },
          },
        }),
        row({
          id: "winner-ios",
          familyId: "cf_aaaaaaaaaaaaaaaaaaaaaaaa",
          platform: "iOS",
          familyPerformance: {
            ...performance,
            resultValues: {},
            evaluation: null,
          },
        }),
        row({
          id: "pending",
          familyId: "cf_bbbbbbbbbbbbbbbbbbbbbbbb",
          platform: "Android",
          familyPerformance: {
            ...performance,
            resultValues: {},
            confidence: {
              ...performance.confidence,
              confidence: "low",
            },
            evaluation: null,
          },
        }),
      ],
      truncated: true,
      delivery: [],
    });
  });

  it("uses stable evaluation keys and never counts OS variants as families", async () => {
    const response = await GET(
      new NextRequest(
        "https://tracker.example/api/reporting/creative-distribution" +
          "?from=2026-07-01&to=2026-07-30" +
          "&objective=leads&result=lead&currency=USD",
      ),
    );
    const body = await response.json();
    const count = (
      items: readonly { key: string; count: number }[],
      key: string,
    ) => items.find((item) => item.key === key)?.count;

    expect(body.data.total_creative_families).toBe(2);
    expect(
      count(body.data.performance_status, "above_benchmark"),
    ).toBe(1);
    expect(
      count(body.data.performance_status, "not_eligible"),
    ).toBe(1);
    expect(
      count(body.data.performance_status, "needs_review"),
    ).toBe(0);
    expect(count(body.data.data_confidence, "high")).toBe(1);
    expect(count(body.data.data_confidence, "low")).toBe(1);
    expect(count(body.data.fatigue_status, "monitor")).toBe(1);
    expect(
      count(body.data.fatigue_status, "insufficient"),
    ).toBe(1);
    expect(body.data.result_truncated).toBe(true);
    expect(body.meta.syncStatus).toBe("partial");
    expect(body.meta.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "CREATIVE_COLLECTION_TRUNCATED",
        }),
        expect.objectContaining({
          code: "CREATIVE_RESULT_MAPPING_GAP",
        }),
      ]),
    );
  });
});
