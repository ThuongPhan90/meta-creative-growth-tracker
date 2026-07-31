import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getApplicationSnapshot,
  getCanonicalResultsForReport,
  resolveApplicationReportContext,
} from "@/lib/app-data";
import {
  createTrackerRepository,
  type CampaignInventoryItem,
  type CampaignInventoryPage,
  type TrackerRepository,
} from "@/lib/db";

import CampaignsPage from "./page";

vi.mock("@/lib/app-data", () => ({
  getApplicationSnapshot: vi.fn(),
  getDeliveryForReport: vi.fn().mockResolvedValue([]),
  getCanonicalResultsForReport: vi.fn(),
  resolveApplicationReportContext: vi.fn(),
  buildApplicationResultMetrics: vi.fn(() => ({
    kpiCards: [],
    dynamicTableColumns: [],
  })),
}));

vi.mock("@/lib/db", () => ({
  createTrackerRepository: vi.fn(),
}));

vi.mock("@/lib/meta", () => ({
  isOperationalMetaAssetAccount: vi.fn(() => true),
}));

vi.mock("@/lib/presentation/freshness-presentation", () => ({
  formatFreshnessFields: vi.fn(() => "fresh"),
}));

vi.mock("@/lib/presentation/reporting-bar", () => ({
  buildReportingBarModel: vi.fn(() => ({
    businesses: [],
    scopeAccounts: [],
    selectedBusinessIds: [],
    selectedAccountIds: [],
    persistScope: false,
    objective: "all",
    objectives: [],
    results: [],
  })),
}));

vi.mock("server-only", () => ({}));

const definitions = [
  {
    id: "result_lead",
    canonicalKey: "lead",
    label: "Lead",
    shortLabel: "Lead",
    objectiveKeys: ["leads"],
    rawActionTypes: ["lead"],
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

const context = {
  businessIds: ["bm_1"],
  adAccountIds: ["act_a", "act_b"],
  dateFrom: "2026-07-01",
  dateTo: "2026-07-30",
  compareMode: "none",
  compare: "none",
  objectiveKey: "all",
  objective: "all",
  primaryResultKey: "lead",
  currency: "",
  currencyMode: "split",
  reportingTimezoneMode: "account_local",
  attributionSettingKey: "7d_click_1d_view",
  actionReportTime: "conversion",
  syncVersion: "sync_exact_42",
  account: "",
} as const;

const campaignA: CampaignInventoryItem = {
  campaignId: "db_campaign_a",
  metaCampaignId: "campaign_a",
  name: "Lead Campaign",
  objective: "OUTCOME_LEADS",
  status: "ACTIVE",
  effectiveStatus: "ACTIVE",
  isActive: true,
  metaAdAccountId: "act_a",
  adAccountName: "Account A",
  adSetCount: 1,
  adCount: 2,
  creativeAssetCount: 2,
  performance: [
    {
      currency: "VND",
      spend: 1_000_000,
      impressions: 10_000,
      installs: 999,
      registrations: 888,
      cpi: 1_001,
      costPerRegistration: 1_126,
    },
  ],
  lastSeenAt: "2026-07-30T10:00:00.000Z",
};

const campaignB: CampaignInventoryItem = {
  campaignId: "db_campaign_b",
  metaCampaignId: "campaign_b",
  name: "Sales Campaign",
  objective: "OUTCOME_SALES",
  status: "ACTIVE",
  effectiveStatus: "ACTIVE",
  isActive: true,
  metaAdAccountId: "act_b",
  adAccountName: "Account B",
  adSetCount: 1,
  adCount: 1,
  creativeAssetCount: 1,
  performance: [
    {
      currency: "USD",
      spend: 100,
      impressions: 5_000,
      installs: 777,
      registrations: 666,
      cpi: 0.13,
      costPerRegistration: 0.15,
    },
  ],
  lastSeenAt: "2026-07-30T09:00:00.000Z",
};

function inventory(item: CampaignInventoryItem): CampaignInventoryPage {
  return {
    items: [item],
    total: 1,
    limit: 200,
    offset: 0,
  };
}

function snapshot() {
  return {
    demoMode: false,
    authenticated: true,
    configuredForLive: true,
    connection: {
      connectionId: "connection_1",
      status: "connected",
    },
    assets: [
      {
        kind: "Ad Account",
        id: "act_a",
        name: "Account A",
        currency: "VND",
      },
      {
        kind: "Ad Account",
        id: "act_b",
        name: "Account B",
        currency: "USD",
      },
    ],
    reportingScope: null,
    freshness: {},
    settings: { timezone: "Asia/Ho_Chi_Minh" },
  };
}

type CampaignsPageElement = ReactElement<{
  data: CampaignInventoryPage;
}>;

function repositoryMock() {
  return {
    listCampaignInventory: vi.fn(
      async ({ accountMetaId }: { accountMetaId: string }) =>
        accountMetaId === "act_a"
          ? inventory(campaignA)
          : inventory(campaignB),
    ),
    listResultMappings: vi.fn().mockResolvedValue([
      {
        canonicalResultKey: "lead",
        rawActionType: "lead",
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
    ]),
    getCanonicalCampaignResultTotals: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getApplicationSnapshot).mockResolvedValue(
    snapshot() as never,
  );
  vi.mocked(resolveApplicationReportContext).mockReturnValue(
    context as never,
  );
  vi.mocked(getCanonicalResultsForReport).mockResolvedValue({
    definitions: [...definitions] as never,
    values: [],
    periodReach: null,
    periodReachUnavailableReason: "exact_snapshot_unavailable",
    state: "live",
    warning: null,
  });
});

describe("Campaign page canonical row results", () => {
  it("batches exact-context totals and keeps account, currency and source isolated", async () => {
    const repository = repositoryMock();
    repository.getCanonicalCampaignResultTotals.mockResolvedValue({
      available: true,
      syncVersion: context.syncVersion,
      resultMappingVersion: "result-map-v1:test",
      results: [
        {
          adAccountMetaId: "act_a",
          campaignMetaId: "campaign_a",
          canonicalResultKey: "lead",
          objectiveKey: "leads",
          metricSource: "action",
          currency: "VND",
          value: 7,
        },
        {
          adAccountMetaId: "act_a",
          campaignMetaId: "campaign_a",
          canonicalResultKey: "lead",
          objectiveKey: "leads",
          metricSource: "action_value",
          currency: "VND",
          value: 90,
        },
        {
          adAccountMetaId: "act_a",
          campaignMetaId: "campaign_a",
          canonicalResultKey: "lead",
          objectiveKey: "leads",
          metricSource: "action",
          currency: "USD",
          value: 80,
        },
        {
          adAccountMetaId: "act_b",
          campaignMetaId: "campaign_a",
          canonicalResultKey: "lead",
          objectiveKey: "leads",
          metricSource: "action",
          currency: "VND",
          value: 70,
        },
        {
          adAccountMetaId: "act_a",
          campaignMetaId: "campaign_a",
          canonicalResultKey: "lead",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "VND",
          value: 60,
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
        {
          adAccountMetaId: "act_b",
          campaignMetaId: "campaign_b",
          canonicalResultKey: "purchase_value",
          objectiveKey: "sales",
          metricSource: "action_value",
          currency: "USD",
          value: 45,
        },
        {
          adAccountMetaId: "act_b",
          campaignMetaId: "campaign_b",
          canonicalResultKey: "purchase_value",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "USD",
          value: 999,
        },
      ],
    });
    vi.mocked(createTrackerRepository).mockResolvedValue(
      repository as unknown as TrackerRepository,
    );

    const element = (await CampaignsPage({
      searchParams: Promise.resolve({}),
    })) as CampaignsPageElement;
    const byId = new Map(
      element.props.data.items.map((item) => [
        item.metaCampaignId,
        item,
      ]),
    );

    expect(
      byId.get("campaign_a")?.performance[0]?.resultValues,
    ).toEqual({ lead: 7 });
    expect(
      byId.get("campaign_b")?.performance[0]?.resultValues,
    ).toEqual({ purchase: 2, purchase_value: 45 });
    expect(
      repository.getCanonicalCampaignResultTotals,
    ).toHaveBeenCalledTimes(1);
    expect(
      repository.getCanonicalCampaignResultTotals,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "connection_1",
        dateFrom: context.dateFrom,
        dateTo: context.dateTo,
        adAccountIds: ["act_a", "act_b"],
        campaignMetaIds: expect.arrayContaining([
          "campaign_a",
          "campaign_b",
        ]),
        attributionWindow: context.attributionSettingKey,
        actionReportTime: context.actionReportTime,
        syncVersion: context.syncVersion,
        resultMappingVersion: expect.stringMatching(
          /^result-map-v1:[a-f0-9]{64}$/,
        ),
      }),
    );
    expect(
      repository.listCampaignInventory,
    ).toHaveBeenCalledTimes(2);
    expect(getCanonicalResultsForReport).toHaveBeenCalledWith({
      snapshot: expect.any(Object),
      context,
      repository,
    });
  });

  it("publishes explicit null canonical values when the live batch is unavailable", async () => {
    const repository = repositoryMock();
    repository.getCanonicalCampaignResultTotals.mockResolvedValue({
      available: false,
      reason: "reporting_snapshot_stale",
      results: [],
    });
    vi.mocked(createTrackerRepository).mockResolvedValue(
      repository as unknown as TrackerRepository,
    );

    const element = (await CampaignsPage({
      searchParams: Promise.resolve({}),
    })) as CampaignsPageElement;
    const leadCampaign = element.props.data.items.find(
      (item) => item.metaCampaignId === "campaign_a",
    );

    expect(leadCampaign?.performance[0]?.installs).toBe(999);
    expect(
      leadCampaign?.performance[0]?.resultValues,
    ).toEqual({ lead: null });
  });

  it("pins selected Objective and currency in the batch contract", async () => {
    const selectedContext = {
      ...context,
      adAccountIds: ["act_a"],
      objectiveKey: "leads",
      objective: "leads",
      currency: "VND",
      currencyMode: "single",
      account: "act_a",
    } as const;
    vi.mocked(resolveApplicationReportContext).mockReturnValue(
      selectedContext as never,
    );
    const repository = repositoryMock();
    repository.getCanonicalCampaignResultTotals.mockResolvedValue({
      available: true,
      syncVersion: context.syncVersion,
      resultMappingVersion: "result-map-v1:test",
      results: [],
    });
    vi.mocked(createTrackerRepository).mockResolvedValue(
      repository as unknown as TrackerRepository,
    );

    await CampaignsPage({
      searchParams: Promise.resolve({}),
    });

    expect(
      repository.getCanonicalCampaignResultTotals,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        adAccountIds: ["act_a"],
        campaignMetaIds: ["campaign_a"],
        objectiveKeys: ["leads"],
        currency: "VND",
        attributionWindow:
          selectedContext.attributionSettingKey,
        actionReportTime: selectedContext.actionReportTime,
        syncVersion: selectedContext.syncVersion,
      }),
    );
    expect(repository.listCampaignInventory).toHaveBeenCalledWith(
      expect.objectContaining({
        accountMetaId: "act_a",
        objectiveRawKeys: [
          "LEADS",
          "OUTCOME_LEADS",
          "LEAD_GENERATION",
        ],
      }),
    );
  });
});
