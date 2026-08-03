import { beforeEach, describe, expect, it, vi } from "vitest";

const serverMocks = vi.hoisted(() => ({
  getRuntimeConfiguration: vi.fn(),
  readDatabaseHealth: vi.fn(),
  readPageOwnerSession: vi.fn(),
}));
const databaseMocks = vi.hoisted(() => ({
  createTrackerRepository: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server", () => serverMocks);
vi.mock("@/lib/db", () => ({
  createTrackerRepository: databaseMocks.createTrackerRepository,
}));

import {
  getCreativeFamilyRowsForReport,
  buildApplicationResultMetrics,
  getApplicationAssetsSnapshot,
  getApplicationContextSnapshot,
  getApplicationOperationalSnapshot,
  getApplicationResultRegistry,
  getApplicationSnapshot,
  getCanonicalResultsForReport,
  getCreativeRowsForReport,
  getDataHealthCreativeReferenceSnapshot,
  getLiveDeliveryForReport,
  getOverviewTrendForReport,
  resolveApplicationReportContext,
  type ApplicationSnapshot,
} from "@/lib/app-data";
import type {
  CanonicalCreativeFamilyResultTotals,
  CanonicalObjectiveSpendTotal,
  CanonicalResultTotals,
  CanonicalResultTotal,
  CreativeLibraryItem,
  CreativePerformanceItem,
  LiveDeliverySummary,
  MetaConnectionRecord,
  PeriodReachResult,
  TrackerRepository,
} from "@/lib/db";
import { createCreativeFamilyIdentity } from "@/lib/data-contract";
import { computeResultMappingVersion } from "@/lib/db/result-mapping-version";
import {
  demoAssets,
  demoCreatives,
  demoDashboard,
  demoFreshness,
  demoSyncRuns,
} from "@/lib/demo-data";
import {
  DEFAULT_RESULT_DEFINITIONS,
  hydrateResultDefinitions,
  type PersistedResultMapping,
  type ResultDefinition,
} from "@/lib/reporting";

const runtimeSalesValueDefinition: ResultDefinition = {
  id: "result_runtime_sales_value",
  canonicalKey: "runtime_sales_value",
  label: "Runtime Sales Value",
  shortLabel: "Sales Value",
  objectiveKeys: ["sales"],
  rawActionTypes: [],
  rawValueActionTypes: ["purchase"],
  unit: "currency",
  efficiencyMetric: "roas",
  direction: "higher_is_better",
  defaultForObjective: true,
  minimumResults: 1,
  minimumImpressions: 0,
  enabled: true,
};

const runtimeSalesValueActionMapping: PersistedResultMapping = {
  id: "mapping-runtime-sales-value-action",
  canonicalResultKey: "runtime_sales_value",
  rawActionType: "purchase",
  metricSource: "action",
  priority: 0,
  mappingSource: "owner",
  enabled: true,
};

const runtimeSalesValueActionValueMapping: PersistedResultMapping = {
  ...runtimeSalesValueActionMapping,
  id: "mapping-runtime-sales-value-action-value",
  metricSource: "action_value",
  mappingSource: "system",
};

const liveConnection: MetaConnectionRecord = {
  connectionId: "connection-1",
  ownerId: 1,
  metaUserId: "meta-user-1",
  metaUserName: "Owner",
  grantedScopes: ["ads_read"],
  declinedScopes: [],
  tokenExpiresAt: "2099-01-01T00:00:00.000Z",
  dataAccessExpiresAt: "2099-01-01T00:00:00.000Z",
  status: "connected",
  lastValidatedAt: "2026-07-31T00:00:00.000Z",
  lastErrorCode: null,
  lastErrorMessage: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z",
};

function applicationSnapshot(
  resultDefinitions: ResultDefinition[],
): ApplicationSnapshot {
  return {
    demoMode: true,
    authenticated: true,
    configuredForLive: true,
    connection: null,
    dashboard: demoDashboard,
    assets: demoAssets,
    creatives: demoCreatives,
    creativesTruncated: false,
    syncRuns: demoSyncRuns,
    setupChecks: [],
    freshness: demoFreshness,
    reportingScope: null,
    resultDefinitions,
    settings: {
      timezone: "Asia/Ho_Chi_Minh",
      lookbackDays: 30,
      currency: "VND",
      compareDefault: "previous_period",
      minimumInstallThreshold: 20,
      installActionTypes: ["mobile_app_install"],
      registrationActionTypes: ["complete_registration"],
      metricDisplayPresets: { version: 1, presets: {} },
      updatedAt: null,
    },
  };
}

function runtimeConfiguration(demoMode: boolean) {
  return {
    demoMode,
    databaseConfigured: true,
    metaConfigured: true,
    securityConfigured: true,
    cronConfigured: true,
    legalConfigured: true,
  };
}

function connectedApplicationSnapshot(
  resultDefinitions: ResultDefinition[],
): ApplicationSnapshot {
  return {
    ...applicationSnapshot(resultDefinitions),
    demoMode: false,
    authenticated: true,
    connection: liveConnection,
    freshness: {
      ...demoFreshness,
      syncVersion: "run-1",
    },
  };
}

function liveSnapshotRepository(
  resultDefinitions: ResultDefinition[],
  resultMappings: PersistedResultMapping[] = [],
): TrackerRepository {
  return {
    getConnection: vi.fn().mockResolvedValue(liveConnection),
    getSettings: vi.fn().mockResolvedValue({
      ownerId: 1,
      reportingTimezone: "Asia/Ho_Chi_Minh",
      reportingCurrency: "VND",
      syncLookbackDays: 30,
      minimumInstallThreshold: 20,
      minimumRegistrationThreshold: 10,
      benchmarkMode: "account_os_event",
      benchmarkWindowDays: 30,
      benchmarkByOs: true,
      benchmarkByFormat: true,
      numberFormat: "vi-VN",
      compareDefault: "previous_period",
      scoringWeights: { cpi: 1, cpa: 1, hook: 1, hold: 1 },
      syncCadence: "manual",
      alertChannel: "none",
      installActionTypes: ["mobile_app_install"],
      registrationActionTypes: ["complete_registration"],
      lastInitialSyncAt: "2026-07-31T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z",
    }),
    getCoverage: vi.fn().mockResolvedValue(null),
    listMetaAssets: vi.fn().mockResolvedValue({
      businesses: [],
      adAccounts: [],
      pages: [],
      apps: [],
    }),
    listCreativeLibrary: vi.fn().mockResolvedValue([]),
    listCreativePerformance: vi.fn().mockResolvedValue([]),
    getDeliveryPerformance: vi.fn().mockResolvedValue([]),
    listRecentSyncRuns: vi.fn().mockResolvedValue([]),
    getInsightsFreshness: vi.fn().mockResolvedValue({
      lastSyncedAt: "2026-07-31T00:00:00.000Z",
      dataThroughAt: "2026-07-30T00:00:00.000Z",
      syncVersion: "run-1",
      syncStatus: "healthy",
      syncMode: "manual",
    }),
    listReportingScopeInventory: vi.fn().mockResolvedValue({
      businesses: [],
      adAccounts: [],
    }),
    getReportingScope: vi.fn().mockResolvedValue({
      businessIds: [],
      adAccountIds: [],
      confirmedAt: null,
    }),
    listResultDefinitions: vi.fn().mockResolvedValue(resultDefinitions),
    listResultMappings: vi.fn().mockResolvedValue(resultMappings),
  } as unknown as TrackerRepository;
}

function canonicalReportRepository({
  definitions,
  results = [],
  spendByObjective = [],
  canonicalTotals,
  mappings = [],
  periodReach = {
    available: true,
    scopeLevel: "account",
    adAccountId: "act_1",
    campaignId: null,
    reach: 8_000,
    dateFrom: "2026-07-01",
    dateTo: "2026-07-31",
    attributionWindow: "account_default",
    actionReportTime: "mixed",
    syncVersion: "run-1",
  },
}: {
  definitions: ResultDefinition[];
  results?: CanonicalResultTotal[];
  spendByObjective?: CanonicalObjectiveSpendTotal[];
  canonicalTotals?: CanonicalResultTotals;
  mappings?: PersistedResultMapping[];
  periodReach?: PeriodReachResult;
}) {
  const getPeriodReach = vi.fn().mockResolvedValue(periodReach);
  const getCanonicalResultTotals = vi.fn().mockResolvedValue(
    canonicalTotals ?? {
      available: true,
      syncVersion: "run-1",
      resultMappingVersion: computeResultMappingVersion(mappings),
      results,
      spendByObjective,
    },
  );

  return {
    repository: {
      listResultDefinitions: vi.fn().mockResolvedValue(definitions),
      listResultMappings: vi.fn().mockResolvedValue(mappings),
      getCanonicalResultTotals,
      getPeriodReach,
    } as unknown as TrackerRepository,
    getCanonicalResultTotals,
    getPeriodReach,
  };
}

const liveLeadDefinition = DEFAULT_RESULT_DEFINITIONS.find(
  (definition) => definition.canonicalKey === "lead",
)!;

const liveLeadMappings: PersistedResultMapping[] = [
  {
    id: "mapping-lead",
    canonicalResultKey: "lead",
    rawActionType: "lead",
    metricSource: "action",
    priority: 0,
    mappingSource: "system",
    enabled: true,
  },
];

function fatigueLibraryItem(): CreativeLibraryItem {
  return {
    creativeAssetId: "asset_target",
    creativeFamilyId: "cf_target",
    assetKey: "image:target",
    assetType: "image",
    metaVideoId: null,
    metaImageHash: "hash_target",
    name: "Target",
    thumbnailUrl: null,
    previewUrl: null,
    width: 1080,
    height: 1080,
    durationSeconds: null,
    creativeCodes: ["TARGET"],
    pageNames: ["Page"],
    creativeContainerCount: 1,
    adCount: 1,
    currentAdCount: 1,
    activeAdCount: 1,
    adAccountCount: 1,
    pageCount: 1,
    metaCreativeIds: ["creative_target"],
    adIds: ["ad_target"],
    campaignIds: ["campaign_1"],
    adAccountIds: ["act_1"],
    pageIds: ["page_1"],
    lastUsedAt: "2026-07-07T00:00:00.000Z",
    lastSeenAt: "2026-07-07T00:00:00.000Z",
  };
}

function fatiguePerformance({
  familyId,
  spend,
  impressions,
  linkClicks,
  metricDays,
}: {
  familyId: string;
  spend: number;
  impressions: number;
  linkClicks: number;
  metricDays: number;
}): CreativePerformanceItem {
  return {
    creativeAssetId:
      familyId === "cf_target" ? "asset_target" : `asset_${familyId}`,
    creativeFamilyId: familyId,
    assetKey: `image:${familyId}`,
    assetType: "image",
    name: familyId,
    thumbnailUrl: null,
    operatingSystem: "ANDROID",
    currency: "VND",
    spend,
    impressions,
    dailyReachSum: 0,
    linkClicks,
    installs: 30,
    registrations: 0,
    video3sViews: 0,
    video100Views: 0,
    linkCtr:
      impressions > 0 ? (linkClicks / impressions) * 100 : null,
    cpi: spend / 30,
    costPerRegistration: null,
    hookRate: null,
    holdRate: null,
    metricDays,
  };
}

function fatigueResultTotals(
  values: readonly { familyId: string; value: number }[],
): CanonicalCreativeFamilyResultTotals {
  return {
    available: true,
    syncVersion: "run-1",
    resultMappingVersion:
      computeResultMappingVersion(liveLeadMappings),
    results: values.map(({ familyId, value }) => ({
      adAccountMetaId: "act_1",
      creativeFamilyId: familyId,
      allocationMethod: "single_asset",
      canonicalResultKey: "lead",
      objectiveKey: "leads",
      metricSource: "action",
      currency: "VND",
      value,
    })),
  };
}

function liveFatigueRepository({
  dateFrom,
  dateTo,
}: {
  dateFrom: string;
  dateTo: string;
}) {
  const peers = ["cf_peer_1", "cf_peer_2", "cf_peer_3"];
  const fullPerformance = fatiguePerformance({
    familyId: "cf_target",
    spend: 1_560,
    impressions: 35_000,
    linkClicks: 580,
    metricDays: 7,
  });
  const earlierPerformance = fatiguePerformance({
    familyId: "cf_target",
    spend: 600,
    impressions: 15_000,
    linkClicks: 300,
    metricDays: 3,
  });
  const laterPerformance = fatiguePerformance({
    familyId: "cf_target",
    spend: 960,
    impressions: 20_000,
    linkClicks: 280,
    metricDays: 4,
  });
  const listCreativePerformance = vi.fn(
    async (
      filters: Parameters<
        TrackerRepository["listCreativePerformance"]
      >[0],
    ) => {
      if (!filters.campaignMetaId) {
        return peers.map((familyId) =>
          fatiguePerformance({
            familyId,
            spend: 200,
            impressions: 5_000,
            linkClicks: 100,
            metricDays: 30,
          }),
        );
      }
      if (
        filters.dateFrom === dateFrom &&
        filters.dateTo === dateTo
      ) {
        return [fullPerformance];
      }
      return filters.dateFrom === dateFrom
        ? [earlierPerformance]
        : [laterPerformance];
    },
  );
  const getCanonicalCreativeFamilyResultTotals = vi.fn(
    async (
      filters: Parameters<
        TrackerRepository["getCanonicalCreativeFamilyResultTotals"]
      >[0],
    ) => {
      if (!filters.campaignMetaIds) {
        return fatigueResultTotals(
          peers.map((familyId) => ({ familyId, value: 10 })),
        );
      }
      if (
        filters.dateFrom === dateFrom &&
        filters.dateTo === dateTo
      ) {
        return fatigueResultTotals([
          { familyId: "cf_target", value: 18 },
        ]);
      }
      return fatigueResultTotals([
        {
          familyId: "cf_target",
          value: filters.dateFrom === dateFrom ? 30 : 32,
        },
      ]);
    },
  );
  const repository = {
    ...liveSnapshotRepository([liveLeadDefinition]),
    listCreativeLibrary: vi
      .fn()
      .mockResolvedValue([fatigueLibraryItem()]),
    listCreativePerformance,
    getDeliveryPerformance: vi.fn().mockResolvedValue([
      {
        operatingSystem: "ANDROID",
        currency: "VND",
        spend: 1_560,
        impressions: 35_000,
        linkClicks: 580,
        installs: 30,
        registrations: 0,
        video3sViews: 0,
        video100Views: 0,
        metricDays: 7,
      },
    ]),
    listResultDefinitions: vi
      .fn()
      .mockResolvedValue([liveLeadDefinition]),
    listResultMappings: vi.fn().mockResolvedValue(liveLeadMappings),
    getCanonicalCreativeFamilyResultTotals,
  } as unknown as TrackerRepository;

  return {
    repository,
    getCanonicalCreativeFamilyResultTotals,
    listCreativePerformance,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  databaseMocks.createTrackerRepository.mockReset();
  serverMocks.readPageOwnerSession.mockResolvedValue(null);
  serverMocks.readDatabaseHealth.mockResolvedValue(null);
});

describe("application snapshot Result registry", () => {
  it("uses the combined production Result registry without duplicate list reads", async () => {
    serverMocks.getRuntimeConfiguration.mockReturnValue(
      runtimeConfiguration(false),
    );
    serverMocks.readPageOwnerSession.mockResolvedValue({
      sub: liveConnection.connectionId,
    });
    serverMocks.readDatabaseHealth.mockResolvedValue({ ok: true });
    const repository = liveSnapshotRepository([liveLeadDefinition]);
    const getResultRegistry = vi.fn().mockResolvedValue({
      definitions: [liveLeadDefinition],
      mappings: liveLeadMappings,
    });
    Object.assign(repository, { getResultRegistry });
    databaseMocks.createTrackerRepository.mockResolvedValue(repository);

    const snapshot = await getApplicationContextSnapshot();

    expect(snapshot.resultDefinitions).toEqual([
      expect.objectContaining({
        canonicalKey: liveLeadDefinition.canonicalKey,
      }),
    ]);
    expect(getResultRegistry).toHaveBeenCalledOnce();
    expect(repository.listResultDefinitions).not.toHaveBeenCalled();
    expect(repository.listResultMappings).not.toHaveBeenCalled();
  });

  it("keeps report context lightweight", async () => {
    serverMocks.getRuntimeConfiguration.mockReturnValue(
      runtimeConfiguration(false),
    );
    serverMocks.readPageOwnerSession.mockResolvedValue({
      sub: liveConnection.connectionId,
    });
    serverMocks.readDatabaseHealth.mockResolvedValue({ ok: true });
    const repository = liveSnapshotRepository([liveLeadDefinition]);
    vi.mocked(repository.listReportingScopeInventory).mockResolvedValue({
      businesses: [
        {
          id: "business_1",
          name: "Business One",
          isActive: true,
          adAccountIds: ["act_1"],
        },
      ],
      adAccounts: [
        {
          id: "act_1",
          name: "Account One",
          isActive: true,
          accountStatus: 1,
          currency: "VND",
          timezone: "Asia/Ho_Chi_Minh",
          businessIds: ["business_1"],
        },
      ],
    });
    databaseMocks.createTrackerRepository.mockResolvedValue(repository);

    const contextSnapshot = await getApplicationContextSnapshot();

    expect(contextSnapshot.creatives).toEqual([]);
    expect(contextSnapshot.creativesTruncated).toBe(false);
    expect(repository.listCreativeLibrary).not.toHaveBeenCalled();
    expect(repository.listCreativePerformance).not.toHaveBeenCalled();
    expect(repository.getCoverage).not.toHaveBeenCalled();
    expect(repository.listMetaAssets).not.toHaveBeenCalled();
    expect(repository.getDeliveryPerformance).not.toHaveBeenCalled();
    expect(repository.listRecentSyncRuns).not.toHaveBeenCalled();
    expect(contextSnapshot.assets).toEqual([
      expect.objectContaining({
        id: "business_1",
        kind: "Business",
        status: "ACTIVE",
      }),
      expect.objectContaining({
        id: "act_1",
        kind: "Ad Account",
        parentName: "Business One",
        status: "ACTIVE",
        currency: "VND",
        timezone: "Asia/Ho_Chi_Minh",
      }),
    ]);
  });

  it("pipelines owner-scoped context reads after connection identity resolves", async () => {
    serverMocks.getRuntimeConfiguration.mockReturnValue(
      runtimeConfiguration(false),
    );
    serverMocks.readPageOwnerSession.mockResolvedValue({
      sub: liveConnection.connectionId,
    });
    const repository = liveSnapshotRepository([liveLeadDefinition]);
    const storedSettings = await repository.getSettings();
    vi.mocked(repository.getSettings).mockClear();
    let resolveHealth!: (value: { ok: boolean }) => void;
    let resolveConnection!: (value: MetaConnectionRecord) => void;
    let resolveSettings!: (value: typeof storedSettings) => void;
    serverMocks.readDatabaseHealth.mockReturnValue(
      new Promise((resolve) => {
        resolveHealth = resolve;
      }),
    );
    vi.mocked(repository.getConnection).mockReturnValue(
      new Promise((resolve) => {
        resolveConnection = resolve;
      }),
    );
    vi.mocked(repository.getSettings).mockReturnValue(
      new Promise((resolve) => {
        resolveSettings = resolve;
      }),
    );
    databaseMocks.createTrackerRepository.mockResolvedValue(repository);

    const loading = getApplicationContextSnapshot();
    await vi.waitFor(() => {
      expect(serverMocks.readDatabaseHealth).toHaveBeenCalledOnce();
      expect(repository.getConnection).toHaveBeenCalledOnce();
      expect(repository.getSettings).toHaveBeenCalledOnce();
    });

    resolveConnection(liveConnection);
    await vi.waitFor(() => {
      expect(repository.getInsightsFreshness).toHaveBeenCalledOnce();
      expect(repository.listReportingScopeInventory).toHaveBeenCalledOnce();
      expect(repository.getReportingScope).toHaveBeenCalledOnce();
      expect(repository.listResultDefinitions).toHaveBeenCalledOnce();
      expect(repository.listResultMappings).toHaveBeenCalledOnce();
    });

    resolveHealth({ ok: true });
    resolveSettings(storedSettings);
    await expect(loading).resolves.toMatchObject({
      authenticated: true,
      connection: liveConnection,
    });
  });

  it("keeps the database-unavailable snapshot when parallel owner reads fail", async () => {
    serverMocks.getRuntimeConfiguration.mockReturnValue(
      runtimeConfiguration(false),
    );
    serverMocks.readPageOwnerSession.mockResolvedValue({
      sub: liveConnection.connectionId,
    });
    serverMocks.readDatabaseHealth.mockResolvedValue(null);
    const repository = liveSnapshotRepository([liveLeadDefinition]);
    vi.mocked(repository.getConnection).mockRejectedValue(
      new Error("database unavailable"),
    );
    vi.mocked(repository.getSettings).mockRejectedValue(
      new Error("database unavailable"),
    );
    databaseMocks.createTrackerRepository.mockResolvedValue(repository);

    await expect(getApplicationContextSnapshot()).resolves.toMatchObject({
      authenticated: true,
      connection: null,
      assets: [],
    });
  });

  it("keeps the setup-safe fallback when a pipelined context read also fails", async () => {
    serverMocks.getRuntimeConfiguration.mockReturnValue(
      runtimeConfiguration(false),
    );
    serverMocks.readPageOwnerSession.mockResolvedValue({
      sub: liveConnection.connectionId,
    });
    serverMocks.readDatabaseHealth.mockResolvedValue(null);
    const repository = liveSnapshotRepository([liveLeadDefinition]);
    vi.mocked(repository.getInsightsFreshness).mockRejectedValue(
      new Error("context wave unavailable"),
    );
    databaseMocks.createTrackerRepository.mockResolvedValue(repository);

    await expect(getApplicationContextSnapshot()).resolves.toMatchObject({
      authenticated: true,
      connection: null,
      assets: [],
    });
    expect(repository.getInsightsFreshness).toHaveBeenCalledOnce();
  });

  it("keeps the database-unavailable snapshot when repository creation also fails", async () => {
    serverMocks.getRuntimeConfiguration.mockReturnValue(
      runtimeConfiguration(false),
    );
    serverMocks.readPageOwnerSession.mockResolvedValue({
      sub: liveConnection.connectionId,
    });
    serverMocks.readDatabaseHealth.mockResolvedValue(null);
    databaseMocks.createTrackerRepository.mockRejectedValue(
      new Error("invalid database client"),
    );

    await expect(getApplicationContextSnapshot()).resolves.toMatchObject({
      authenticated: true,
      connection: null,
      assets: [],
    });
  });

  it("rejects an owner mismatch before surfacing a discarded settings failure", async () => {
    serverMocks.getRuntimeConfiguration.mockReturnValue(
      runtimeConfiguration(false),
    );
    serverMocks.readPageOwnerSession.mockResolvedValue({ sub: "other-owner" });
    serverMocks.readDatabaseHealth.mockResolvedValue({ ok: true });
    const repository = liveSnapshotRepository([liveLeadDefinition]);
    vi.mocked(repository.getSettings).mockRejectedValue(
      new Error("settings should be discarded"),
    );
    databaseMocks.createTrackerRepository.mockResolvedValue(repository);

    await expect(getApplicationContextSnapshot()).resolves.toMatchObject({
      authenticated: false,
      connection: null,
      assets: [],
    });
    expect(repository.getInsightsFreshness).not.toHaveBeenCalled();
    expect(repository.listReportingScopeInventory).not.toHaveBeenCalled();
    expect(repository.getReportingScope).not.toHaveBeenCalled();
  });

  it("surfaces connection and settings failures after healthy owner validation", async () => {
    serverMocks.getRuntimeConfiguration.mockReturnValue(
      runtimeConfiguration(false),
    );
    serverMocks.readPageOwnerSession.mockResolvedValue({
      sub: liveConnection.connectionId,
    });
    serverMocks.readDatabaseHealth.mockResolvedValue({ ok: true });
    const connectionFailureRepository = liveSnapshotRepository([
      liveLeadDefinition,
    ]);
    vi.mocked(connectionFailureRepository.getConnection).mockRejectedValue(
      new Error("connection read failed"),
    );
    databaseMocks.createTrackerRepository.mockResolvedValue(
      connectionFailureRepository,
    );

    await expect(getApplicationContextSnapshot()).rejects.toThrow(
      "connection read failed",
    );

    const settingsFailureRepository = liveSnapshotRepository([
      liveLeadDefinition,
    ]);
    vi.mocked(settingsFailureRepository.getSettings).mockRejectedValue(
      new Error("settings read failed"),
    );
    databaseMocks.createTrackerRepository.mockResolvedValue(
      settingsFailureRepository,
    );

    await expect(getApplicationContextSnapshot()).rejects.toThrow(
      "settings read failed",
    );
  });

  it("loads operational health without full assets or Creative rows", async () => {
    serverMocks.getRuntimeConfiguration.mockReturnValue(
      runtimeConfiguration(false),
    );
    serverMocks.readPageOwnerSession.mockResolvedValue({
      sub: liveConnection.connectionId,
    });
    serverMocks.readDatabaseHealth.mockResolvedValue({ ok: true });
    const repository = liveSnapshotRepository([liveLeadDefinition]);
    const storedSettings = await repository.getSettings();
    vi.mocked(repository.getSettings)
      .mockClear()
      .mockResolvedValue({
        ...storedSettings,
        lastInitialSyncAt: null,
      });
    vi.mocked(repository.getInsightsFreshness).mockResolvedValue({
      lastSyncedAt: null,
      dataThroughAt: null,
      syncVersion: null,
      syncStatus: "partial",
      syncMode: "manual",
    });
    const coverage = {
      connectionId: liveConnection.connectionId,
      connectionStatus: "connected",
      lastValidatedAt: null,
      businessCount: 1,
      adAccountCount: 1,
      pageCount: 1,
      appCount: 1,
      creativeContainerCount: 1,
      creativeAssetCount: 1,
      campaignCount: 1,
      adCount: 1,
      lastSyncAt: "2026-07-30T00:00:00.000Z",
    } as const;
    vi.mocked(repository.getCoverage).mockResolvedValue(coverage);
    const getDataHealthOperationalRegistry = vi.fn().mockResolvedValue({
      coverage,
      runs: [],
    });
    Object.assign(repository, { getDataHealthOperationalRegistry });
    databaseMocks.createTrackerRepository.mockResolvedValue(repository);

    const snapshot = await getApplicationOperationalSnapshot();

    expect(snapshot.creatives).toEqual([]);
    expect(getDataHealthOperationalRegistry).toHaveBeenCalledWith(
      liveConnection.connectionId,
      20,
    );
    expect(repository.getCoverage).not.toHaveBeenCalled();
    expect(repository.getDeliveryPerformance).toHaveBeenCalledOnce();
    expect(repository.listRecentSyncRuns).not.toHaveBeenCalled();
    expect(repository.listMetaAssets).not.toHaveBeenCalled();
    expect(repository.listCreativeLibrary).not.toHaveBeenCalled();
    expect(repository.listCreativePerformance).not.toHaveBeenCalled();
    expect(snapshot.setupChecks.find((check) => check.id === "sync"))
      .toMatchObject({ status: "ready" });
  });

  it("loads full source inventory without Creative performance", async () => {
    serverMocks.getRuntimeConfiguration.mockReturnValue(
      runtimeConfiguration(false),
    );
    serverMocks.readPageOwnerSession.mockResolvedValue({
      sub: liveConnection.connectionId,
    });
    serverMocks.readDatabaseHealth.mockResolvedValue({ ok: true });
    const repository = liveSnapshotRepository([liveLeadDefinition]);
    vi.mocked(repository.listMetaAssets).mockResolvedValue({
      businesses: [
        {
          businessId: "business_db_1",
          metaBusinessId: "business_1",
          name: "Business One",
          verificationStatus: "verified",
          isActive: true,
          lastSeenAt: "2026-07-31T00:00:00.000Z",
        },
      ],
      adAccounts: [
        {
          adAccountId: "account_db_1",
          metaAdAccountId: "act_1",
          accountId: "1",
          name: "Account One",
          accountStatus: 1,
          currency: "VND",
          timezoneName: "Asia/Ho_Chi_Minh",
          businessName: "Business One",
          isActive: true,
          lastSeenAt: "2026-07-31T00:00:00.000Z",
        },
      ],
      pages: [
        {
          pageId: "page_db_1",
          metaPageId: "page_1",
          name: "Page One",
          category: "Sports",
          pictureUrl: null,
          isActive: true,
          lastSeenAt: "2026-07-31T00:00:00.000Z",
        },
      ],
      apps: [
        {
          appId: "app_db_1",
          metaAppId: "app_1",
          name: "App One",
          namespace: null,
          platform: "android",
          storeUrl: null,
          isActive: true,
          lastSeenAt: "2026-07-31T00:00:00.000Z",
        },
      ],
    });
    databaseMocks.createTrackerRepository.mockResolvedValue(repository);

    const snapshot = await getApplicationAssetsSnapshot();
    const registry = await getApplicationResultRegistry(snapshot);

    expect(snapshot.creatives).toEqual([]);
    expect(repository.listMetaAssets).toHaveBeenCalledOnce();
    expect(repository.getCoverage).not.toHaveBeenCalled();
    expect(repository.getDeliveryPerformance).not.toHaveBeenCalled();
    expect(repository.listRecentSyncRuns).not.toHaveBeenCalled();
    expect(repository.listCreativeLibrary).not.toHaveBeenCalled();
    expect(repository.listCreativePerformance).not.toHaveBeenCalled();
    expect(repository.listResultDefinitions).toHaveBeenCalledOnce();
    expect(repository.listResultMappings).toHaveBeenCalledOnce();
    expect(registry.definitions).toEqual(snapshot.resultDefinitions);
    expect(snapshot.dashboard.counts).toMatchObject({
      businesses: 1,
      adAccounts: 1,
      pages: 1,
    });
    expect(snapshot.dashboard.lastSyncAt).not.toBeNull();
    expect(snapshot.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "business_1",
          verificationStatus: "verified",
          lastSeenAt: "2026-07-31T00:00:00.000Z",
        }),
        expect.objectContaining({
          id: "page_1",
          category: "Sports",
          lastSeenAt: "2026-07-31T00:00:00.000Z",
        }),
        expect.objectContaining({
          id: "app_1",
          platform: "android",
          lastSeenAt: "2026-07-31T00:00:00.000Z",
        }),
      ]),
    );
  });

  it("keeps stored Data Health Creative identity links while Meta needs reauth", async () => {
    serverMocks.getRuntimeConfiguration.mockReturnValue(
      runtimeConfiguration(false),
    );
    serverMocks.readPageOwnerSession.mockResolvedValue({
      sub: liveConnection.connectionId,
    });
    serverMocks.readDatabaseHealth.mockResolvedValue({ ok: true });
    const repository = liveSnapshotRepository([liveLeadDefinition]);
    vi.mocked(repository.getConnection).mockResolvedValue({
      ...liveConnection,
      status: "needs_reauth",
    });
    const libraryItem: CreativeLibraryItem = {
      creativeAssetId: "asset_data_health",
      assetKey: "video:video_1",
      assetType: "video",
      metaVideoId: "video_1",
      metaImageHash: null,
      name: null,
      thumbnailUrl: null,
      previewUrl: null,
      width: 1080,
      height: 1920,
      durationSeconds: 15,
      creativeCodes: [],
      pageNames: [],
      creativeContainerCount: 1,
      adCount: 1,
      currentAdCount: 1,
      activeAdCount: 1,
      adAccountCount: 1,
      pageCount: 1,
      metaCreativeIds: ["meta_creative_1"],
      adIds: ["ad_1"],
      campaignIds: ["campaign_1"],
      adAccountIds: ["act_1"],
      pageIds: ["page_1"],
      lastUsedAt: "2026-07-31T00:00:00.000Z",
      lastSeenAt: "2026-07-31T00:00:00.000Z",
    };
    vi.mocked(repository.listCreativeLibrary).mockResolvedValue([
      libraryItem,
    ]);
    const listDataHealthCreativeReferences = vi.fn().mockResolvedValue([
      {
        creativeAssetId: libraryItem.creativeAssetId,
        creativeFamilyId: libraryItem.creativeFamilyId,
        assetKey: libraryItem.assetKey,
        assetType: libraryItem.assetType,
        name: libraryItem.name,
        metaCreativeIds: libraryItem.metaCreativeIds,
        adIds: libraryItem.adIds,
        campaignIds: libraryItem.campaignIds,
      },
    ]);
    Object.assign(repository, { listDataHealthCreativeReferences });
    databaseMocks.createTrackerRepository.mockResolvedValue(repository);

    const contextSnapshot = await getApplicationContextSnapshot();
    const referenceSnapshot = await getDataHealthCreativeReferenceSnapshot(
      contextSnapshot,
    );
    const expectedFamilyId = createCreativeFamilyIdentity({
      assetKey: libraryItem.assetKey,
      internalStableIdentifier: libraryItem.creativeAssetId,
    }).creativeFamilyId;

    expect(databaseMocks.createTrackerRepository).toHaveBeenCalledTimes(1);
    expect(contextSnapshot.connection?.status).toBe("needs_reauth");
    expect(listDataHealthCreativeReferences).toHaveBeenCalledWith(
      liveConnection.connectionId,
    );
    expect(repository.listCreativeLibrary).not.toHaveBeenCalled();
    expect(repository.listCreativePerformance).not.toHaveBeenCalled();
    expect(referenceSnapshot).toEqual({
      truncated: false,
      items: [
        {
          id: libraryItem.creativeAssetId,
          creativeFamilyId: expectedFamilyId,
          name: libraryItem.assetKey,
          format: "Video",
          entityLinks: {
            creativeFamilyId: expectedFamilyId,
            assetId: libraryItem.creativeAssetId,
            metaCreativeIds: ["meta_creative_1"],
            adIds: ["ad_1"],
            campaignIds: ["campaign_1"],
          },
        },
      ],
    });
  });

  it("uses the sentinel Creative identity row to expose a bounded projection", async () => {
    serverMocks.getRuntimeConfiguration.mockReturnValue(
      runtimeConfiguration(false),
    );
    serverMocks.readPageOwnerSession.mockResolvedValue({
      sub: liveConnection.connectionId,
    });
    serverMocks.readDatabaseHealth.mockResolvedValue({ ok: true });
    const repository = liveSnapshotRepository([liveLeadDefinition]);
    const identities = Array.from({ length: 5_001 }, (_, index) => ({
      creativeAssetId: `asset_${index}`,
      creativeFamilyId: `cf_${index}`,
      assetKey: `video:${index}`,
      assetType: "video" as const,
      name: `Creative ${index}`,
      metaCreativeIds: [`creative_${index}`],
      adIds: [`ad_${index}`],
      campaignIds: [`campaign_${index}`],
    }));
    const listDataHealthCreativeReferences = vi
      .fn()
      .mockResolvedValue(identities);
    Object.assign(repository, { listDataHealthCreativeReferences });
    databaseMocks.createTrackerRepository.mockResolvedValue(repository);

    const contextSnapshot = await getApplicationContextSnapshot();
    const referenceSnapshot = await getDataHealthCreativeReferenceSnapshot(
      contextSnapshot,
    );

    expect(referenceSnapshot.truncated).toBe(true);
    expect(referenceSnapshot.items).toHaveLength(5_000);
    expect(referenceSnapshot.items.at(-1)?.id).toBe("asset_4999");
  });

  it("reuses the context repository and settings for sibling report loaders", async () => {
    serverMocks.getRuntimeConfiguration.mockReturnValue(
      runtimeConfiguration(false),
    );
    serverMocks.readPageOwnerSession.mockResolvedValue({
      sub: liveConnection.connectionId,
    });
    serverMocks.readDatabaseHealth.mockResolvedValue({ ok: true });
    const repository = liveSnapshotRepository([liveLeadDefinition]);
    databaseMocks.createTrackerRepository.mockResolvedValue(repository);

    const contextSnapshot = await getApplicationContextSnapshot();
    await getCreativeRowsForReport({
      snapshot: contextSnapshot,
      dateFrom: "2026-07-01",
      dateTo: "2026-07-07",
      accountMetaIds: ["act_1", "act_2"],
      currency: "VND",
      syncVersion: "run-1",
    });

    expect(databaseMocks.createTrackerRepository).toHaveBeenCalledTimes(1);
    expect(repository.getSettings).toHaveBeenCalledTimes(1);
  });

  it("composes the full snapshot from one base query set", async () => {
    serverMocks.getRuntimeConfiguration.mockReturnValue(
      runtimeConfiguration(false),
    );
    serverMocks.readPageOwnerSession.mockResolvedValue({
      sub: liveConnection.connectionId,
    });
    serverMocks.readDatabaseHealth.mockResolvedValue({ ok: true });
    const repository = liveSnapshotRepository([liveLeadDefinition]);
    databaseMocks.createTrackerRepository.mockResolvedValue(repository);

    const fullSnapshot = await getApplicationSnapshot();

    expect(fullSnapshot.creatives).toEqual([]);
    expect(repository.getCoverage).toHaveBeenCalledTimes(1);
    expect(repository.listMetaAssets).toHaveBeenCalledTimes(1);
    expect(repository.getDeliveryPerformance).toHaveBeenCalledTimes(1);
    expect(repository.listCreativeLibrary).toHaveBeenCalledTimes(1);
    expect(repository.listCreativePerformance).toHaveBeenCalledTimes(1);
    expect(repository.listCreativePerformance).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5_001, offset: 0 }),
    );
  });

  it("includes enabled fallback definitions in demo mode", async () => {
    serverMocks.getRuntimeConfiguration.mockReturnValue(
      runtimeConfiguration(true),
    );

    const snapshot = await getApplicationSnapshot();

    expect(snapshot.resultDefinitions).toEqual(
      DEFAULT_RESULT_DEFINITIONS.filter((definition) => definition.enabled),
    );
    expect(snapshot.resultDefinitions.every((definition) => definition.enabled)).toBe(
      true,
    );
  });

  it("includes enabled fallback definitions before owner authentication", async () => {
    serverMocks.getRuntimeConfiguration.mockReturnValue(
      runtimeConfiguration(false),
    );

    const snapshot = await getApplicationSnapshot();

    expect(snapshot.authenticated).toBe(false);
    expect(snapshot.dashboard).toEqual({
      mode: "setup",
      ownerName: "Owner",
      connectionLabel: "Chưa kết nối Meta",
      connectionDetail: "Nhập mã owner để mở Meta OAuth read-only.",
      lastSyncAt: null,
      hasDelivery: false,
      counts: {
        businesses: 0,
        adAccounts: 0,
        pages: 0,
        creatives: 0,
      },
      events: [
        {
          name: "Install",
          android: "locked",
          ios: "locked",
          total: null,
        },
        {
          name: "CompleteRegistration",
          android: "locked",
          ios: "locked",
          total: null,
        },
      ],
      checklist: [
        {
          label: "App events trong Insights",
          status: "locked",
          detail: "Kết nối Meta để kiểm tra Install/Registration",
        },
        {
          label: "Quyền truy cập",
          status: "locked",
          detail: "Chưa xác thực Meta",
        },
        {
          label: "Event mapping",
          status: "locked",
          detail: "Chưa có dữ liệu Insights để xác minh",
        },
        {
          label: "Lần đồng bộ cuối",
          status: "locked",
          detail: "Chưa có",
        },
      ],
    });
    expect(snapshot.freshness).toEqual({
      lastSyncedAt: null,
      dataThroughAt: null,
      syncStatus: "warning",
      freshnessSeconds: null,
      syncMode: "manual",
    });
    expect(snapshot.resultDefinitions).toEqual(
      DEFAULT_RESULT_DEFINITIONS.filter((definition) => definition.enabled),
    );
  });

  it("preserves an intentionally all-disabled stored registry", async () => {
    serverMocks.getRuntimeConfiguration.mockReturnValue(
      runtimeConfiguration(false),
    );
    serverMocks.readPageOwnerSession.mockResolvedValue({
      sub: liveConnection.connectionId,
    });
    serverMocks.readDatabaseHealth.mockResolvedValue({ ok: true });
    databaseMocks.createTrackerRepository.mockResolvedValue(
      liveSnapshotRepository([
        { ...runtimeSalesValueDefinition, enabled: false },
      ]),
    );

    const snapshot = await getApplicationSnapshot();

    expect(snapshot.resultDefinitions).toEqual([]);
  });

  it("hydrates owner mappings instead of stale stored aliases", async () => {
    serverMocks.getRuntimeConfiguration.mockReturnValue(
      runtimeConfiguration(false),
    );
    serverMocks.readPageOwnerSession.mockResolvedValue({
      sub: liveConnection.connectionId,
    });
    serverMocks.readDatabaseHealth.mockResolvedValue({ ok: true });
    databaseMocks.createTrackerRepository.mockResolvedValue(
      liveSnapshotRepository(
        [runtimeSalesValueDefinition],
        [runtimeSalesValueActionMapping],
      ),
    );

    const snapshot = await getApplicationSnapshot();

    expect(snapshot.resultDefinitions).toEqual([
      expect.objectContaining({
        canonicalKey: "runtime_sales_value",
        rawActionTypes: ["purchase"],
        rawValueActionTypes: [],
      }),
    ]);
  });

  it("removes aliases for a disabled persisted mapping", async () => {
    serverMocks.getRuntimeConfiguration.mockReturnValue(
      runtimeConfiguration(false),
    );
    serverMocks.readPageOwnerSession.mockResolvedValue({
      sub: liveConnection.connectionId,
    });
    serverMocks.readDatabaseHealth.mockResolvedValue({ ok: true });
    databaseMocks.createTrackerRepository.mockResolvedValue(
      liveSnapshotRepository(
        [runtimeSalesValueDefinition],
        [{ ...runtimeSalesValueActionMapping, enabled: false }],
      ),
    );

    const snapshot = await getApplicationSnapshot();

    expect(snapshot.resultDefinitions).toEqual([
      expect.objectContaining({
        canonicalKey: "runtime_sales_value",
        rawActionTypes: [],
        rawValueActionTypes: [],
      }),
    ]);
  });
});

describe("application report context Result registry", () => {
  it("pins the latest URL alias to the exact published sync version", () => {
    const snapshot = connectedApplicationSnapshot([
      runtimeSalesValueDefinition,
    ]);

    const context = resolveApplicationReportContext(snapshot, {
      sync_version: " latest ",
    });

    expect(context.syncVersion).toBe("run-1");
  });

  it("falls back to the latest completed run when freshness has no version", () => {
    const context = resolveApplicationReportContext(
      applicationSnapshot([runtimeSalesValueDefinition]),
      { sync_version: "latest" },
    );

    expect(context.syncVersion).toBe("demo-sync-03");
  });

  it("preserves an explicit historical sync version", () => {
    const snapshot = connectedApplicationSnapshot([
      runtimeSalesValueDefinition,
    ]);

    const context = resolveApplicationReportContext(snapshot, {
      sync_version: "historical-run",
    });

    expect(context.syncVersion).toBe("historical-run");
  });

  it("uses the snapshot registry to select the Objective default", () => {
    const context = resolveApplicationReportContext(
      applicationSnapshot([runtimeSalesValueDefinition]),
      { objective: "OUTCOME_SALES" },
    );

    expect(context.objectiveKey).toBe("sales");
    expect(context.primaryResultKey).toBe("runtime_sales_value");
  });

  it("rejects a static Result that is absent from the snapshot registry", () => {
    const context = resolveApplicationReportContext(
      applicationSnapshot([runtimeSalesValueDefinition]),
      { objective: "sales", result: "purchase" },
    );

    expect(context.primaryResultKey).toBe("runtime_sales_value");
    expect(context.warnings).toContainEqual(
      expect.objectContaining({
        code: "result_not_available_for_objective",
        field: "primaryResultKey",
        input: "purchase",
        fallback: "runtime_sales_value",
      }),
    );
  });
});

describe("live Creative fatigue integration", () => {
  it("uses two exact non-overlapping 7D windows and fails closed without Family Reach", async () => {
    const dateFrom = "2026-07-01";
    const dateTo = "2026-07-14";
    const snapshot = connectedApplicationSnapshot([
      liveLeadDefinition,
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, {
        objective: "leads",
      }),
      adAccountIds: ["act_1"],
      dateFrom,
      dateTo,
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    const {
      repository,
      getCanonicalCreativeFamilyResultTotals,
      listCreativePerformance,
    } = liveFatigueRepository({ dateFrom, dateTo });
    databaseMocks.createTrackerRepository.mockResolvedValue(repository);

    const report = await getCreativeRowsForReport({
      snapshot,
      dateFrom,
      dateTo,
      accountMetaIds: context.adAccountIds,
      campaignMetaId: "campaign_1",
      currency: context.currency,
      attributionWindow: context.attributionSettingKey,
      actionReportTime: context.actionReportTime,
      syncVersion: context.syncVersion,
      reportContext: context,
    });

    expect(
      report.creatives[0]?.performance?.evaluation,
    ).toMatchObject({
      resultKey: "lead",
      fatigueStatus: "insufficient",
      recommendationKey: "continue_test",
    });

    const canonicalCampaignCalls =
      getCanonicalCreativeFamilyResultTotals.mock.calls
        .map(([filters]) => filters)
        .filter((filters) => filters.campaignMetaIds?.length);
    expect(canonicalCampaignCalls).toHaveLength(3);
    expect(canonicalCampaignCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dateFrom: "2026-07-01",
          dateTo: "2026-07-07",
        }),
        expect.objectContaining({
          dateFrom: "2026-07-08",
          dateTo: "2026-07-14",
        }),
      ]),
    );
    for (const filters of canonicalCampaignCalls) {
      expect(filters).toMatchObject({
        adAccountIds: ["act_1"],
        campaignMetaIds: ["campaign_1"],
        objectiveKeys: ["leads"],
        currency: "VND",
        attributionWindow: context.attributionSettingKey,
        actionReportTime: context.actionReportTime,
        syncVersion: "run-1",
        resultMappingVersion:
          computeResultMappingVersion(liveLeadMappings),
      });
    }

    const performanceCampaignCalls =
      listCreativePerformance.mock.calls
        .map(([filters]) => filters)
        .filter((filters) => filters.campaignMetaId === "campaign_1");
    expect(performanceCampaignCalls).toHaveLength(3);
    expect(performanceCampaignCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dateFrom: "2026-07-01",
          dateTo: "2026-07-07",
        }),
        expect.objectContaining({
          dateFrom: "2026-07-08",
          dateTo: "2026-07-14",
        }),
      ]),
    );
    for (const filters of performanceCampaignCalls) {
      expect(filters.includeInactiveAccounts).toBe(true);
    }
  });

  it("keeps one 7D report insufficient until a previous 7D window is available", async () => {
    const dateFrom = "2026-07-01";
    const dateTo = "2026-07-07";
    const snapshot = connectedApplicationSnapshot([
      liveLeadDefinition,
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, {
        objective: "leads",
      }),
      adAccountIds: ["act_1"],
      dateFrom,
      dateTo,
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    const {
      repository,
      getCanonicalCreativeFamilyResultTotals,
      listCreativePerformance,
    } = liveFatigueRepository({ dateFrom, dateTo });
    databaseMocks.createTrackerRepository.mockResolvedValue(repository);

    const report = await getCreativeRowsForReport({
      snapshot,
      dateFrom,
      dateTo,
      accountMetaIds: context.adAccountIds,
      campaignMetaId: "campaign_1",
      currency: context.currency,
      attributionWindow: context.attributionSettingKey,
      actionReportTime: context.actionReportTime,
      syncVersion: context.syncVersion,
      reportContext: context,
    });

    expect(
      report.creatives[0]?.performance?.evaluation,
    ).toMatchObject({ fatigueStatus: "insufficient" });
    expect(
      getCanonicalCreativeFamilyResultTotals.mock.calls.filter(
        ([filters]) => filters.campaignMetaIds?.length,
      ),
    ).toHaveLength(1);
    expect(
      listCreativePerformance.mock.calls.filter(
        ([filters]) => filters.campaignMetaId === "campaign_1",
      ),
    ).toHaveLength(1);
  });
});

describe("live Creative campaign scope", () => {
  it("batches an exact multi-account scope into one performance and one delivery read", async () => {
    const snapshot = connectedApplicationSnapshot([liveLeadDefinition]);
    const repository = liveSnapshotRepository([liveLeadDefinition]);
    databaseMocks.createTrackerRepository.mockResolvedValue(repository);

    await getCreativeRowsForReport({
      snapshot,
      dateFrom: "2026-07-01",
      dateTo: "2026-07-07",
      accountMetaIds: ["act_1", "act_2"],
      currency: "VND",
      syncVersion: "run-1",
    });

    expect(repository.listCreativePerformance).toHaveBeenCalledTimes(1);
    expect(repository.listCreativePerformance).toHaveBeenCalledWith(
      expect.objectContaining({
        accountMetaId: undefined,
        accountMetaIds: ["act_1", "act_2"],
        includeInactiveAccounts: true,
      }),
    );
    expect(repository.getDeliveryPerformance).toHaveBeenCalledTimes(1);
    expect(repository.getDeliveryPerformance).toHaveBeenCalledWith(
      expect.objectContaining({
        adAccountMetaIds: ["act_1", "act_2"],
        includeInactiveAccounts: true,
      }),
    );
  });

  it("filters library families by the exact trimmed campaign before mapping", async () => {
    const dateFrom = "2026-07-01";
    const dateTo = "2026-07-07";
    const snapshot = connectedApplicationSnapshot([liveLeadDefinition]);
    const context = {
      ...resolveApplicationReportContext(snapshot, { objective: "leads" }),
      adAccountIds: ["act_1"],
      dateFrom,
      dateTo,
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    const { repository, listCreativePerformance } =
      liveFatigueRepository({ dateFrom, dateTo });
    const listCreativeLibrary = vi.mocked(
      repository.listCreativeLibrary,
    );
    databaseMocks.createTrackerRepository.mockResolvedValue(repository);

    const report = await getCreativeRowsForReport({
      snapshot,
      dateFrom,
      dateTo,
      accountMetaIds: context.adAccountIds,
      campaignMetaId: " campaign_other ",
      currency: context.currency,
      attributionWindow: context.attributionSettingKey,
      actionReportTime: context.actionReportTime,
      syncVersion: context.syncVersion,
      reportContext: context,
    });

    expect(report.creatives).toEqual([]);
    expect(listCreativeLibrary).toHaveBeenCalledWith({
      connectionId: liveConnection.connectionId,
      adAccountMetaIds: ["act_1"],
      campaignMetaIds: ["campaign_other"],
      limit: 5_001,
      offset: 0,
    });
    expect(listCreativePerformance).toHaveBeenCalledWith(
      expect.objectContaining({ campaignMetaId: "campaign_other" }),
    );
  });

  it("blocks a family detail before performance queries when it is outside the campaign", async () => {
    const dateFrom = "2026-07-01";
    const dateTo = "2026-07-07";
    const snapshot = connectedApplicationSnapshot([liveLeadDefinition]);
    const context = {
      ...resolveApplicationReportContext(snapshot, { objective: "leads" }),
      adAccountIds: ["act_1"],
      dateFrom,
      dateTo,
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    const { repository, listCreativePerformance } =
      liveFatigueRepository({ dateFrom, dateTo });
    const getCreativeFamilyById = vi
      .fn()
      .mockResolvedValue(fatigueLibraryItem());
    const getSettings = vi.mocked(repository.getSettings);
    const scopedRepository = {
      ...repository,
      getCreativeFamilyById,
    } as unknown as TrackerRepository;

    const rows = await getCreativeFamilyRowsForReport({
      snapshot,
      creativeFamilyId: "cf_target",
      dateFrom,
      dateTo,
      accountMetaIds: context.adAccountIds,
      campaignMetaId: " campaign_other ",
      currency: context.currency,
      attributionWindow: context.attributionSettingKey,
      actionReportTime: context.actionReportTime,
      syncVersion: context.syncVersion,
      reportContext: context,
      repository: scopedRepository,
    });

    expect(rows).toBeNull();
    expect(getCreativeFamilyById).toHaveBeenCalledWith(
      liveConnection.connectionId,
      "cf_target",
    );
    expect(getSettings).not.toHaveBeenCalled();
    expect(listCreativePerformance).not.toHaveBeenCalled();
  });
});

describe("live Creative Result registry fallback", () => {
  it("hydrates an owner-remapped currency Result before Family evaluation", async () => {
    const dateFrom = "2026-07-01";
    const dateTo = "2026-07-07";
    const snapshot = connectedApplicationSnapshot([
      runtimeSalesValueDefinition,
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, {
        objective: "sales",
      }),
      adAccountIds: ["act_1"],
      dateFrom,
      dateTo,
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    const { repository } = liveFatigueRepository({ dateFrom, dateTo });
    const canonicalResults: CanonicalCreativeFamilyResultTotals = {
      available: true,
      syncVersion: "run-1",
      resultMappingVersion: computeResultMappingVersion([
        runtimeSalesValueActionMapping,
      ]),
      results: [
        {
          adAccountMetaId: "act_1",
          creativeFamilyId: "cf_target",
          allocationMethod: "single_asset",
          canonicalResultKey: "runtime_sales_value",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "VND",
          value: 3,
        },
        {
          adAccountMetaId: "act_1",
          creativeFamilyId: "cf_target",
          allocationMethod: "single_asset",
          canonicalResultKey: "runtime_sales_value",
          objectiveKey: "sales",
          metricSource: "action_value",
          currency: "VND",
          value: 450,
        },
      ],
    };
    databaseMocks.createTrackerRepository.mockResolvedValue({
      ...repository,
      listResultDefinitions: vi
        .fn()
        .mockResolvedValue([runtimeSalesValueDefinition]),
      listResultMappings: vi
        .fn()
        .mockResolvedValue([runtimeSalesValueActionMapping]),
      getCanonicalCreativeFamilyResultTotals: vi
        .fn()
        .mockResolvedValue(canonicalResults),
    } as unknown as TrackerRepository);

    const report = await getCreativeRowsForReport({
      snapshot,
      dateFrom,
      dateTo,
      accountMetaIds: context.adAccountIds,
      campaignMetaId: "campaign_1",
      currency: context.currency,
      attributionWindow: context.attributionSettingKey,
      actionReportTime: context.actionReportTime,
      syncVersion: context.syncVersion,
      reportContext: context,
    });

    expect(report.creatives[0]?.performance?.resultValues).toEqual({
      runtime_sales_value: 3,
    });
  });

  it("does not re-enable default delivery Results on an all-Objective early return", async () => {
    const dateFrom = "2026-07-01";
    const dateTo = "2026-07-02";
    const snapshot = connectedApplicationSnapshot([]);
    const context = {
      ...resolveApplicationReportContext(snapshot, { objective: "all" }),
      adAccountIds: ["act_1"],
      dateFrom,
      dateTo,
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    const {
      repository,
      getCanonicalCreativeFamilyResultTotals,
    } = liveFatigueRepository({ dateFrom, dateTo });
    databaseMocks.createTrackerRepository.mockResolvedValue(repository);

    const report = await getCreativeRowsForReport({
      snapshot,
      dateFrom,
      dateTo,
      accountMetaIds: context.adAccountIds,
      campaignMetaId: "campaign_1",
      currency: context.currency,
      attributionWindow: context.attributionSettingKey,
      actionReportTime: context.actionReportTime,
      syncVersion: context.syncVersion,
      reportContext: context,
    });

    expect(report.creatives[0]?.performance?.resultValues).toEqual({});
    expect(report.creatives[0]?.performance?.evaluation).toBeNull();
    expect(getCanonicalCreativeFamilyResultTotals).not.toHaveBeenCalled();
  });

  it("keeps the snapshot registry authoritative when the live registry query fails", async () => {
    const dateFrom = "2026-07-01";
    const dateTo = "2026-07-02";
    const snapshot = connectedApplicationSnapshot([]);
    const context = {
      ...resolveApplicationReportContext(snapshot, {
        objective: "awareness",
      }),
      adAccountIds: ["act_1"],
      dateFrom,
      dateTo,
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    const {
      repository,
      getCanonicalCreativeFamilyResultTotals,
    } = liveFatigueRepository({ dateFrom, dateTo });
    const listResultDefinitions = vi
      .fn()
      .mockRejectedValue(new Error("registry unavailable"));
    databaseMocks.createTrackerRepository.mockResolvedValue({
      ...repository,
      listResultDefinitions,
    } as unknown as TrackerRepository);

    const report = await getCreativeRowsForReport({
      snapshot,
      dateFrom,
      dateTo,
      accountMetaIds: context.adAccountIds,
      campaignMetaId: "campaign_1",
      currency: context.currency,
      attributionWindow: context.attributionSettingKey,
      actionReportTime: context.actionReportTime,
      syncVersion: context.syncVersion,
      reportContext: context,
    });

    expect(listResultDefinitions).toHaveBeenCalledOnce();
    expect(report.creatives[0]?.performance?.resultValues).toEqual({});
    expect(report.creatives[0]?.performance?.evaluation).toBeNull();
    expect(getCanonicalCreativeFamilyResultTotals).not.toHaveBeenCalled();
  });
});

describe("live canonical overview trend", () => {
  it("uses the canonical Install row instead of legacy delivery installs", async () => {
    const snapshot = connectedApplicationSnapshot([
      ...DEFAULT_RESULT_DEFINITIONS,
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, {
        objective: "app_promotion",
      }),
      adAccountIds: ["act_1"],
      dateFrom: "2026-07-01",
      dateTo: "2026-07-02",
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    const mappings = [
      {
        id: "mapping-install",
        canonicalResultKey: "install",
        rawActionType: "mobile_app_install",
        metricSource: "action" as const,
        priority: 0,
        enabled: true,
      },
    ];
    const getCanonicalResultTrend = vi.fn().mockResolvedValue({
      available: true,
      syncVersion: "run-1",
      resultMappingVersion: computeResultMappingVersion(mappings),
      results: [
        {
        metricDate: "2026-07-01",
        canonicalResultKey: "install",
        objectiveKey: "app_promotion",
        metricSource: "action",
        currency: "VND",
        value: 7,
        dailySpend: 700,
        },
        {
        metricDate: "2026-07-01",
        canonicalResultKey: "impressions",
        objectiveKey: "app_promotion",
        metricSource: "delivery",
        currency: "VND",
        value: 5_000,
        dailySpend: 700,
        },
      ],
    });
    const getDeliveryTrend = vi.fn().mockResolvedValue([
      {
        metricDate: "2026-07-01",
        currency: "VND",
        spend: 700,
        impressions: 5_000,
        linkClicks: 100,
        installs: 999,
        registrations: 777,
      },
    ]);
    databaseMocks.createTrackerRepository.mockResolvedValue({
      listResultMappings: vi.fn().mockResolvedValue(mappings),
      getCanonicalResultTrend,
      getDeliveryTrend,
    } as unknown as TrackerRepository);

    const trend = await getOverviewTrendForReport({
      snapshot,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      accountMetaIds: [" act_1 "],
      campaignMetaId: " campaign_1 ",
      currency: context.currency,
      attributionWindow: context.attributionSettingKey,
      actionReportTime: context.actionReportTime,
      syncVersion: context.syncVersion,
      reportContext: context,
    });

    expect(getDeliveryTrend).not.toHaveBeenCalled();
    expect(getCanonicalResultTrend).toHaveBeenCalledWith({
      connectionId: liveConnection.connectionId,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      adAccountIds: ["act_1"],
      campaignMetaIds: ["campaign_1"],
      objectiveKeys: ["app_promotion"],
      objectiveMappings: expect.arrayContaining([
        expect.objectContaining({ objectiveKey: "app_promotion" }),
      ]),
      currency: "VND",
      attributionWindow: context.attributionSettingKey,
      actionReportTime: context.actionReportTime,
      syncVersion: "run-1",
      resultMappingVersion: computeResultMappingVersion(mappings),
    });
    expect(trend).toEqual([
      {
        date: "2026-07-01",
        currency: "VND",
        spend: 700,
        impressions: 5_000,
        linkClicks: 0,
        resultValues: { install: 7 },
        efficiencyValues: { install: 100 },
      },
    ]);
  });

  it("keeps an owner-remapped currency Result on the action trend", async () => {
    const definitions = hydrateResultDefinitions({
      definitions: [runtimeSalesValueDefinition],
      mappings: [runtimeSalesValueActionMapping],
    });
    const snapshot = connectedApplicationSnapshot(definitions);
    const context = {
      ...resolveApplicationReportContext(snapshot, {
        objective: "sales",
      }),
      adAccountIds: ["act_1"],
      dateFrom: "2026-07-01",
      dateTo: "2026-07-01",
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    const getCanonicalResultTrend = vi.fn().mockResolvedValue({
      available: true,
      syncVersion: "run-1",
      resultMappingVersion: computeResultMappingVersion([
        runtimeSalesValueActionMapping,
      ]),
      results: [
        {
          metricDate: "2026-07-01",
          canonicalResultKey: "runtime_sales_value",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "VND",
          value: 3,
          dailySpend: 300,
        },
        {
          metricDate: "2026-07-01",
          canonicalResultKey: "runtime_sales_value",
          objectiveKey: "sales",
          metricSource: "action_value",
          currency: "VND",
          value: 450,
          dailySpend: 300,
        },
      ],
    });
    databaseMocks.createTrackerRepository.mockResolvedValue({
      listResultMappings: vi
        .fn()
        .mockResolvedValue([runtimeSalesValueActionMapping]),
      getCanonicalResultTrend,
    } as unknown as TrackerRepository);

    const trend = await getOverviewTrendForReport({
      snapshot,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      accountMetaIds: context.adAccountIds,
      currency: context.currency,
      reportContext: context,
    });

    expect(trend).toEqual([
      expect.objectContaining({
        resultValues: { runtime_sales_value: 3 },
      }),
    ]);
  });

  it("keeps the default currency Result on the action-value trend", async () => {
    const definitions = hydrateResultDefinitions({
      definitions: [runtimeSalesValueDefinition],
      mappings: [runtimeSalesValueActionValueMapping],
    });
    const snapshot = connectedApplicationSnapshot(definitions);
    const context = {
      ...resolveApplicationReportContext(snapshot, {
        objective: "sales",
      }),
      adAccountIds: ["act_1"],
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    databaseMocks.createTrackerRepository.mockResolvedValue({
      listResultMappings: vi
        .fn()
        .mockResolvedValue([runtimeSalesValueActionValueMapping]),
      getCanonicalResultTrend: vi.fn().mockResolvedValue({
        available: true,
        syncVersion: "run-1",
        resultMappingVersion: computeResultMappingVersion([
          runtimeSalesValueActionValueMapping,
        ]),
        results: [
          {
            metricDate: context.dateFrom,
            canonicalResultKey: "runtime_sales_value",
            objectiveKey: "sales",
            metricSource: "action",
            currency: "VND",
            value: 3,
            dailySpend: 300,
          },
          {
            metricDate: context.dateFrom,
            canonicalResultKey: "runtime_sales_value",
            objectiveKey: "sales",
            metricSource: "action_value",
            currency: "VND",
            value: 450,
            dailySpend: 300,
          },
        ],
      }),
    } as unknown as TrackerRepository);

    const trend = await getOverviewTrendForReport({
      snapshot,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      accountMetaIds: context.adAccountIds,
      currency: context.currency,
      reportContext: context,
    });

    expect(trend).toEqual([
      expect.objectContaining({
        resultValues: { runtime_sales_value: 450 },
      }),
    ]);
  });

  it("fails closed when the persisted Result mapping is disabled", async () => {
    const disabledMapping = {
      ...runtimeSalesValueActionValueMapping,
      enabled: false,
    };
    const definitions = hydrateResultDefinitions({
      definitions: [runtimeSalesValueDefinition],
      mappings: [disabledMapping],
    });
    const snapshot = connectedApplicationSnapshot(definitions);
    const context = {
      ...resolveApplicationReportContext(snapshot, {
        objective: "sales",
      }),
      adAccountIds: ["act_1"],
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    databaseMocks.createTrackerRepository.mockResolvedValue({
      listResultMappings: vi.fn().mockResolvedValue([disabledMapping]),
      getCanonicalResultTrend: vi.fn().mockResolvedValue({
        available: true,
        syncVersion: "run-1",
        resultMappingVersion: computeResultMappingVersion([
          disabledMapping,
        ]),
        results: [
          {
            metricDate: context.dateFrom,
            canonicalResultKey: "runtime_sales_value",
            objectiveKey: "sales",
            metricSource: "action_value",
            currency: "VND",
            value: 450,
            dailySpend: 300,
          },
        ],
      }),
    } as unknown as TrackerRepository);

    const trend = await getOverviewTrendForReport({
      snapshot,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      accountMetaIds: context.adAccountIds,
      currency: context.currency,
      reportContext: context,
    });

    expect(trend).toEqual([]);
  });

  it("honors a custom registry while ignoring disabled delivery rows and absent Reach", async () => {
    const customAwarenessDefinition: ResultDefinition = {
      id: "result_quality_view",
      canonicalKey: "quality_view",
      label: "Quality View",
      shortLabel: "Quality",
      objectiveKeys: ["awareness"],
      rawActionTypes: ["quality_view"],
      unit: "count",
      efficiencyMetric: "rate",
      direction: "higher_is_better",
      defaultForObjective: true,
      minimumResults: 1,
      minimumImpressions: 0,
      enabled: true,
    };
    const definition = (canonicalKey: string) =>
      DEFAULT_RESULT_DEFINITIONS.find(
        (item) => item.canonicalKey === canonicalKey,
      )!;
    const snapshot = connectedApplicationSnapshot([
      customAwarenessDefinition,
      {
        ...definition("reach"),
        defaultForObjective: false,
      },
      {
        ...definition("impressions"),
        objectiveKeys: ["awareness"],
        enabled: false,
      },
      {
        ...definition("link_click"),
        objectiveKeys: ["awareness"],
        enabled: false,
      },
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, {
        objective: "awareness",
      }),
      adAccountIds: ["act_1"],
      dateFrom: "2026-07-01",
      dateTo: "2026-07-01",
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    const getCanonicalResultTrend = vi.fn().mockResolvedValue({
      available: true,
      syncVersion: "run-1",
      resultMappingVersion: computeResultMappingVersion([]),
      results: [
        {
        metricDate: "2026-07-01",
        canonicalResultKey: "quality_view",
        objectiveKey: "awareness",
        metricSource: "action",
        currency: "VND",
        value: 20,
        dailySpend: 200,
        },
        {
        metricDate: "2026-07-01",
        canonicalResultKey: "impressions",
        objectiveKey: "awareness",
        metricSource: "delivery",
        currency: "VND",
        value: 1_000,
        dailySpend: 200,
        },
        {
        metricDate: "2026-07-01",
        canonicalResultKey: "link_click",
        objectiveKey: "awareness",
        metricSource: "delivery",
        currency: "VND",
        value: 100,
        dailySpend: 200,
        },
      ],
    });
    databaseMocks.createTrackerRepository.mockResolvedValue({
      listResultMappings: vi.fn().mockResolvedValue([]),
      getCanonicalResultTrend,
    } as unknown as TrackerRepository);

    const trend = await getOverviewTrendForReport({
      snapshot,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      accountMetaIds: context.adAccountIds,
      currency: context.currency,
      attributionWindow: context.attributionSettingKey,
      actionReportTime: context.actionReportTime,
      syncVersion: context.syncVersion,
      reportContext: context,
    });

    expect(trend).toEqual([
      {
        date: "2026-07-01",
        currency: "VND",
        spend: 200,
        impressions: 1_000,
        linkClicks: 100,
        resultValues: { quality_view: 20 },
        efficiencyValues: { quality_view: 20 },
      },
    ]);
    expect(trend[0]?.resultValues).not.toHaveProperty("impressions");
    expect(trend[0]?.resultValues).not.toHaveProperty("link_click");
    expect(trend[0]?.resultValues).not.toHaveProperty("reach");
  });

  it.each([
    "reporting_snapshot_unavailable",
    "reporting_snapshot_stale",
  ] as const)("returns no trend when the canonical batch is %s", async (reason) => {
    const snapshot = connectedApplicationSnapshot([
      ...DEFAULT_RESULT_DEFINITIONS,
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, {
        objective: "app_promotion",
      }),
      adAccountIds: ["act_1"],
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    databaseMocks.createTrackerRepository.mockResolvedValue({
      listResultMappings: vi.fn().mockResolvedValue([]),
      getCanonicalResultTrend: vi.fn().mockResolvedValue({
        available: false,
        reason,
        results: [],
      }),
    } as unknown as TrackerRepository);

    const trend = await getOverviewTrendForReport({
      snapshot,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      accountMetaIds: context.adAccountIds,
      currency: context.currency,
      syncVersion: context.syncVersion,
      reportContext: context,
    });

    expect(trend).toEqual([]);
  });

  it("accepts an available canonical trend with no rows", async () => {
    const snapshot = connectedApplicationSnapshot([
      ...DEFAULT_RESULT_DEFINITIONS,
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, {
        objective: "app_promotion",
      }),
      adAccountIds: ["act_1"],
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    databaseMocks.createTrackerRepository.mockResolvedValue({
      listResultMappings: vi.fn().mockResolvedValue([]),
      getCanonicalResultTrend: vi.fn().mockResolvedValue({
        available: true,
        syncVersion: "run-1",
        resultMappingVersion: computeResultMappingVersion([]),
        results: [],
      }),
    } as unknown as TrackerRepository);

    const trend = await getOverviewTrendForReport({
      snapshot,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      accountMetaIds: context.adAccountIds,
      currency: context.currency,
      syncVersion: context.syncVersion,
      reportContext: context,
    });

    expect(trend).toEqual([]);
  });

  it("returns only exact-scope delivery trend for all Objectives", async () => {
    const snapshot = connectedApplicationSnapshot([
      ...DEFAULT_RESULT_DEFINITIONS,
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, { objective: "all" }),
      adAccountIds: ["act_1", "act_2"],
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    const getDeliveryTrend = vi.fn().mockResolvedValue([
      {
        metricDate: "2026-07-01",
        currency: "VND",
        spend: 500,
        impressions: 10_000,
        linkClicks: 250,
        installs: 90,
        registrations: 30,
        video3sViews: 0,
        video100Views: 0,
        linkCtr: 2.5,
        cpi: 5.56,
        costPerRegistration: 16.67,
        hookRate: null,
        holdRate: null,
      },
    ]);
    const getCanonicalResultTrend = vi.fn();
    databaseMocks.createTrackerRepository.mockResolvedValue({
      getDeliveryTrend,
      getCanonicalResultTrend,
    } as unknown as TrackerRepository);

    const trend = await getOverviewTrendForReport({
      snapshot,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      accountMetaIds: context.adAccountIds,
      reportContext: context,
    });

    expect(getDeliveryTrend).toHaveBeenCalledWith({
      connectionId: liveConnection.connectionId,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      adAccountMetaIds: ["act_1", "act_2"],
      includeInactiveAccounts: true,
      currency: "VND",
      attributionWindow: context.attributionSettingKey,
      actionReportTime: context.actionReportTime,
      syncVersion: "run-1",
    });
    expect(getCanonicalResultTrend).not.toHaveBeenCalled();
    expect(trend).toEqual([
      {
        date: "2026-07-01",
        currency: "VND",
        spend: 500,
        impressions: 10_000,
        linkClicks: 250,
        resultValues: {},
        efficiencyValues: {},
      },
    ]);
  });

  it("keeps verified delivery points when no selected Result row exists", async () => {
    const definitions = DEFAULT_RESULT_DEFINITIONS.map((definition) =>
      definition.canonicalKey === "impressions" ||
      definition.canonicalKey === "link_click"
        ? { ...definition, enabled: false }
        : definition,
    );
    const snapshot = connectedApplicationSnapshot(definitions);
    const context = {
      ...resolveApplicationReportContext(snapshot, { objective: "traffic" }),
      adAccountIds: ["act_1"],
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    databaseMocks.createTrackerRepository.mockResolvedValue({
      listResultMappings: vi.fn().mockResolvedValue([]),
      getCanonicalResultTrend: vi.fn().mockResolvedValue({
        available: true,
        syncVersion: "run-1",
        resultMappingVersion: computeResultMappingVersion([]),
        results: [
          {
            metricDate: "2026-07-01",
            canonicalResultKey: "impressions",
            objectiveKey: "traffic",
            metricSource: "delivery",
            currency: "VND",
            value: 1_000,
            dailySpend: 250,
          },
          {
            metricDate: "2026-07-01",
            canonicalResultKey: "link_click",
            objectiveKey: "traffic",
            metricSource: "delivery",
            currency: "VND",
            value: 50,
            dailySpend: 250,
          },
        ],
      }),
    } as unknown as TrackerRepository);

    const trend = await getOverviewTrendForReport({
      snapshot,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      accountMetaIds: context.adAccountIds,
      currency: context.currency,
      reportContext: context,
    });

    expect(trend).toEqual([
      {
        date: "2026-07-01",
        currency: "VND",
        spend: 250,
        impressions: 1_000,
        linkClicks: 50,
        resultValues: {},
        efficiencyValues: {},
      },
    ]);
  });
});

describe("application canonical Result mapping hydration", () => {
  it("returns definitions hydrated from the same persisted mapping version", async () => {
    const snapshot = connectedApplicationSnapshot([
      runtimeSalesValueDefinition,
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, {
        objective: "sales",
      }),
      adAccountIds: ["act_1"],
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    const { repository } = canonicalReportRepository({
      definitions: [runtimeSalesValueDefinition],
      mappings: [runtimeSalesValueActionMapping],
      results: [
        {
          canonicalResultKey: "runtime_sales_value",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "VND",
          value: 3,
          objectiveSpend: 300,
        },
      ],
    });

    const result = await getCanonicalResultsForReport({
      snapshot,
      context,
      repository,
    });

    expect(result.definitions).toEqual([
      expect.objectContaining({
        canonicalKey: "runtime_sales_value",
        rawActionTypes: ["purchase"],
        rawValueActionTypes: [],
      }),
    ]);
    expect(result.values).toEqual([
      expect.objectContaining({
        canonicalKey: "runtime_sales_value",
        value: 3,
      }),
    ]);
  });

  it("uses only the owner-remapped metric source for headline totals", async () => {
    const snapshot = connectedApplicationSnapshot([
      runtimeSalesValueDefinition,
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, {
        objective: "sales",
      }),
      adAccountIds: ["act_1"],
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    const { repository } = canonicalReportRepository({
      definitions: [runtimeSalesValueDefinition],
      mappings: [runtimeSalesValueActionMapping],
      results: [
        {
          canonicalResultKey: "runtime_sales_value",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "VND",
          value: 3,
          objectiveSpend: 300,
        },
        {
          canonicalResultKey: "runtime_sales_value",
          objectiveKey: "sales",
          metricSource: "action_value",
          currency: "VND",
          value: 900,
          objectiveSpend: 300,
        },
      ],
    });

    const result = await getCanonicalResultsForReport({
      snapshot,
      context,
      repository,
    });

    expect(result.values).toEqual([
      expect.objectContaining({
        canonicalKey: "runtime_sales_value",
        value: 3,
      }),
    ]);
  });

  it("fails closed when a Result is mapped to both metric sources", async () => {
    const snapshot = connectedApplicationSnapshot([
      runtimeSalesValueDefinition,
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, {
        objective: "sales",
      }),
      adAccountIds: ["act_1"],
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    const { repository } = canonicalReportRepository({
      definitions: [runtimeSalesValueDefinition],
      mappings: [
        runtimeSalesValueActionMapping,
        runtimeSalesValueActionValueMapping,
      ],
      results: [
        {
          canonicalResultKey: "runtime_sales_value",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "VND",
          value: 3,
          objectiveSpend: 300,
        },
        {
          canonicalResultKey: "runtime_sales_value",
          objectiveKey: "sales",
          metricSource: "action_value",
          currency: "VND",
          value: 900,
          objectiveSpend: 300,
        },
      ],
    });

    const result = await getCanonicalResultsForReport({
      snapshot,
      context,
      repository,
    });

    expect(result.values).toEqual([
      expect.objectContaining({
        canonicalKey: "runtime_sales_value",
        value: null,
        hasData: false,
      }),
    ]);
  });
});

describe("application canonical Result registry fallback", () => {
  it("keeps snapshot definitions when a canonical snapshot is unavailable", async () => {
    const snapshot = {
      ...connectedApplicationSnapshot([runtimeSalesValueDefinition]),
      authenticated: false,
      connection: null,
    };
    const context = resolveApplicationReportContext(snapshot, {
      objective: "sales",
    });

    const result = await getCanonicalResultsForReport({
      snapshot,
      context,
    });

    expect(result.state).toBe("unavailable");
    expect(result.definitions).toEqual([runtimeSalesValueDefinition]);
  });

  it("keeps snapshot definitions when the canonical query fails", async () => {
    const snapshot = connectedApplicationSnapshot([
      runtimeSalesValueDefinition,
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, {
        objective: "sales",
      }),
      adAccountIds: ["act_1"],
    };
    const repository = {
      listResultDefinitions: vi
        .fn()
        .mockRejectedValue(new Error("registry unavailable")),
      listResultMappings: vi.fn().mockResolvedValue([]),
    } as unknown as TrackerRepository;
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await getCanonicalResultsForReport({
      snapshot,
      context,
      repository,
    });

    expect(result.state).toBe("unavailable");
    expect(result.definitions).toEqual([runtimeSalesValueDefinition]);
    expect(consoleError).toHaveBeenCalledWith(
      "[canonical-results-fallback]",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});

describe("canonical Result batch availability and Objective Spend", () => {
  it.each([
    "reporting_snapshot_unavailable",
    "reporting_snapshot_stale",
  ] as const)("surfaces %s as unavailable instead of an empty live report", async (reason) => {
    const snapshot = connectedApplicationSnapshot([
      runtimeSalesValueDefinition,
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, { objective: "sales" }),
      adAccountIds: ["act_1"],
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    const { repository } = canonicalReportRepository({
      definitions: [runtimeSalesValueDefinition],
      canonicalTotals: {
        available: false,
        reason,
        results: [],
        spendByObjective: [],
      },
    });

    const result = await getCanonicalResultsForReport({
      snapshot,
      context,
      repository,
    });

    expect(result).toMatchObject({
      state: "unavailable",
      values: [],
      objectiveSpendByObjective: {},
      periodReach: null,
      periodReachUnavailableReason: "exact_snapshot_unavailable",
    });
    expect(result.warning).not.toBeNull();
  });

  it("accepts an available canonical batch with no facts", async () => {
    const snapshot = connectedApplicationSnapshot([
      runtimeSalesValueDefinition,
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, { objective: "sales" }),
      adAccountIds: ["act_1"],
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    const { repository } = canonicalReportRepository({
      definitions: [runtimeSalesValueDefinition],
    });

    const result = await getCanonicalResultsForReport({
      snapshot,
      context,
      repository,
    });

    expect(result.state).toBe("live");
    expect(result.warning).toBeNull();
    expect(result.values).toEqual([
      expect.objectContaining({
        canonicalKey: "runtime_sales_value",
        objectiveKey: "sales",
        value: null,
      }),
    ]);
  });

  it("keeps Objective Spend sections when every stored Result is disabled", async () => {
    const snapshot = connectedApplicationSnapshot([]);
    const context = {
      ...resolveApplicationReportContext(snapshot, { objective: "all" }),
      adAccountIds: ["act_1"],
      currency: "VND",
      currencyMode: "single" as const,
      syncVersion: "run-1",
    };
    const { repository } = canonicalReportRepository({
      definitions: [{ ...runtimeSalesValueDefinition, enabled: false }],
      spendByObjective: [
        { objectiveKey: "awareness", currency: "VND", spend: 100 },
        { objectiveKey: "traffic", currency: "VND", spend: 200 },
      ],
    });

    const result = await getCanonicalResultsForReport({
      snapshot,
      context,
      repository,
    });
    const model = buildApplicationResultMetrics({
      context,
      delivery: [],
      definitions: result.definitions,
      canonicalResults: result.values,
      objectiveSpendByObjective: result.objectiveSpendByObjective,
      periodReach: result.periodReach,
    });

    expect(result.objectiveSpendByObjective).toEqual({
      awareness: 100,
      traffic: 200,
    });
    expect(model.crossObjectiveSections).toEqual([
      expect.objectContaining({
        objectiveKey: "awareness",
        spend: 100,
        results: [],
      }),
      expect.objectContaining({
        objectiveKey: "traffic",
        spend: 200,
        results: [],
      }),
    ]);
  });

  it("does not combine Objective Spend across currencies in split mode", async () => {
    const snapshot = connectedApplicationSnapshot([]);
    const context = {
      ...resolveApplicationReportContext(snapshot, { objective: "all" }),
      adAccountIds: ["act_1"],
      currency: "",
      currencyMode: "split" as const,
      syncVersion: "run-1",
    };
    const { repository } = canonicalReportRepository({
      definitions: [{ ...runtimeSalesValueDefinition, enabled: false }],
      spendByObjective: [
        { objectiveKey: "awareness", currency: "VND", spend: 100 },
        { objectiveKey: "awareness", currency: "USD", spend: 5 },
        { objectiveKey: "traffic", currency: "VND", spend: 200 },
      ],
    });

    const result = await getCanonicalResultsForReport({
      snapshot,
      context,
      repository,
    });

    expect(result.objectiveSpendByObjective).toEqual({
      awareness: null,
      traffic: null,
    });
  });
});

describe("canonical period Reach scope", () => {
  it("reads the exact account snapshot for an all-Objective report", async () => {
    const snapshot = connectedApplicationSnapshot([
      ...DEFAULT_RESULT_DEFINITIONS,
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, { objective: "all" }),
      adAccountIds: ["act_1"],
    };
    const { repository, getPeriodReach } = canonicalReportRepository({
      definitions: [...DEFAULT_RESULT_DEFINITIONS],
    });

    const result = await getCanonicalResultsForReport({
      snapshot,
      context,
      repository,
    });

    expect(result.periodReach).toBe(8_000);
    expect(result.periodReachUnavailableReason).toBeNull();
    expect(getPeriodReach).toHaveBeenCalledOnce();
    expect(getPeriodReach.mock.calls[0]?.[0]).not.toHaveProperty(
      "campaignIds",
    );
  });

  it("does not overlay account Reach onto a single-Objective report", async () => {
    const snapshot = connectedApplicationSnapshot([
      ...DEFAULT_RESULT_DEFINITIONS,
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, {
        objective: "awareness",
      }),
      adAccountIds: ["act_1"],
    };
    const { repository, getPeriodReach } = canonicalReportRepository({
      definitions: [...DEFAULT_RESULT_DEFINITIONS],
    });

    const result = await getCanonicalResultsForReport({
      snapshot,
      context,
      repository,
    });
    const model = buildApplicationResultMetrics({
      context,
      delivery: [
        {
          operatingSystem: "UNKNOWN",
          currency: "VND",
          spend: 1_000,
          impressions: 10_000,
          linkClicks: 500,
          installs: 0,
          registrations: 0,
          video3sViews: 0,
          video100Views: 0,
          metricDays: 30,
        },
      ],
      definitions: result.definitions,
      canonicalResults: result.values,
      periodReach: result.periodReach,
    });

    expect(getPeriodReach).not.toHaveBeenCalled();
    expect(result.periodReach).toBeNull();
    expect(result.periodReachUnavailableReason).toBe(
      "objective_scope_exact_reach_unavailable",
    );
    expect(model.kpiCards.find((card) => card.key === "reach")).toMatchObject({
      value: null,
    });
  });

  it("reads an exact campaign snapshot when one campaign is selected", async () => {
    const snapshot = connectedApplicationSnapshot([
      ...DEFAULT_RESULT_DEFINITIONS,
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, {
        objective: "awareness",
      }),
      adAccountIds: ["act_1"],
    };
    const { repository, getPeriodReach } = canonicalReportRepository({
      definitions: [...DEFAULT_RESULT_DEFINITIONS],
      periodReach: {
        available: true,
        scopeLevel: "campaign",
        adAccountId: "act_1",
        campaignId: "campaign_1",
        reach: 4_200,
        dateFrom: context.dateFrom,
        dateTo: context.dateTo,
        attributionWindow: context.attributionSettingKey,
        actionReportTime: context.actionReportTime,
        syncVersion: context.syncVersion,
      },
    });

    const result = await getCanonicalResultsForReport({
      snapshot,
      context,
      campaignMetaIds: [" campaign_1 "],
      repository,
    });

    expect(result.periodReach).toBe(4_200);
    expect(getPeriodReach).toHaveBeenCalledWith(
      expect.objectContaining({ campaignIds: ["campaign_1"] }),
    );
  });

  it("marks multi-campaign Reach unavailable without querying a union", async () => {
    const snapshot = connectedApplicationSnapshot([
      ...DEFAULT_RESULT_DEFINITIONS,
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, { objective: "all" }),
      adAccountIds: ["act_1"],
    };
    const { repository, getPeriodReach } = canonicalReportRepository({
      definitions: [...DEFAULT_RESULT_DEFINITIONS],
    });

    const result = await getCanonicalResultsForReport({
      snapshot,
      context,
      campaignMetaIds: ["campaign_1", "campaign_2"],
      repository,
    });

    expect(getPeriodReach).not.toHaveBeenCalled();
    expect(result.periodReach).toBeNull();
    expect(result.periodReachUnavailableReason).toBe(
      "multi_campaign_overlap_unsafe",
    );
  });
});

describe("canonical delivery-native Result rows", () => {
  const deliveryRows: CanonicalResultTotal[] = [
    {
      canonicalResultKey: "impressions",
      objectiveKey: "awareness",
      metricSource: "delivery",
      currency: "VND",
      value: 10_000,
      objectiveSpend: 1_000,
    },
    {
      canonicalResultKey: "link_click",
      objectiveKey: "traffic",
      metricSource: "delivery",
      currency: "VND",
      value: 500,
      objectiveSpend: 1_000,
    },
  ];

  it("ignores delivery rows when their entire stored registry is disabled", async () => {
    const disabledDefinitions = [
      { ...runtimeSalesValueDefinition, enabled: false },
    ];
    const snapshot = connectedApplicationSnapshot([]);
    const context = {
      ...resolveApplicationReportContext(snapshot, { objective: "all" }),
      adAccountIds: ["act_1"],
    };
    const { repository } = canonicalReportRepository({
      definitions: disabledDefinitions,
      results: deliveryRows,
    });

    const result = await getCanonicalResultsForReport({
      snapshot,
      context,
      repository,
    });

    expect(result.state).toBe("live");
    expect(result.definitions).toEqual([]);
    expect(result.values).toEqual([]);
    expect(result.warning).toBeNull();
  });

  it("ignores default delivery rows for a custom-only registry", async () => {
    const snapshot = connectedApplicationSnapshot([
      runtimeSalesValueDefinition,
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, { objective: "all" }),
      adAccountIds: ["act_1"],
    };
    const { repository } = canonicalReportRepository({
      definitions: [runtimeSalesValueDefinition],
      results: deliveryRows,
    });

    const result = await getCanonicalResultsForReport({
      snapshot,
      context,
      repository,
    });

    expect(result.warning).toBeNull();
    expect(result.values).toEqual([
      expect.objectContaining({
        canonicalKey: "runtime_sales_value",
        objectiveKey: "sales",
        value: null,
      }),
    ]);
  });

  it("still warns for unknown action and action-value rows", async () => {
    const snapshot = connectedApplicationSnapshot([
      runtimeSalesValueDefinition,
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, { objective: "all" }),
      adAccountIds: ["act_1"],
    };
    const { repository } = canonicalReportRepository({
      definitions: [runtimeSalesValueDefinition],
      results: [
        ...deliveryRows,
        {
          canonicalResultKey: "retired_purchase",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "VND",
          value: 3,
          objectiveSpend: 1_000,
        },
        {
          canonicalResultKey: "retired_purchase_value",
          objectiveKey: "sales",
          metricSource: "action_value",
          currency: "VND",
          value: 900,
          objectiveSpend: 1_000,
        },
      ],
    });

    const result = await getCanonicalResultsForReport({
      snapshot,
      context,
      repository,
    });

    expect(result.warning).not.toBeNull();
  });
});

describe("operational Live Delivery boundary", () => {
  it("uses only the connected owner and final account scope, not historical filters", async () => {
    const snapshot = connectedApplicationSnapshot([
      ...DEFAULT_RESULT_DEFINITIONS,
    ]);
    const context = {
      ...resolveApplicationReportContext(snapshot, {
        from: "2026-07-01",
        to: "2026-07-30",
        objective: "sales",
        currency: "VND",
        attribution: "7d_click_1d_view",
        action_report_time: "conversion",
        sync_version: "historical-run",
      }),
      adAccountIds: ["act_1", "act_2"],
    };
    const summary = {
      state: "ready",
      selectedAccountCount: 2,
    } as LiveDeliverySummary;
    const repository = {
      getLiveDeliverySummary: vi.fn().mockResolvedValue(summary),
    };

    await expect(
      getLiveDeliveryForReport({
        snapshot,
        context,
        repository,
      }),
    ).resolves.toBe(summary);
    expect(repository.getLiveDeliverySummary).toHaveBeenCalledWith({
      connectionId: liveConnection.connectionId,
      selectedAdAccountMetaIds: ["act_1", "act_2"],
      freshnessThresholdDays: 2,
    });
  });
});

describe("all-Objective delivery-backed Result pipeline", () => {
  it("keeps global delivery KPIs without overwriting per-Objective Result sections", () => {
    const context = resolveApplicationReportContext(
      applicationSnapshot([...DEFAULT_RESULT_DEFINITIONS]),
      { objective: "all" },
    );

    const model = buildApplicationResultMetrics({
      context,
      delivery: [
        {
          operatingSystem: "UNKNOWN",
          currency: "VND",
          spend: 1_000,
          impressions: 10_000,
          linkClicks: 500,
          installs: 0,
          registrations: 0,
          video3sViews: 0,
          video100Views: 0,
          metricDays: 30,
        },
      ],
      definitions: DEFAULT_RESULT_DEFINITIONS,
      canonicalResults: [
        {
          canonicalKey: "reach",
          objectiveKey: "awareness",
          value: null,
          configured: true,
          hasData: false,
        },
        {
          canonicalKey: "link_click",
          objectiveKey: "traffic",
          value: null,
          configured: true,
          hasData: false,
        },
      ],
      periodReach: 8_000,
    });

    expect(
      model.kpiCards.find((card) => card.key === "reach"),
    ).toMatchObject({ value: 8_000 });
    expect(
      model.crossObjectiveSections
        .find((section) => section.objectiveKey === "awareness")
        ?.results.find((result) => result.canonicalKey === "reach"),
    ).toMatchObject({ value: null });
    expect(
      model.crossObjectiveSections
        .find((section) => section.objectiveKey === "traffic")
        ?.results.find((result) => result.canonicalKey === "link_click"),
    ).toMatchObject({ value: null });
  });
});
