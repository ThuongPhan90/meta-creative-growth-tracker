import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { computeResultMappingVersion } from "@/lib/db/result-mapping-version";

const mocks = vi.hoisted(() => ({
  requireOwnerDetailSnapshot: vi.fn(),
  detailErrorResponse: vi.fn((error: unknown) => {
    const typed = error as {
      status?: number;
      code?: string;
      message?: string;
    };
    return Response.json(
      {
        ok: false,
        code: typed.code ?? "TEST_ERROR",
        error: typed.message ?? "test error",
      },
      { status: typed.status ?? 500 },
    );
  }),
}));

vi.mock("@/lib/detail-api", () => ({
  canonicalDetailId: (
    kind: string,
    value: string,
  ) =>
    kind === "campaign" && /^\d{1,32}$/.test(value.trim())
      ? value.trim()
      : null,
  DetailApiError: class DetailApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  requireOwnerDetailSnapshot:
    mocks.requireOwnerDetailSnapshot,
  detailErrorResponse: mocks.detailErrorResponse,
}));

import { GET } from "./route";

const campaignId = "238491239000001";

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

function campaign() {
  return {
    campaignId: "internal_campaign_1",
    metaCampaignId: campaignId,
    name: "Sales Campaign",
    objective: "OUTCOME_SALES",
    status: "ACTIVE",
    effectiveStatus: "ACTIVE",
    isActive: true,
    metaAdAccountId: "act_1",
    adAccountName: "Primary account",
    adSetCount: 1,
    adCount: 1,
    creativeAssetCount: 1,
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

function hierarchy() {
  return {
    campaignId: "internal_campaign_1",
    metaCampaignId: campaignId,
    adSets: [
      {
        adSetId: "internal_adset_1",
        metaAdSetId: "238491239000002",
        name: "Broad",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        ads: [
          {
            adId: "internal_ad_1",
            metaAdId: "238491239000003",
            name: "Ad 1",
            status: "ACTIVE",
            effectiveStatus: "ACTIVE",
            creativeFamilyIds: ["cf_aaaaaaaaaaaaaaaaaaaaaaaa"],
          },
        ],
      },
    ],
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
      syncVersion: "sync_saved",
    },
    syncRuns: [{ id: "sync_saved", status: "success" }],
    reportingScope: {
      available: {
        businesses: [{ id: "bm_1" }],
        adAccounts: [
          {
            id: "act_1",
            currency: "USD",
            businessIds: ["bm_1"],
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
  };
}

function repository() {
  return {
    listCampaignInventory: vi.fn().mockResolvedValue({
      items: [campaign()],
      total: 1,
      limit: 20,
      offset: 0,
    }),
    getCampaignHierarchy: vi
      .fn()
      .mockResolvedValue(hierarchy()),
    listResultDefinitions: vi
      .fn()
      .mockResolvedValue([...definitions]),
    listResultMappings: vi
      .fn()
      .mockResolvedValue([...mappings]),
    getCanonicalCampaignResultTotals: vi.fn(),
  };
}

function keyNames(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(keyNames);
  return Object.entries(value).flatMap(([key, child]) => [
    key,
    ...keyNames(child),
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/reporting/campaigns/[id]", () => {
  it("rejects a request without an owner-bound snapshot before querying campaign data", async () => {
    const error = Object.assign(new Error("Owner required"), {
      status: 401,
      code: "OWNER_SESSION_REQUIRED",
    });
    mocks.requireOwnerDetailSnapshot.mockRejectedValue(error);
    const request = new NextRequest(
      `https://tracker.example/api/reporting/campaigns/${campaignId}`,
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: campaignId }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "OWNER_SESSION_REQUIRED",
    });
    expect(
      mocks.requireOwnerDetailSnapshot,
    ).toHaveBeenCalledOnce();
  });

  it("uses the direct URL id and exact persisted context while treating only canonical Results as authoritative", async () => {
    const repo = repository();
    repo.getCanonicalCampaignResultTotals.mockResolvedValue({
      available: true,
      syncVersion: "sync_42",
      resultMappingVersion:
        computeResultMappingVersion(mappings),
      results: [
        {
          adAccountMetaId: "act_1",
          campaignMetaId: campaignId,
          canonicalResultKey: "purchase",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "USD",
          value: 4,
        },
        {
          adAccountMetaId: "act_1",
          campaignMetaId: campaignId,
          canonicalResultKey: "purchase_value",
          objectiveKey: "sales",
          metricSource: "action_value",
          currency: "USD",
          value: 250,
        },
        {
          adAccountMetaId: "act_1",
          campaignMetaId: campaignId,
          canonicalResultKey: "purchase",
          objectiveKey: "sales",
          metricSource: "action_value",
          currency: "USD",
          value: 900,
        },
        {
          adAccountMetaId: "act_other",
          campaignMetaId: campaignId,
          canonicalResultKey: "purchase",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "USD",
          value: 800,
        },
        {
          adAccountMetaId: "act_1",
          campaignMetaId: "238491239999999",
          canonicalResultKey: "purchase",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "USD",
          value: 700,
        },
        {
          adAccountMetaId: "act_1",
          campaignMetaId: campaignId,
          canonicalResultKey: "purchase",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "VND",
          value: 600,
        },
        {
          adAccountMetaId: "act_1",
          campaignMetaId: campaignId,
          canonicalResultKey: "purchase",
          objectiveKey: "leads",
          metricSource: "action",
          currency: "USD",
          value: 500,
        },
      ],
    });
    mocks.requireOwnerDetailSnapshot.mockResolvedValue({
      repository: repo,
      connection: { connectionId: "connection_1" },
      snapshot: snapshot(),
    });
    const request = new NextRequest(
      `https://tracker.example/api/reporting/campaigns/${campaignId}` +
        "?business_ids=bm_1&account_ids=act_1" +
        "&from=2026-07-01&to=2026-07-30" +
        "&compare=none&objective=sales&result=purchase" +
        "&currency=USD&attribution=7d_click_1d_view" +
        "&action_report_time=conversion" +
        "&sync_version=sync_42",
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: campaignId }),
    });
    const body = await response.json();
    const performance =
      body.data.campaign.performanceByCurrency[0];

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store",
    );
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("meta");
    expect(body).not.toHaveProperty("ok");
    expect(body.meta.context).toEqual({
      businessIds: ["bm_1"],
      adAccountIds: ["act_1"],
      dateFrom: "2026-07-01",
      dateTo: "2026-07-30",
      compareMode: "none",
      objectiveKey: "sales",
      primaryResultKey: "purchase",
      currency: "USD",
      currencyMode: "single",
      reportingTimezoneMode: "account_local",
      attributionSettingKey: "7d_click_1d_view",
      actionReportTime: "conversion",
      syncVersion: "sync_42",
    });
    expect(repo.listCampaignInventory).toHaveBeenCalledWith({
      connectionId: "connection_1",
      accountMetaId: "act_1",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-30",
      currency: "USD",
      attributionWindow: "7d_click_1d_view",
      actionReportTime: "conversion",
      syncVersion: "sync_42",
      includeInactiveAccounts: true,
      search: campaignId,
      limit: 20,
      offset: 0,
    });
    expect(repo.getCampaignHierarchy).toHaveBeenCalledWith(
      "connection_1",
      campaignId,
    );
    expect(
      repo.getCanonicalCampaignResultTotals,
    ).toHaveBeenCalledOnce();
    expect(
      repo.getCanonicalCampaignResultTotals,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "connection_1",
        dateFrom: "2026-07-01",
        dateTo: "2026-07-30",
        adAccountIds: ["act_1"],
        campaignMetaIds: [campaignId],
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

    expect(body.data.campaign).toMatchObject({
      campaignId,
      objective: { key: "sales", rawKey: "OUTCOME_SALES" },
      hierarchy: [
        {
          adSetId: "238491239000002",
          ads: [
            {
              adId: "238491239000003",
              creativeFamilyIds: [
                "cf_aaaaaaaaaaaaaaaaaaaaaaaa",
              ],
            },
          ],
        },
      ],
    });
    expect(performance).toMatchObject({
      currency: "USD",
      spend: 100,
      impressions: 10_000,
      result_values: {
        purchase: 4,
        purchase_value: 250,
      },
      primaryResult: {
        canonicalKey: "purchase",
        metricSource: "action",
        value: 4,
        available: true,
        unavailableReason: null,
      },
      evaluation: {
        available: false,
        reason: "campaign_evaluation_not_published",
        resultKey: "purchase",
        actualValue: null,
        benchmarkValue: null,
      },
    });
    const responseKeys = keyNames(body);
    for (const legacyKey of [
      "installs",
      "registrations",
      "cpi",
      "costPerRegistration",
      "cost_per_registration",
    ]) {
      expect(responseKeys).not.toContain(legacyKey);
    }
    expect(body.data.resultSnapshot).toMatchObject({
      available: true,
      syncVersion: "sync_42",
      resultMappingVersion:
        computeResultMappingVersion(mappings),
      unavailableReason: null,
    });
    expect(body.data.metricSemantics.results).toBe(
      "normalized_meta_attributed_result_facts",
    );
    expect(body.meta).toMatchObject({
      dataThrough: "2026-07-30",
      lastSuccessfulSyncAt: "2026-07-31T01:14:00.000Z",
      syncStatus: "completed",
      coverage: {
        adAccounts: { covered: 1, total: 1, ratio: 1 },
        campaignHierarchy: {
          covered: 1,
          total: 1,
          ratio: 1,
        },
        campaignDelivery: {
          covered: 1,
          total: 1,
          ratio: 1,
        },
        normalizedResults: {
          covered: 1,
          total: 1,
          ratio: 1,
        },
      },
      warnings: [],
    });
  });

  it("publishes null Result values and explicit unavailable evaluation without falling back to legacy metrics", async () => {
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
      `https://tracker.example/api/reporting/campaigns/${campaignId}` +
        "?account_ids=act_1&objective=sales" +
        "&result=purchase&currency=USD",
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: campaignId }),
    });
    const body = await response.json();
    const performance =
      body.data.campaign.performanceByCurrency[0];

    expect(response.status).toBe(200);
    expect(performance.result_values).toEqual({
      purchase: null,
      purchase_value: null,
    });
    expect(performance.primaryResult).toMatchObject({
      canonicalKey: "purchase",
      value: null,
      available: false,
      unavailableReason: "reporting_snapshot_stale",
    });
    expect(performance.evaluation).toMatchObject({
      available: false,
      reason: "reporting_snapshot_stale",
    });
    const responseKeys = keyNames(body);
    for (const legacyKey of [
      "installs",
      "registrations",
      "cpi",
      "costPerRegistration",
    ]) {
      expect(responseKeys).not.toContain(legacyKey);
    }
    expect(body.data.resultSnapshot).toMatchObject({
      available: false,
      syncVersion: "sync_saved",
      unavailableReason: "reporting_snapshot_stale",
    });
    expect(body.data.metricSemantics.results).toBe(
      "unavailable:reporting_snapshot_stale",
    );
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
          syncVersion: "sync_saved",
        },
      }),
    ]);
  });

  it("marks a selected Result unavailable when its definition is missing instead of exposing Install or CPI", async () => {
    const repo = repository();
    const remainingDefinitions = [definitions[1]];
    const remainingMappings = [mappings[1]];
    repo.listResultDefinitions.mockResolvedValue([
      ...remainingDefinitions,
    ]);
    repo.listResultMappings.mockResolvedValue([
      ...remainingMappings,
    ]);
    repo.getCanonicalCampaignResultTotals.mockResolvedValue({
      available: true,
      syncVersion: "sync_saved",
      resultMappingVersion:
        computeResultMappingVersion(remainingMappings),
      results: [
        {
          adAccountMetaId: "act_1",
          campaignMetaId: campaignId,
          canonicalResultKey: "purchase_value",
          objectiveKey: "sales",
          metricSource: "action_value",
          currency: "USD",
          value: 250,
        },
      ],
    });
    mocks.requireOwnerDetailSnapshot.mockResolvedValue({
      repository: repo,
      connection: { connectionId: "connection_1" },
      snapshot: snapshot(),
    });
    const request = new NextRequest(
      `https://tracker.example/api/reporting/campaigns/${campaignId}` +
        "?account_ids=act_1&objective=sales" +
        "&result=purchase&currency=USD" +
        "&sync_version=sync_saved",
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: campaignId }),
    });
    const body = await response.json();
    const performance =
      body.data.campaign.performanceByCurrency[0];

    expect(response.status).toBe(200);
    expect(performance).toMatchObject({
      result_values: { purchase_value: 250 },
      primaryResult: {
        canonicalKey: "purchase",
        label: null,
        metricSource: null,
        value: null,
        available: false,
        unavailableReason: "result_definition_unavailable",
      },
      evaluation: {
        available: false,
        reason: "result_definition_unavailable",
      },
    });
    for (const legacyKey of [
      "installs",
      "registrations",
      "cpi",
      "costPerRegistration",
    ]) {
      expect(keyNames(body)).not.toContain(legacyKey);
    }
  });

  it("rejects an available canonical batch when it does not match the pinned sync version", async () => {
    const repo = repository();
    repo.getCanonicalCampaignResultTotals.mockResolvedValue({
      available: true,
      syncVersion: "sync_other",
      resultMappingVersion:
        computeResultMappingVersion(mappings),
      results: [
        {
          adAccountMetaId: "act_1",
          campaignMetaId: campaignId,
          canonicalResultKey: "purchase",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "USD",
          value: 400,
        },
      ],
    });
    mocks.requireOwnerDetailSnapshot.mockResolvedValue({
      repository: repo,
      connection: { connectionId: "connection_1" },
      snapshot: snapshot(),
    });
    const request = new NextRequest(
      `https://tracker.example/api/reporting/campaigns/${campaignId}` +
        "?account_ids=act_1&objective=sales" +
        "&result=purchase&currency=USD" +
        "&sync_version=sync_saved",
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: campaignId }),
    });
    const body = await response.json();

    expect(
      body.data.campaign.performanceByCurrency[0],
    ).toMatchObject({
      result_values: {
        purchase: null,
        purchase_value: null,
      },
      primaryResult: {
        available: false,
        unavailableReason: "reporting_snapshot_stale",
      },
      evaluation: {
        available: false,
        reason: "reporting_snapshot_stale",
      },
    });
    expect(body.data.resultSnapshot).toMatchObject({
      available: false,
      syncVersion: "sync_saved",
      unavailableReason: "reporting_snapshot_stale",
    });
    expect(
      body.meta.warnings.map(
        (warning: { code: string }) => warning.code,
      ),
    ).toEqual([
      "NORMALIZED_RESULT_SNAPSHOT_UNAVAILABLE",
      "CANONICAL_RESULT_SNAPSHOT_MISMATCH",
    ]);
  });

  it("does not query canonical Results when the direct URL id is outside the persisted account scope", async () => {
    const repo = repository();
    repo.listCampaignInventory.mockResolvedValue({
      items: [
        {
          ...campaign(),
          metaAdAccountId: "act_other",
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
    mocks.requireOwnerDetailSnapshot.mockResolvedValue({
      repository: repo,
      connection: { connectionId: "connection_1" },
      snapshot: snapshot(),
    });
    const request = new NextRequest(
      `https://tracker.example/api/reporting/campaigns/${campaignId}`,
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: campaignId }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      ok: false,
      code: "CAMPAIGN_NOT_FOUND",
    });
    expect(repo.listCampaignInventory).toHaveBeenCalledWith(
      expect.objectContaining({
        accountMetaId: "act_1",
        search: campaignId,
      }),
    );
    expect(
      repo.getCanonicalCampaignResultTotals,
    ).not.toHaveBeenCalled();
  });
});
