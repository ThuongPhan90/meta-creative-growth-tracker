import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwnerDetailSnapshot: vi.fn(),
  detailErrorResponse: vi.fn(
    () => Response.json({ ok: false }, { status: 500 }),
  ),
}));

vi.mock("@/lib/detail-api", () => ({
  requireOwnerDetailSnapshot:
    mocks.requireOwnerDetailSnapshot,
  detailErrorResponse: mocks.detailErrorResponse,
}));

import { GET } from "./route";

const definitions = [
  {
    id: "result_purchase",
    canonicalKey: "purchase",
    label: "Purchase",
    shortLabel: "Purchase",
    objectiveKeys: ["sales"],
    rawActionTypes: ["purchase"],
    rawValueActionTypes: [],
    unit: "count",
    efficiencyMetric: "cost_per_result",
    direction: "lower_is_better",
    defaultForObjective: true,
    minimumResults: 5,
    minimumImpressions: 1_000,
    enabled: true,
  },
  {
    id: "result_purchase_value",
    canonicalKey: "purchase_value",
    label: "Purchase Value",
    shortLabel: "Value",
    objectiveKeys: ["sales"],
    rawActionTypes: [],
    rawValueActionTypes: ["purchase"],
    unit: "currency",
    efficiencyMetric: "roas",
    direction: "higher_is_better",
    defaultForObjective: false,
    minimumResults: 1,
    minimumImpressions: 1_000,
    enabled: true,
  },
] as const;

const mappings = [
  {
    canonicalResultKey: "purchase",
    rawActionType: "purchase",
    metricSource: "action",
    priority: 10,
    enabled: true,
  },
  {
    canonicalResultKey: "purchase_value",
    rawActionType: "purchase",
    metricSource: "action_value",
    priority: 10,
    enabled: true,
  },
] as const;

function campaign({
  accountId,
  campaignId,
}: {
  accountId: string;
  campaignId: string;
}) {
  return {
    campaignId: `internal_${campaignId}`,
    metaCampaignId: campaignId,
    name: `Campaign ${campaignId}`,
    objective: "OUTCOME_SALES",
    status: "ACTIVE",
    effectiveStatus: "ACTIVE",
    isActive: true,
    metaAdAccountId: accountId,
    adAccountName: `Account ${accountId}`,
    adSetCount: 2,
    adCount: 3,
    creativeAssetCount: 2,
    performance: [
      {
        currency: "USD",
        spend: 100,
        impressions: 10_000,
        installs: 999,
        registrations: 888,
        cpi: 0.1,
        costPerRegistration: 0.11,
      },
    ],
    lastSeenAt: "2026-07-30T10:00:00.000Z",
  };
}

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
      syncStatus: "healthy",
      syncVersion: "sync_42",
    },
    syncRuns: [{ id: "sync_42", status: "success" }],
    reportingScope: {
      available: {
        businesses: [],
        adAccounts: [
          {
            id: "act_a",
            currency: "USD",
          },
          {
            id: "act_b",
            currency: "USD",
          },
        ],
      },
      selected: {
        businessIds: [],
        adAccountIds: ["act_a", "act_b"],
      },
      unavailableSelected: {
        businessIds: [],
        adAccountIds: [],
      },
    },
  };
}

function repository() {
  return {
    listCampaignInventory: vi.fn(
      async ({
        accountMetaId,
      }: {
        accountMetaId: string;
      }) => ({
        items: [
          campaign({
            accountId: accountMetaId,
            campaignId:
              accountMetaId === "act_a"
                ? "campaign_a"
                : "campaign_b",
          }),
        ],
        total: 1,
        limit: 200,
        offset: 0,
      }),
    ),
    listResultDefinitions: vi
      .fn()
      .mockResolvedValue([...definitions]),
    listResultMappings: vi
      .fn()
      .mockResolvedValue([...mappings]),
    getCanonicalCampaignResultTotals: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/reporting/campaigns", () => {
  it("uses one exact-context Result batch without mixing account, currency or source", async () => {
    const repo = repository();
    repo.getCanonicalCampaignResultTotals.mockResolvedValue({
      available: true,
      syncVersion: "sync_42",
      resultMappingVersion: "result-map-v1:published",
      results: [
        {
          adAccountMetaId: "act_a",
          campaignMetaId: "campaign_a",
          canonicalResultKey: "purchase",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "USD",
          value: 4,
        },
        {
          adAccountMetaId: "act_a",
          campaignMetaId: "campaign_a",
          canonicalResultKey: "purchase",
          objectiveKey: "sales",
          metricSource: "action_value",
          currency: "USD",
          value: 400,
        },
        {
          adAccountMetaId: "act_b",
          campaignMetaId: "campaign_a",
          canonicalResultKey: "purchase",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "USD",
          value: 40,
        },
        {
          adAccountMetaId: "act_a",
          campaignMetaId: "campaign_a",
          canonicalResultKey: "purchase",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "VND",
          value: 4000,
        },
        {
          adAccountMetaId: "act_a",
          campaignMetaId: "campaign_a",
          canonicalResultKey: "purchase_value",
          objectiveKey: "sales",
          metricSource: "action_value",
          currency: "USD",
          value: 250,
        },
        {
          adAccountMetaId: "act_b",
          campaignMetaId: "campaign_b",
          canonicalResultKey: "purchase",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "USD",
          value: 2,
        },
      ],
    });
    mocks.requireOwnerDetailSnapshot.mockResolvedValue({
      repository: repo,
      connection: { connectionId: "connection_1" },
      snapshot: snapshot(),
    });
    const request = new NextRequest(
      "https://tracker.example/api/reporting/campaigns" +
        "?from=2026-07-01&to=2026-07-30" +
        "&account_ids=act_a,act_b" +
        "&objective=sales&result=purchase&currency=USD" +
        "&attribution=7d_click_1d_view" +
        "&action_report_time=conversion" +
        "&sync_version=sync_42",
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store",
    );
    expect(body.meta.context).toMatchObject({
      adAccountIds: ["act_a", "act_b"],
      dateFrom: "2026-07-01",
      dateTo: "2026-07-30",
      objectiveKey: "sales",
      primaryResultKey: "purchase",
      currency: "USD",
      currencyMode: "single",
      attributionSettingKey: "7d_click_1d_view",
      actionReportTime: "conversion",
      syncVersion: "sync_42",
    });
    expect(
      repo.getCanonicalCampaignResultTotals,
    ).toHaveBeenCalledTimes(1);
    expect(
      repo.getCanonicalCampaignResultTotals,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "connection_1",
        dateFrom: "2026-07-01",
        dateTo: "2026-07-30",
        adAccountIds: ["act_a", "act_b"],
        campaignMetaIds: expect.arrayContaining([
          "campaign_a",
          "campaign_b",
        ]),
        objectiveKeys: ["sales"],
        currency: "USD",
        attributionWindow: "7d_click_1d_view",
        actionReportTime: "conversion",
        syncVersion: "sync_42",
        resultMappingVersion: expect.stringMatching(
          /^result-map-v1:[a-f0-9]{64}$/,
        ),
      }),
    );
    expect(repo.listCampaignInventory).toHaveBeenCalledTimes(2);
    for (const [filters] of repo.listCampaignInventory.mock.calls) {
      expect(filters).toMatchObject({
        objectiveRawKeys: [
          "SALES",
          "OUTCOME_SALES",
          "CONVERSIONS",
          "PRODUCT_CATALOG_SALES",
        ],
      });
    }

    const campaignA = body.data.campaigns.find(
      (item: { campaignId: string }) =>
        item.campaignId === "campaign_a",
    );
    expect(campaignA.performanceByCurrency[0]).toMatchObject({
      currency: "USD",
      spend: 100,
      impressions: 10_000,
      primaryResult: {
        canonicalKey: "purchase",
        metricSource: "action",
        value: 4,
      },
    });
    expect(
      campaignA.performanceByCurrency[0].canonicalResults,
    ).toEqual([
      expect.objectContaining({
        canonicalKey: "purchase",
        metricSource: "action",
        value: 4,
      }),
      expect.objectContaining({
        canonicalKey: "purchase_value",
        metricSource: "action_value",
        value: 250,
      }),
    ]);
    expect(
      campaignA.performanceByCurrency[0],
    ).not.toHaveProperty("installs");
    expect(body.data.metricSemantics.results).toBe(
      "normalized_meta_attributed_result_facts",
    );
    expect(body.meta).toMatchObject({
      dataThrough: "2026-07-30",
      lastSuccessfulSyncAt: "2026-07-31T01:14:00.000Z",
      syncStatus: "completed",
      coverage: {
        adAccounts: { covered: 2, total: 2, ratio: 1 },
        campaignDelivery: { covered: 2, total: 2, ratio: 1 },
        normalizedResults: {
          covered: 2,
          total: 2,
          ratio: 1,
        },
      },
      warnings: [],
    });
  });

  it("returns explicit null Results and a warning when the exact snapshot is unavailable", async () => {
    const repo = repository();
    repo.getCanonicalCampaignResultTotals.mockResolvedValue({
      available: false,
      reason: "reporting_snapshot_stale",
      results: [],
    });
    mocks.requireOwnerDetailSnapshot.mockResolvedValue({
      repository: repo,
      connection: { connectionId: "connection_1" },
      snapshot: snapshot(),
    });
    const request = new NextRequest(
      "https://tracker.example/api/reporting/campaigns" +
        "?account_ids=act_a&objective=sales" +
        "&result=purchase&currency=USD",
    );

    const response = await GET(request);
    const body = await response.json();
    const performance =
      body.data.campaigns[0].performanceByCurrency[0];

    expect(response.status).toBe(200);
    expect(performance.primaryResult).toMatchObject({
      canonicalKey: "purchase",
      value: null,
    });
    expect(
      performance.canonicalResults.map(
        (result: { value: number | null }) => result.value,
      ),
    ).toEqual([null, null]);
    expect(performance).not.toHaveProperty("installs");
    expect(body.data.metricSemantics.results).toBe(
      "unavailable:reporting_snapshot_stale",
    );
    expect(body.data.resultSnapshot).toMatchObject({
      available: false,
      unavailableReason: "reporting_snapshot_stale",
    });
    expect(body.meta.coverage.normalizedResults).toMatchObject({
      covered: 0,
      total: 1,
      ratio: 0,
    });
    expect(body.meta.warnings).toEqual([
      expect.objectContaining({
        code: "NORMALIZED_RESULT_SNAPSHOT_UNAVAILABLE",
        source: "coverage",
        details: {
          reason: "reporting_snapshot_stale",
          syncVersion: "sync_42",
        },
      }),
    ]);
  });
});
