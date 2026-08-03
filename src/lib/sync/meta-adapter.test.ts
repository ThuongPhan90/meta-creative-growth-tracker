import type { TrackerRepository } from "@/lib/db/repository";
import { computeResultMappingVersion } from "@/lib/db/result-mapping-version";
import type {
  AdCreativeLinkInput,
  DailyMetricInput,
  DatabaseId,
  MetaConnectionSecretRecord,
  PeriodReachSnapshotInput,
  TrackerSettings,
} from "@/lib/db/types";
import { MetaGraphApiError } from "@/lib/meta/client";
import type { MetaGraphQuery, MetaInsightRow } from "@/lib/meta/types";
import {
  DEFAULT_RESULT_DEFINITIONS,
  type PersistedResultMapping,
  type ResultDefinition,
} from "@/lib/reporting/result-definition";
import {
  encryptMetaToken,
  TokenEncryptionError,
} from "@/lib/security/encryption";
import { describe, expect, it, vi } from "vitest";

import type { MetaSyncStageContext } from "./contracts";
import {
  actionMappingVersion,
  chooseInsightAllocation,
  createStoredMetaSyncAdapter,
  exactCoverageMatches,
  extractPhysicalCreativeAssets,
  MetaMarketingApiSyncAdapter,
  resolveThreeSecondVideoActions,
  type MetaGraphReadClient,
} from "./meta-adapter";

function idMap<T>(
  values: readonly T[],
  key: (value: T) => string,
  prefix: string,
): Map<string, DatabaseId> {
  return new Map(values.map((value) => [key(value), `${prefix}:${key(value)}`]));
}

function settings(): TrackerSettings {
  return {
    ownerId: 1,
    reportingTimezone: "Asia/Ho_Chi_Minh",
    reportingCurrency: "USD",
    syncLookbackDays: 30,
    minimumInstallThreshold: 20,
    minimumRegistrationThreshold: 10,
    benchmarkMode: "os",
    benchmarkWindowDays: 30,
    benchmarkByOs: true,
    benchmarkByFormat: true,
    numberFormat: "vi-VN",
    compareDefault: "previous_period",
    scoringWeights: { cpi: 40, cpa: 40, hook: 10, hold: 10 },
    syncCadence: "deployment",
    alertChannel: "none",
    installActionTypes: [
      "mobile_app_install",
      "omni_app_install",
      "app_install",
    ],
    registrationActionTypes: ["complete_registration"],
    metricDisplayPresets: { version: 1, presets: {} },
    lastInitialSyncAt: null,
    updatedAt: "2026-07-23T00:00:00.000Z",
  };
}

const actionMapping = {
  installs: {
    actionTypes: ["mobile_app_install"],
    strategy: "first-match" as const,
  },
  registrations: {
    actionTypes: ["complete_registration"],
    strategy: "first-match" as const,
  },
};

function defaultResultMappings(): PersistedResultMapping[] {
  let id = 0;
  return DEFAULT_RESULT_DEFINITIONS.flatMap((definition) => [
    ...definition.rawActionTypes.map((rawActionType, priority) => ({
      id: `mapping-${++id}`,
      canonicalResultKey: definition.canonicalKey,
      rawActionType,
      metricSource: "action" as const,
      priority,
      mappingSource: "system" as const,
      enabled: true,
    })),
    ...(definition.rawValueActionTypes ?? []).map(
      (rawActionType, priority) => ({
        id: `mapping-${++id}`,
        canonicalResultKey: definition.canonicalKey,
        rawActionType,
        metricSource: "action_value" as const,
        priority,
        mappingSource: "system" as const,
        enabled: true,
      }),
    ),
  ]);
}

const DEFAULT_RESULT_MAPPING_VERSION = computeResultMappingVersion(
  defaultResultMappings(),
);

describe("exactCoverageMatches", () => {
  const primary: MetaInsightRow[] = [
    {
      ad_id: "ad-1",
      date_start: "2026-07-20",
      account_currency: "USD",
      impression_device: "android_smartphone",
      spend: "10",
      impressions: "100",
      inline_link_clicks: "8",
      actions: [
        { action_type: "mobile_app_install", value: "5" },
        { action_type: "complete_registration", value: "2" },
      ],
    },
  ];

  it("accepts only asset rows that preserve delivery dimensions and core actions", () => {
    const exact: MetaInsightRow[] = [
      {
        ...primary[0],
        image_asset: { id: "hash-1" },
        spend: "6",
        impressions: "60",
        inline_link_clicks: "5",
        actions: [
          { action_type: "mobile_app_install", value: "3" },
          { action_type: "complete_registration", value: "1" },
        ],
      },
      {
        ...primary[0],
        image_asset: { id: "hash-2" },
        spend: "4",
        impressions: "40",
        inline_link_clicks: "3",
        actions: [
          { action_type: "mobile_app_install", value: "2" },
          { action_type: "complete_registration", value: "1" },
        ],
      },
    ];

    expect(exactCoverageMatches(primary, exact, actionMapping)).toBe(true);
  });

  it("rejects exact rows that drop OS dimensions or conversion actions", () => {
    const missingDevice: MetaInsightRow[] = [
      {
        ...primary[0],
        impression_device: undefined,
        image_asset: { id: "hash-1" },
      },
    ];
    const missingInstalls: MetaInsightRow[] = [
      {
        ...primary[0],
        image_asset: { id: "hash-1" },
        actions: [
          { action_type: "mobile_app_install", value: "4" },
          { action_type: "complete_registration", value: "2" },
        ],
      },
    ];

    expect(
      exactCoverageMatches(primary, missingDevice, actionMapping),
    ).toBe(false);
    expect(
      exactCoverageMatches(primary, missingInstalls, actionMapping),
    ).toBe(false);
  });
});

describe("resolveThreeSecondVideoActions", () => {
  it("uses actions.video_view even when legacy and video-start fields are present", () => {
    expect(
      resolveThreeSecondVideoActions({
        actions: [{ action_type: "video_view", value: "11" }],
        video_play_actions: [
          { action_type: "video_view", value: "15" },
        ],
        video_3_sec_watched_actions: [
          { action_type: "video_view", value: "99" },
        ],
      }),
    ).toEqual({
      actions: [{ action_type: "video_view", value: "11" }],
      source: "actions.video_view",
    });
  });

  it("falls back to the legacy field but never treats video starts as 3-second views", () => {
    expect(
      resolveThreeSecondVideoActions({
        video_3_sec_watched_actions: [
          { action_type: "video_view", value: "7" },
        ],
      }),
    ).toMatchObject({
      source: "legacy.video_3_sec_watched_actions",
    });
    expect(
      resolveThreeSecondVideoActions({
        video_play_actions: [
          { action_type: "video_view", value: "15" },
        ],
      }),
    ).toEqual({
      actions: [],
      source: "unavailable",
    });
  });
});

describe("actionMappingVersion", () => {
  it("is deterministic and changes when first-match precedence changes", () => {
    const version = actionMappingVersion(actionMapping);

    expect(actionMappingVersion(actionMapping)).toBe(version);
    expect(version).toMatch(/^settings-first-match-v1:[a-f0-9]{16}$/);
    expect(
      actionMappingVersion({
        ...actionMapping,
        installs: {
          ...actionMapping.installs,
          actionTypes: ["omni_app_install", "mobile_app_install"],
        },
      }),
    ).not.toBe(version);
  });
});

function repositoryHarness(): {
  repository: TrackerRepository;
  metricBatches: DailyMetricInput[][];
  publishCalls: {
    connectionId: DatabaseId;
    syncRunId: DatabaseId;
    resultMappingVersion: string;
    periodReachSnapshots: PeriodReachSnapshotInput[];
    replacements: {
      adAccountId: DatabaseId;
      dateFrom: string;
      dateTo: string;
      metrics: DailyMetricInput[];
    }[];
  }[];
  reconciledAccounts: DatabaseId[];
  adCreativeReplacementScopes: DatabaseId[][];
  adCreativeReplacementLinks: AdCreativeLinkInput[][];
} {
  const metricBatches: DailyMetricInput[][] = [];
  const publishCalls: {
    connectionId: DatabaseId;
    syncRunId: DatabaseId;
    resultMappingVersion: string;
    periodReachSnapshots: PeriodReachSnapshotInput[];
    replacements: {
      adAccountId: DatabaseId;
      dateFrom: string;
      dateTo: string;
      metrics: DailyMetricInput[];
    }[];
  }[] = [];
  const reconciledAccounts: DatabaseId[] = [];
  const adCreativeReplacementScopes: DatabaseId[][] = [];
  const adCreativeReplacementLinks: AdCreativeLinkInput[][] = [];
  const repository = {
    getSettings: async () => settings(),
    listResultDefinitions: async (): Promise<ResultDefinition[]> =>
      DEFAULT_RESULT_DEFINITIONS.map((definition) => ({
        ...definition,
        objectiveKeys: [...definition.objectiveKeys],
        rawActionTypes: [...definition.rawActionTypes],
        rawValueActionTypes: [
          ...(definition.rawValueActionTypes ?? []),
        ],
      })),
    listResultMappings: async () => defaultResultMappings(),
    updateConnectionHealth: async () => undefined,
    upsertBusinesses: async (
      _connectionId: DatabaseId,
      values: readonly { metaBusinessId: string }[],
    ) => idMap(values, (value) => value.metaBusinessId, "business"),
    upsertAdAccounts: async (
      _connectionId: DatabaseId,
      values: readonly { metaAdAccountId: string }[],
    ) => idMap(values, (value) => value.metaAdAccountId, "account"),
    upsertPages: async (
      _connectionId: DatabaseId,
      values: readonly { metaPageId: string }[],
    ) => idMap(values, (value) => value.metaPageId, "page"),
    upsertApps: async (
      _connectionId: DatabaseId,
      values: readonly { metaAppId: string }[],
    ) => idMap(values, (value) => value.metaAppId, "app"),
    linkBusinessAdAccounts: async () => undefined,
    linkBusinessPages: async () => undefined,
    linkBusinessApps: async () => undefined,
    reconcileConnectionInventory: async () => undefined,
    reconcileAdAccountInventory: async (input: {
      adAccountId: DatabaseId;
    }) => {
      reconciledAccounts.push(input.adAccountId);
    },
    reconcileConnectionCreativeInventory: async () => undefined,
    upsertCampaigns: async (
      _accountId: DatabaseId,
      values: readonly { metaCampaignId: string }[],
    ) => idMap(values, (value) => value.metaCampaignId, "campaign"),
    upsertAdSets: async (
      _accountId: DatabaseId,
      values: readonly { metaAdSetId: string }[],
    ) => idMap(values, (value) => value.metaAdSetId, "adset"),
    upsertAds: async (
      _accountId: DatabaseId,
      values: readonly { metaAdId: string }[],
    ) => idMap(values, (value) => value.metaAdId, "ad"),
    upsertCreatives: async (
      _connectionId: DatabaseId,
      values: readonly { metaCreativeId: string }[],
    ) => idMap(values, (value) => value.metaCreativeId, "creative"),
    upsertCreativeAssets: async (
      _connectionId: DatabaseId,
      values: readonly { assetKey: string }[],
    ) => idMap(values, (value) => value.assetKey, "asset"),
    replaceCreativeAssetLinks: async () => undefined,
    replaceAdCreativeLinks: async (
      adIds: readonly DatabaseId[],
      links: readonly AdCreativeLinkInput[],
    ) => {
      adCreativeReplacementScopes.push([...adIds]);
      adCreativeReplacementLinks.push([...links]);
    },
    publishDailyMetricWindows: async (input: {
      connectionId: DatabaseId;
      syncRunId: DatabaseId;
      resultMappingVersion: string;
      periodReachSnapshots: readonly PeriodReachSnapshotInput[];
      replacements: readonly {
        adAccountId: DatabaseId;
        dateFrom: string;
        dateTo: string;
        metrics: readonly DailyMetricInput[];
      }[];
    }) => {
      const replacements = input.replacements.map((replacement) => ({
        ...replacement,
        metrics: [...replacement.metrics],
      }));
      publishCalls.push({
        connectionId: input.connectionId,
        syncRunId: input.syncRunId,
        resultMappingVersion: input.resultMappingVersion,
        periodReachSnapshots: [...input.periodReachSnapshots],
        replacements,
      });
      const metrics = replacements.flatMap(
        (replacement) => replacement.metrics,
      );
      if (metrics.length > 0) {
        metricBatches.push(metrics);
      }
      return metrics.length;
    },
  };
  return {
    repository: repository as unknown as TrackerRepository,
    metricBatches,
    publishCalls,
    reconciledAccounts,
    adCreativeReplacementScopes,
    adCreativeReplacementLinks,
  };
}

function context(repository: TrackerRepository): MetaSyncStageContext {
  return {
    connectionId: "connection:1",
    syncRunId: "run:1",
    syncKind: "full",
    window: {
      dateFrom: "2026-07-20",
      dateTo: "2026-07-21",
    },
    repository,
    reportProgress: async () => undefined,
  };
}

function singleAccountSyncClient(input: {
  dailyRows: readonly MetaInsightRow[];
  accountPeriodRows?: readonly MetaInsightRow[];
  campaignPeriodRows?: readonly MetaInsightRow[];
  insightQueries?: MetaGraphQuery[];
  assetInsightsError?: Error;
  assetRows?: readonly MetaInsightRow[];
}): MetaGraphReadClient {
  const inventory: Record<string, unknown[]> = {
    "me/businesses": [],
    "me/adaccounts": [
      {
        id: "act_100",
        account_id: "100",
        name: "Account",
        currency: "USD",
        timezone_name: "Asia/Ho_Chi_Minh",
      },
    ],
    "me/accounts": [],
    "act_100/campaigns": [
      { id: "campaign-1", name: "Campaign" },
    ],
    "act_100/adsets": [
      {
        id: "adset-1",
        campaign_id: "campaign-1",
        name: "Ad set",
      },
    ],
    "act_100/ads": [
      {
        id: "ad-1",
        campaign_id: "campaign-1",
        adset_id: "adset-1",
        name: "Ad",
        creative: { id: "creative-1" },
      },
    ],
    "act_100/adcreatives": [
      {
        id: "creative-1",
        name: "Creative",
        image_hash: "image-1",
      },
    ],
  };

  return {
    request: async <T>(path: string) => {
      throw new Error(`Unexpected request path: ${path}`) as never as T;
    },
    getAll: async <T>(path: string, query: MetaGraphQuery = {}) => {
      if (path === "act_100/insights") {
        input.insightQueries?.push(query);
        if (query.level === "account") {
          return (input.accountPeriodRows ?? [
            {
              date_start: "2026-07-20",
              date_stop: "2026-07-21",
              account_id: "100",
              attribution_setting: "7d_click_1d_view",
              reach: "80",
            },
          ]) as T[];
        }
        if (query.level === "campaign") {
          return (input.campaignPeriodRows ?? [
            {
              date_start: "2026-07-20",
              date_stop: "2026-07-21",
              account_id: "100",
              campaign_id: "campaign-1",
              attribution_setting: "7d_click_1d_view",
              reach: "70",
            },
          ]) as T[];
        }
        const breakdowns = Array.isArray(query.breakdowns)
          ? query.breakdowns
          : [];
        if (
          breakdowns.includes("image_asset") ||
          breakdowns.includes("video_asset")
        ) {
          if (input.assetInsightsError) {
            throw input.assetInsightsError;
          }
          return [...(input.assetRows ?? [])] as T[];
        }
        return [...input.dailyRows] as T[];
      }
      if (!(path in inventory)) {
        throw new Error(`Unexpected collection path: ${path}`);
      }
      return inventory[path] as T[];
    },
  };
}

describe("extractPhysicalCreativeAssets", () => {
  it("finds static, object-story, carousel, and dynamic physical identities", () => {
    const assets = extractPhysicalCreativeAssets({
      id: "creative-1",
      name: "Creative",
      image_hash: "top-thumbnail-is-not-an-asset",
      video_id: "video-top",
      object_story_spec: {
        video_data: {
          video_id: "video-story",
          image_hash: "story-thumbnail-is-not-an-asset",
        },
        link_data: {
          child_attachments: [
            { image_hash: "carousel-image" },
            {
              video_id: "carousel-video",
              image_hash: "carousel-video-thumbnail",
            },
          ],
        },
      },
      asset_feed_spec: {
        images: [{ hash: "feed-image" }, { hash: "carousel-image" }],
        videos: [{ video_id: "feed-video" }],
      },
    });

    expect(assets.map((asset) => asset.input.assetKey)).toEqual([
      "image:feed-image",
      "image:carousel-image",
      "video:feed-video",
      "video:video-story",
      "video:carousel-video",
      "video:video-top",
    ]);
    expect(
      assets.map((asset) => asset.input.assetKey),
    ).not.toContain("image:top-thumbnail-is-not-an-asset");
    expect(
      assets.map((asset) => asset.input.assetKey),
    ).not.toContain("image:story-thumbnail-is-not-an-asset");
  });

  it("uses a stable unknown wrapper key when Meta exposes no physical ID", () => {
    expect(
      extractPhysicalCreativeAssets({
        id: "creative-without-media-id",
        name: "Unresolved",
      }),
    ).toMatchObject([
      {
        source: "unknown",
        input: {
          assetKey: "unknown:creative:creative-without-media-id",
          assetType: "unknown",
        },
      },
    ]);
  });
});

describe("chooseInsightAllocation", () => {
  const candidates = [
    {
      creativeId: "creative:1",
      creativeAssetId: "asset:video:1",
      assetKey: "video:1",
      assetType: "video" as const,
      metaVideoId: "1",
    },
    {
      creativeId: "creative:1",
      creativeAssetId: "asset:image:2",
      assetKey: "image:2",
      assetType: "image" as const,
      metaImageHash: "2",
    },
  ];

  it("keeps a dynamic multi-asset ad unallocated", () => {
    expect(
      chooseInsightAllocation({}, "ad:10", candidates),
    ).toEqual({
      metricScope: "ad",
      allocationMethod: "unallocated",
      scopeKey: "ad:10",
      creativeId: null,
      creativeAssetId: null,
    });
  });

  it("uses an exact physical ID without copying spend to sibling assets", () => {
    expect(
      chooseInsightAllocation(
        { video_id: "1" },
        "ad:10",
        candidates,
      ),
    ).toMatchObject({
      metricScope: "asset",
      allocationMethod: "exact",
      scopeKey: "video:1",
      creativeAssetId: "asset:video:1",
    });
  });
});

describe("MetaMarketingApiSyncAdapter", () => {
  it("marks an invalid token for reauthorization", async () => {
    const healthUpdates: unknown[] = [];
    const repository = {
      updateConnectionHealth: async (update: unknown) => {
        healthUpdates.push(update);
      },
    } as unknown as TrackerRepository;
    const client: MetaGraphReadClient = {
      request: async () => {
        throw new MetaGraphApiError(
          { code: 190, error_subcode: 463 },
          {
            httpStatus: 400,
            retryAfterMs: null,
            requestPath: "/v24.0/me",
          },
        );
      },
      getAll: async () => [],
    };
    const adapter = new MetaMarketingApiSyncAdapter({ client });

    await expect(adapter.validate(context(repository))).rejects.toMatchObject({
      code: "META_TOKEN_INVALID",
      retryable: false,
    });
    expect(healthUpdates).toEqual([
      expect.objectContaining({
        status: "needs_reauth",
        errorCode: "META_TOKEN_INVALID",
      }),
    ]);
  });

  it("requires reauthorization when a required read permission is missing", async () => {
    const healthUpdates: unknown[] = [];
    const repository = {
      updateConnectionHealth: async (update: unknown) => {
        healthUpdates.push(update);
      },
    } as unknown as TrackerRepository;
    const client: MetaGraphReadClient = {
      request: async <T>() => ({ id: "user-1", name: "Owner" }) as T,
      getAll: async <T>() =>
        [
          { permission: "ads_read", status: "granted" },
          { permission: "pages_show_list", status: "granted" },
        ] as T[],
    };
    const adapter = new MetaMarketingApiSyncAdapter({
      client,
      expectedMetaUserId: "user-1",
    });

    await expect(adapter.validate(context(repository))).rejects.toMatchObject({
      code: "META_PERMISSIONS_REQUIRED",
      retryable: false,
    });
    expect(healthUpdates).toEqual([
      expect.objectContaining({
        status: "needs_reauth",
        errorCode: "META_PERMISSIONS_REQUIRED",
      }),
    ]);
  });

  it("preserves the previous metric window when asset mapping is partial", async () => {
    const client: MetaGraphReadClient = {
      request: async <T>(path: string) => {
        throw new Error(`Unexpected request path: ${path}`) as never as T;
      },
      getAll: async <T>(path: string, query: MetaGraphQuery = {}) => {
        const values: Record<string, unknown[]> = {
          "me/businesses": [],
          "me/adaccounts": [
            {
              id: "act_100",
              account_id: "100",
              name: "Account",
              currency: "USD",
              timezone_name: "Asia/Ho_Chi_Minh",
            },
          ],
          "me/accounts": [],
          "act_100/campaigns": [
            { id: "campaign-1", name: "Campaign" },
          ],
          "act_100/adsets": [
            {
              id: "adset-1",
              campaign_id: "campaign-1",
              name: "Ad set",
            },
          ],
          "act_100/adcreatives": [],
        };
        if (path === "act_100/ads") {
          throw new Error("Ads edge is temporarily inaccessible.");
        }
        if (path === "act_100/insights") {
          if (query.level === "account") {
            return [
              {
                date_start: "2026-07-20",
                date_stop: "2026-07-21",
                account_id: "100",
                reach: "80",
              },
            ] as T[];
          }
          if (query.level === "campaign") {
            return [
              {
                date_start: "2026-07-20",
                date_stop: "2026-07-21",
                account_id: "100",
                campaign_id: "campaign-1",
                reach: "50",
              },
            ] as T[];
          }
          return [
            {
              date_start: "2026-07-20",
              ad_id: "ad-unmapped",
              spend: "99",
            },
          ] as T[];
        }
        if (!(path in values)) {
          throw new Error(`Unexpected collection path: ${path}`);
        }
        return values[path] as T[];
      },
    };
    const harness = repositoryHarness();
    Object.assign(harness.repository, {
      listResultDefinitions: async () => {
        throw new Error("result registry migration unavailable");
      },
    });
    const adapter = new MetaMarketingApiSyncAdapter({ client });
    const syncContext = context(harness.repository);

    await adapter.syncAssets(syncContext);
    const result = await adapter.syncInsights(syncContext);

    expect(harness.metricBatches).toEqual([]);
    expect(harness.publishCalls).toEqual([
      {
        connectionId: "connection:1",
        syncRunId: "run:1",
        resultMappingVersion: DEFAULT_RESULT_MAPPING_VERSION,
        periodReachSnapshots: [],
        replacements: [],
      },
    ]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "META_ACCOUNT_METRICS_PRESERVED",
          resource: "act_100",
        }),
        expect.objectContaining({
          code: "RESULT_DEFINITION_REGISTRY_FALLBACK",
          resource: "result-definitions",
        }),
        expect.objectContaining({
          code: "META_INSIGHTS_SNAPSHOT_PRESERVED",
          resource: "insights",
        }),
      ]),
    );
    expect(result.stats).toMatchObject({
      result_definition_source: "built_in_fallback",
      result_mapping_version: DEFAULT_RESULT_MAPPING_VERSION,
      accounts_published: 0,
      metrics_upserted: 0,
    });
    expect(result.checkpoint).toBeUndefined();
  });

  it("fetches every account before publishing one atomic replacement batch", async () => {
    const events: string[] = [];
    const periodQueries: MetaGraphQuery[] = [];
    const client: MetaGraphReadClient = {
      request: async <T>(path: string) => {
        throw new Error(`Unexpected request path: ${path}`) as never as T;
      },
      getAll: async <T>(path: string, query: MetaGraphQuery = {}) => {
        const values: Record<string, unknown[]> = {
          "me/businesses": [],
          "me/adaccounts": [
            {
              id: "act_100",
              account_id: "100",
              name: "Account 100",
              currency: "USD",
              timezone_name: "Asia/Ho_Chi_Minh",
            },
            {
              id: "act_200",
              account_id: "200",
              name: "Account 200",
              currency: "USD",
              timezone_name: "Asia/Ho_Chi_Minh",
            },
          ],
          "me/accounts": [],
          "act_100/campaigns": [
            { id: "campaign-100", name: "Campaign 100" },
          ],
          "act_100/adsets": [
            {
              id: "adset-100",
              campaign_id: "campaign-100",
              name: "Ad set 100",
            },
          ],
          "act_100/ads": [
            {
              id: "ad-100",
              campaign_id: "campaign-100",
              adset_id: "adset-100",
              name: "Ad 100",
              creative: { id: "creative-100" },
            },
          ],
          "act_100/adcreatives": [
            {
              id: "creative-100",
              name: "Creative 100",
              image_hash: "image-100",
            },
          ],
          "act_200/campaigns": [
            { id: "campaign-200", name: "Campaign 200" },
          ],
          "act_200/adsets": [
            {
              id: "adset-200",
              campaign_id: "campaign-200",
              name: "Ad set 200",
            },
          ],
          "act_200/ads": [
            {
              id: "ad-200",
              campaign_id: "campaign-200",
              adset_id: "adset-200",
              name: "Ad 200",
              creative: { id: "creative-200" },
            },
          ],
          "act_200/adcreatives": [
            {
              id: "creative-200",
              name: "Creative 200",
              image_hash: "image-200",
            },
          ],
        };
        if (path.endsWith("/insights")) {
          events.push(`fetch:${path}`);
          const suffix = path.startsWith("act_100") ? "100" : "200";
          if (query.level === "account") {
            periodQueries.push(query);
            return [
              {
                date_start: "2026-07-20",
                date_stop: "2026-07-21",
                account_id: suffix,
                reach: suffix === "100" ? "80" : "150",
              },
            ] as T[];
          }
          if (query.level === "campaign") {
            periodQueries.push(query);
            return [
              {
                date_start: "2026-07-20",
                date_stop: "2026-07-21",
                account_id: suffix,
                campaign_id: `campaign-${suffix}`,
                reach: suffix === "100" ? "70" : "140",
              },
            ] as T[];
          }
          const breakdowns = Array.isArray(query.breakdowns)
            ? query.breakdowns
            : [];
          if (
            breakdowns.includes("image_asset") ||
            breakdowns.includes("video_asset")
          ) {
            return [] as T[];
          }
          return [
            {
              date_start: "2026-07-20",
              account_id: suffix,
              account_currency: "USD",
              campaign_id: `campaign-${suffix}`,
              adset_id: `adset-${suffix}`,
              ad_id: `ad-${suffix}`,
              spend: suffix === "100" ? "10" : "20",
              impressions: suffix === "100" ? "100" : "200",
            },
          ] as T[];
        }
        if (!(path in values)) {
          throw new Error(`Unexpected collection path: ${path}`);
        }
        return values[path] as T[];
      },
    };
    const harness = repositoryHarness();
    const publishDailyMetricWindows = vi.fn(
      async (
        input: Parameters<
          TrackerRepository["publishDailyMetricWindows"]
        >[0],
      ) => {
        events.push("publish");
        const replacements = input.replacements.map((replacement) => ({
          ...replacement,
          metrics: [...replacement.metrics],
        }));
        harness.publishCalls.push({
          connectionId: input.connectionId,
          syncRunId: input.syncRunId,
          resultMappingVersion: input.resultMappingVersion,
          periodReachSnapshots: [...input.periodReachSnapshots],
          replacements,
        });
        const metrics = replacements.flatMap(
          (replacement) => replacement.metrics,
        );
        harness.metricBatches.push(metrics);
        return metrics.length;
      },
    );
    Object.assign(harness.repository, { publishDailyMetricWindows });
    const adapter = new MetaMarketingApiSyncAdapter({ client });
    const syncContext = context(harness.repository);

    await adapter.syncAssets(syncContext);
    const result = await adapter.syncInsights(syncContext);

    expect(publishDailyMetricWindows).toHaveBeenCalledOnce();
    expect(events.at(-1)).toBe("publish");
    expect(events.filter((event) => event.startsWith("fetch:"))).toHaveLength(10);
    expect(periodQueries).toHaveLength(4);
    expect(
      periodQueries.every(
        (query) =>
          !("time_increment" in query) && !("breakdowns" in query),
      ),
    ).toBe(true);
    expect(harness.publishCalls[0]).toMatchObject({
      connectionId: "connection:1",
      syncRunId: "run:1",
      resultMappingVersion: DEFAULT_RESULT_MAPPING_VERSION,
      replacements: [
        {
          adAccountId: "account:act_100",
          dateFrom: "2026-07-20",
          dateTo: "2026-07-21",
          metrics: [
            {
              actionReportTime: "mixed",
              syncVersion: "run:1",
              resultMappingVersion: DEFAULT_RESULT_MAPPING_VERSION,
            },
          ],
        },
        {
          adAccountId: "account:act_200",
          dateFrom: "2026-07-20",
          dateTo: "2026-07-21",
          metrics: [
            {
              actionReportTime: "mixed",
              syncVersion: "run:1",
              resultMappingVersion: DEFAULT_RESULT_MAPPING_VERSION,
            },
          ],
        },
      ],
    });
    expect(result.stats).toMatchObject({
      accounts_succeeded: 2,
      metrics_upserted: 2,
      result_mapping_version: DEFAULT_RESULT_MAPPING_VERSION,
    });
  });

  it("preserves the previous snapshot when account-attribution rows conflict at one logical grain", async () => {
    const insightQueries: MetaGraphQuery[] = [];
    const dailyRow: MetaInsightRow = {
      date_start: "2026-07-20",
      date_stop: "2026-07-20",
      account_id: "100",
      account_currency: "USD",
      campaign_id: "campaign-1",
      adset_id: "adset-1",
      ad_id: "ad-1",
      spend: "10",
      impressions: "100",
      attribution_setting: "7d_click_1d_view",
    };
    const client = singleAccountSyncClient({
      dailyRows: [
        dailyRow,
        {
          ...dailyRow,
          attribution_setting: "1d_click",
        },
      ],
      insightQueries,
    });
    const harness = repositoryHarness();
    const adapter = new MetaMarketingApiSyncAdapter({ client });
    const syncContext = context(harness.repository);

    await adapter.syncAssets(syncContext);
    const result = await adapter.syncInsights(syncContext);

    const dailyQueries = insightQueries.filter((query) => {
      const breakdowns = Array.isArray(query.breakdowns)
        ? query.breakdowns
        : [];
      return (
        query.level === "ad" &&
        !breakdowns.includes("image_asset") &&
        !breakdowns.includes("video_asset")
      );
    });
    expect(dailyQueries).toHaveLength(1);
    expect(dailyQueries[0]).toMatchObject({
      use_account_attribution_setting: true,
      action_report_time: "mixed",
    });
    expect(harness.metricBatches).toEqual([]);
    expect(harness.publishCalls).toEqual([
      expect.objectContaining({
        periodReachSnapshots: [],
        replacements: [],
      }),
    ]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "META_CONFLICTING_INSIGHT_ROW",
          resource: "act_100",
        }),
        expect.objectContaining({
          code: "META_INSIGHTS_SNAPSHOT_PRESERVED",
          resource: "insights",
        }),
      ]),
    );
    expect(result.stats).toMatchObject({
      accounts_succeeded: 0,
      accounts_published: 0,
      accounts_preserved_on_partial_mapping: 1,
      metrics_upserted: 0,
      duplicate_rows: 1,
      conflicting_duplicate_rows: 1,
    });
    expect(result.checkpoint).toBeUndefined();
  });

  it("pins heterogeneous row labels to the account-period attribution window", async () => {
    const client = singleAccountSyncClient({
      dailyRows: [
        {
          date_start: "2026-07-20",
          date_stop: "2026-07-20",
          account_id: "100",
          account_currency: "USD",
          campaign_id: "campaign-1",
          adset_id: "adset-1",
          ad_id: "ad-1",
          spend: "10",
          impressions: "100",
          attribution_setting: "1d_click",
        },
        {
          date_start: "2026-07-21",
          date_stop: "2026-07-21",
          account_id: "100",
          account_currency: "USD",
          campaign_id: "campaign-1",
          adset_id: "adset-1",
          ad_id: "ad-1",
          spend: "20",
          impressions: "200",
          attribution_setting: "1d_view_1d_click_1d_ev",
        },
      ],
      accountPeriodRows: [
        {
          date_start: "2026-07-20",
          date_stop: "2026-07-21",
          account_id: "100",
          attribution_setting: "7d_click",
          reach: "180",
        },
      ],
      campaignPeriodRows: [
        {
          date_start: "2026-07-20",
          date_stop: "2026-07-21",
          account_id: "100",
          campaign_id: "campaign-1",
          attribution_setting: "1d_click",
          reach: "170",
        },
      ],
    });
    const harness = repositoryHarness();
    const adapter = new MetaMarketingApiSyncAdapter({ client });
    const syncContext = context(harness.repository);

    await adapter.syncAssets(syncContext);
    const result = await adapter.syncInsights(syncContext);

    expect(harness.metricBatches.flat()).toHaveLength(2);
    expect(
      new Set(
        harness.metricBatches
          .flat()
          .map((metric) => metric.attributionWindow),
      ),
    ).toEqual(new Set(["7d_click"]));
    expect(
      new Set(
        harness.publishCalls[0].periodReachSnapshots.map(
          (snapshot) => snapshot.attributionWindow,
        ),
      ),
    ).toEqual(new Set(["7d_click"]));
    expect(result.stats).toMatchObject({
      accounts_succeeded: 1,
      accounts_published: 1,
      metrics_upserted: 2,
      period_reach_snapshots_published: 2,
    });
    expect(result.checkpoint).toBeDefined();
  });

  it("preserves the previous snapshot when period Reach repeats one campaign scope", async () => {
    const campaignReachRow: MetaInsightRow = {
      date_start: "2026-07-20",
      date_stop: "2026-07-21",
      account_id: "100",
      campaign_id: "campaign-1",
      attribution_setting: "7d_click_1d_view",
      reach: "70",
    };
    const client = singleAccountSyncClient({
      dailyRows: [
        {
          date_start: "2026-07-20",
          date_stop: "2026-07-20",
          account_id: "100",
          account_currency: "USD",
          campaign_id: "campaign-1",
          adset_id: "adset-1",
          ad_id: "ad-1",
          spend: "10",
          impressions: "100",
          attribution_setting: "7d_click_1d_view",
        },
      ],
      campaignPeriodRows: [
        campaignReachRow,
        {
          ...campaignReachRow,
          attribution_setting: "1d_click",
        },
      ],
    });
    const harness = repositoryHarness();
    const adapter = new MetaMarketingApiSyncAdapter({ client });
    const syncContext = context(harness.repository);

    await adapter.syncAssets(syncContext);
    const result = await adapter.syncInsights(syncContext);

    expect(harness.metricBatches).toEqual([]);
    expect(harness.publishCalls).toEqual([
      expect.objectContaining({
        periodReachSnapshots: [],
        replacements: [],
      }),
    ]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "META_PERIOD_REACH_UNAVAILABLE",
          resource: "act_100",
        }),
        expect.objectContaining({
          code: "META_INSIGHTS_SNAPSHOT_PRESERVED",
          resource: "insights",
        }),
      ]),
    );
    expect(result.stats).toMatchObject({
      accounts_succeeded: 0,
      accounts_published: 0,
      accounts_preserved_on_period_reach_failure: 1,
      period_reach_snapshots_published: 0,
      metrics_upserted: 0,
    });
    expect(result.checkpoint).toBeUndefined();
  });

  it("does not advance the snapshot when period Reach is partial", async () => {
    const client: MetaGraphReadClient = {
      request: async <T>(path: string) => {
        throw new Error(`Unexpected request path: ${path}`) as never as T;
      },
      getAll: async <T>(path: string, query: MetaGraphQuery = {}) => {
        const values: Record<string, unknown[]> = {
          "me/businesses": [],
          "me/adaccounts": [
            {
              id: "act_100",
              account_id: "100",
              name: "Account",
              currency: "USD",
              timezone_name: "Asia/Ho_Chi_Minh",
            },
          ],
          "me/accounts": [],
          "act_100/campaigns": [
            { id: "campaign-1", name: "Campaign" },
          ],
          "act_100/adsets": [
            {
              id: "adset-1",
              campaign_id: "campaign-1",
              name: "Ad set",
            },
          ],
          "act_100/ads": [
            {
              id: "ad-1",
              campaign_id: "campaign-1",
              adset_id: "adset-1",
              name: "Ad",
              creative: { id: "creative-1" },
            },
          ],
          "act_100/adcreatives": [
            {
              id: "creative-1",
              name: "Creative",
              image_hash: "image-1",
            },
          ],
        };
        if (path === "act_100/insights") {
          if (query.level === "account") {
            return [
              {
                date_start: "2026-07-20",
                date_stop: "2026-07-21",
                account_id: "100",
                reach: "100",
              },
            ] as T[];
          }
          if (query.level === "campaign") {
            return [
              {
                date_start: "2026-07-20",
                date_stop: "2026-07-21",
                account_id: "100",
                campaign_id: "campaign-1",
              },
            ] as T[];
          }
          if (Array.isArray(query.breakdowns)) {
            return [] as T[];
          }
          return [
            {
              date_start: "2026-07-20",
              date_stop: "2026-07-20",
              account_id: "100",
              campaign_id: "campaign-1",
              adset_id: "adset-1",
              ad_id: "ad-1",
              spend: "10",
              impressions: "100",
              reach: "80",
            },
          ] as T[];
        }
        if (!(path in values)) {
          throw new Error(`Unexpected collection path: ${path}`);
        }
        return values[path] as T[];
      },
    };
    const harness = repositoryHarness();
    const adapter = new MetaMarketingApiSyncAdapter({ client });
    const syncContext = context(harness.repository);

    await adapter.syncAssets(syncContext);
    const result = await adapter.syncInsights(syncContext);

    expect(harness.metricBatches).toEqual([]);
    expect(harness.publishCalls).toEqual([
      expect.objectContaining({
        connectionId: "connection:1",
        syncRunId: "run:1",
        periodReachSnapshots: [],
        replacements: [],
      }),
    ]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "META_PERIOD_REACH_UNAVAILABLE",
          resource: "act_100",
        }),
        expect.objectContaining({
          code: "META_INSIGHTS_SNAPSHOT_PRESERVED",
        }),
      ]),
    );
    expect(result.stats).toMatchObject({
      accounts_succeeded: 0,
      accounts_published: 0,
      accounts_preserved_on_period_reach_failure: 1,
      period_reach_snapshots_published: 0,
    });
    expect(result.checkpoint).toBeUndefined();
  });

  it("publishes zero Reach for a metadata-only account period with no delivery", async () => {
    const client = singleAccountSyncClient({
      dailyRows: [],
      accountPeriodRows: [
        {
          date_start: "2026-07-20",
          date_stop: "2026-07-21",
          account_id: "100",
          attribution_setting: "7d_click_1d_view",
        },
      ],
      campaignPeriodRows: [],
    });
    const harness = repositoryHarness();
    const adapter = new MetaMarketingApiSyncAdapter({ client });
    const syncContext = context(harness.repository);

    await adapter.syncAssets(syncContext);
    const result = await adapter.syncInsights(syncContext);

    expect(harness.publishCalls).toEqual([
      expect.objectContaining({
        periodReachSnapshots: expect.arrayContaining([
          expect.objectContaining({
            scopeLevel: "account",
            campaignId: null,
            reach: 0,
          }),
          expect.objectContaining({
            scopeLevel: "campaign",
            reach: 0,
          }),
        ]),
        replacements: [
          expect.objectContaining({
            adAccountId: "account:act_100",
            metrics: [],
          }),
        ],
      }),
    ]);
    expect(result.warnings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "META_PERIOD_REACH_UNAVAILABLE" }),
      ]),
    );
    expect(result.stats).toMatchObject({
      accounts_succeeded: 1,
      accounts_published: 1,
      accounts_preserved_on_period_reach_failure: 0,
      period_reach_omitted_zero_rows_published: 1,
      period_reach_snapshots_published: 2,
    });
    expect(result.checkpoint).toBeDefined();
  });

  it("keeps missing account Reach fail-closed when daily delivery exists", async () => {
    const client = singleAccountSyncClient({
      dailyRows: [
        {
          date_start: "2026-07-20",
          date_stop: "2026-07-20",
          account_id: "100",
          account_currency: "USD",
          campaign_id: "campaign-1",
          adset_id: "adset-1",
          ad_id: "ad-1",
          spend: "10",
          impressions: "100",
        },
      ],
      accountPeriodRows: [],
      campaignPeriodRows: [],
    });
    const harness = repositoryHarness();
    const adapter = new MetaMarketingApiSyncAdapter({ client });
    const syncContext = context(harness.repository);

    await adapter.syncAssets(syncContext);
    const result = await adapter.syncInsights(syncContext);

    expect(harness.publishCalls).toEqual([
      expect.objectContaining({
        periodReachSnapshots: [],
        replacements: [],
      }),
    ]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "META_PERIOD_REACH_UNAVAILABLE",
          resource: "act_100",
        }),
      ]),
    );
    expect(result.stats).toMatchObject({
      accounts_succeeded: 0,
      accounts_published: 0,
      accounts_preserved_on_period_reach_failure: 1,
      period_reach_omitted_zero_rows_published: 0,
    });
    expect(result.checkpoint).toBeUndefined();
  });

  it("keeps missing account Reach fail-closed when exact asset evidence is unavailable", async () => {
    const client = singleAccountSyncClient({
      dailyRows: [],
      accountPeriodRows: [
        {
          date_start: "2026-07-20",
          date_stop: "2026-07-21",
          account_id: "100",
        },
      ],
      campaignPeriodRows: [],
      assetInsightsError: new Error("Asset breakdown unavailable"),
    });
    const harness = repositoryHarness();
    const adapter = new MetaMarketingApiSyncAdapter({ client });
    const syncContext = context(harness.repository);

    await adapter.syncAssets(syncContext);
    const result = await adapter.syncInsights(syncContext);

    expect(harness.publishCalls).toEqual([
      expect.objectContaining({
        periodReachSnapshots: [],
        replacements: [],
      }),
    ]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "META_ASSET_BREAKDOWN_UNAVAILABLE",
          resource: "act_100",
        }),
        expect.objectContaining({
          code: "META_PERIOD_REACH_UNAVAILABLE",
          resource: "act_100",
        }),
      ]),
    );
    expect(result.stats).toMatchObject({
      accounts_succeeded: 0,
      accounts_published: 0,
      accounts_preserved_on_period_reach_failure: 1,
      period_reach_omitted_zero_rows_published: 0,
    });
    expect(result.checkpoint).toBeUndefined();
  });

  it.each([
    {
      caseName: "exact asset delivery exists",
      input: {
        dailyRows: [],
        accountPeriodRows: [
          {
            date_start: "2026-07-20",
            date_stop: "2026-07-21",
            account_id: "100",
          },
        ],
        campaignPeriodRows: [],
        assetRows: [
          {
            date_start: "2026-07-20",
            date_stop: "2026-07-20",
            account_id: "100",
            campaign_id: "campaign-1",
            adset_id: "adset-1",
            ad_id: "ad-1",
            impressions: "1",
          },
        ],
      },
    },
    {
      caseName: "campaign-period delivery exists",
      input: {
        dailyRows: [],
        accountPeriodRows: [
          {
            date_start: "2026-07-20",
            date_stop: "2026-07-21",
            account_id: "100",
          },
        ],
        campaignPeriodRows: [
          {
            date_start: "2026-07-20",
            date_stop: "2026-07-21",
            account_id: "100",
            campaign_id: "campaign-1",
            reach: "1",
          },
        ],
      },
    },
    {
      caseName: "Reach is blank instead of nullish",
      input: {
        dailyRows: [],
        accountPeriodRows: [
          {
            date_start: "2026-07-20",
            date_stop: "2026-07-21",
            account_id: "100",
            reach: "   ",
          },
        ],
        campaignPeriodRows: [],
      },
    },
  ])("keeps zero Reach normalization fail-closed when $caseName", async ({ input }) => {
    const client = singleAccountSyncClient(input);
    const harness = repositoryHarness();
    const adapter = new MetaMarketingApiSyncAdapter({ client });
    const syncContext = context(harness.repository);

    await adapter.syncAssets(syncContext);
    const result = await adapter.syncInsights(syncContext);

    expect(harness.publishCalls).toEqual([
      expect.objectContaining({
        periodReachSnapshots: [],
        replacements: [],
      }),
    ]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "META_PERIOD_REACH_UNAVAILABLE",
          resource: "act_100",
        }),
      ]),
    );
    expect(result.stats).toMatchObject({
      accounts_succeeded: 0,
      accounts_published: 0,
      accounts_preserved_on_period_reach_failure: 1,
      period_reach_omitted_zero_rows_published: 0,
    });
    expect(result.checkpoint).toBeUndefined();
  });

  it.each([
    {
      caseName: "campaign id is present",
      campaignId: "campaign-1",
    },
    {
      caseName: "campaign id is omitted",
      campaignId: undefined,
    },
    {
      caseName: "campaign id conflicts with the stored ad",
      campaignId: "campaign-2",
    },
  ])("keeps an absent campaign Reach row fail-closed when delivery $caseName", async ({ campaignId }) => {
    const client = singleAccountSyncClient({
      dailyRows: [
        {
          date_start: "2026-07-20",
          date_stop: "2026-07-20",
          account_id: "100",
          account_currency: "USD",
          campaign_id: campaignId,
          adset_id: "adset-1",
          ad_id: "ad-1",
          spend: "10",
          impressions: "100",
        },
      ],
      accountPeriodRows: [
        {
          date_start: "2026-07-20",
          date_stop: "2026-07-21",
          account_id: "100",
          reach: "80",
        },
      ],
      campaignPeriodRows: [],
    });
    const harness = repositoryHarness();
    const adapter = new MetaMarketingApiSyncAdapter({ client });
    const syncContext = context(harness.repository);

    await adapter.syncAssets(syncContext);
    const result = await adapter.syncInsights(syncContext);

    expect(harness.publishCalls).toEqual([
      expect.objectContaining({
        periodReachSnapshots: [],
        replacements: [],
      }),
    ]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "META_PERIOD_REACH_UNAVAILABLE",
          resource: "act_100",
        }),
      ]),
    );
    expect(result.stats).toMatchObject({
      accounts_succeeded: 0,
      accounts_published: 0,
      accounts_preserved_on_period_reach_failure: 1,
      period_reach_omitted_zero_rows_published: 0,
    });
    expect(result.checkpoint).toBeUndefined();
  });

  it("keeps account inventory warnings isolated during concurrent reads", async () => {
    const client: MetaGraphReadClient = {
      request: async <T>(path: string) => {
        throw new Error(`Unexpected request path: ${path}`) as never as T;
      },
      getAll: async <T>(path: string) => {
        const values: Record<string, unknown[]> = {
          "me/businesses": [],
          "me/adaccounts": [
            {
              id: "act_100",
              account_id: "100",
              name: "Unavailable account",
              currency: "USD",
              timezone_name: "Asia/Ho_Chi_Minh",
            },
            {
              id: "act_200",
              account_id: "200",
              name: "Healthy account",
              currency: "USD",
              timezone_name: "Asia/Ho_Chi_Minh",
            },
          ],
          "me/accounts": [],
          "act_100/campaigns": [],
          "act_100/adsets": [],
          "act_100/adcreatives": [],
          "act_200/campaigns": [],
          "act_200/adsets": [],
          "act_200/ads": [],
          "act_200/adcreatives": [],
        };
        if (path.startsWith("act_200/")) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        if (path === "act_100/ads") {
          throw new Error("Ads edge is temporarily inaccessible.");
        }
        if (!(path in values)) {
          throw new Error(`Unexpected collection path: ${path}`);
        }
        return values[path] as T[];
      },
    };
    const harness = repositoryHarness();
    const adapter = new MetaMarketingApiSyncAdapter({ client });

    const result = await adapter.syncAssets(context(harness.repository));

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "META_ACCOUNT_RESOURCE_INACCESSIBLE",
          resource: "act_100/ads",
        }),
      ]),
    );
    expect(harness.reconciledAccounts).toContain("account:act_200");
    expect(harness.reconciledAccounts).not.toContain("account:act_100");
  });

  it("preserves an ad's previous creative link when the referenced creative is inaccessible", async () => {
    const client: MetaGraphReadClient = {
      request: async <T>(path: string) => {
        if (path === "creative-missing") {
          throw new Error("Creative detail is temporarily inaccessible.");
        }
        throw new Error(`Unexpected request path: ${path}`) as never as T;
      },
      getAll: async <T>(path: string) => {
        const values: Record<string, unknown[]> = {
          "me/businesses": [],
          "me/adaccounts": [
            {
              id: "act_100",
              account_id: "100",
              name: "Account",
              currency: "USD",
              timezone_name: "Asia/Ho_Chi_Minh",
            },
          ],
          "me/accounts": [],
          "act_100/campaigns": [
            { id: "campaign-1", name: "Campaign" },
          ],
          "act_100/adsets": [
            {
              id: "adset-1",
              campaign_id: "campaign-1",
              name: "Ad set",
            },
          ],
          "act_100/ads": [
            {
              id: "ad-1",
              campaign_id: "campaign-1",
              adset_id: "adset-1",
              name: "Ad",
              creative: { id: "creative-missing" },
            },
          ],
          "act_100/adcreatives": [],
        };
        if (!(path in values)) {
          throw new Error(`Unexpected collection path: ${path}`);
        }
        return values[path] as T[];
      },
    };
    const harness = repositoryHarness();
    const adapter = new MetaMarketingApiSyncAdapter({ client });

    const result = await adapter.syncAssets(context(harness.repository));

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "META_CREATIVE_INACCESSIBLE",
          resource: "creative:creative-missing",
        }),
      ]),
    );
    expect(harness.adCreativeReplacementScopes).toEqual([[]]);
    expect(harness.adCreativeReplacementLinks).toEqual([[]]);
    expect(harness.reconciledAccounts).not.toContain("account:act_100");
  });

  it("does not start account persistence after the sync signal aborts", async () => {
    const abortController = new AbortController();
    const client: MetaGraphReadClient = {
      request: async <T>(path: string) => {
        throw new Error(`Unexpected request path: ${path}`) as never as T;
      },
      getAll: async <T>(path: string) => {
        const values: Record<string, unknown[]> = {
          "me/businesses": [],
          "me/adaccounts": [
            {
              id: "act_100",
              account_id: "100",
              name: "Account",
              currency: "USD",
              timezone_name: "Asia/Ho_Chi_Minh",
            },
          ],
          "me/accounts": [],
          "act_100/campaigns": [],
          "act_100/adsets": [],
          "act_100/ads": [],
          "act_100/adcreatives": [],
        };
        if (path === "act_100/adcreatives") {
          abortController.abort(new Error("sync deadline exceeded"));
        }
        if (!(path in values)) {
          throw new Error(`Unexpected collection path: ${path}`);
        }
        return values[path] as T[];
      },
    };
    const harness = repositoryHarness();
    const upsertCampaigns = vi.fn(async () => new Map());
    Object.assign(harness.repository, { upsertCampaigns });
    const adapter = new MetaMarketingApiSyncAdapter({ client });
    const syncContext = {
      ...context(harness.repository),
      signal: abortController.signal,
    };

    await expect(adapter.syncAssets(syncContext)).rejects.toThrow(
      "sync deadline exceeded",
    );
    expect(upsertCampaigns).not.toHaveBeenCalled();
  });

  it("discovers all asset edges and stores dynamic spend once at ad scope", async () => {
    const insightCalls: MetaGraphQuery[] = [];
    let rejectedRichBreakdown = false;
    const insightRows: MetaInsightRow[] = [
      {
        date_start: "2026-07-20",
        account_id: "100",
        account_currency: "USD",
        attribution_setting: "7d_click_1d_view",
        campaign_id: "campaign-1",
        adset_id: "adset-1",
        ad_id: "ad-static",
        spend: "10",
        impressions: "100",
        reach: "80",
        inline_link_clicks: "4",
        publisher_platform: "facebook",
        platform_position: "feed",
        actions: [
          { action_type: "mobile_app_install", value: "5" },
          { action_type: "omni_app_install", value: "5" },
          { action_type: "mobile_app_install_custom", value: "999" },
          { action_type: "purchase", value: "2" },
          { action_type: "omni_purchase", value: "2" },
          { action_type: "purchase_similar", value: "999" },
          { action_type: "owner_qualified_lead", value: "4" },
          { action_type: "video_view", value: "11" },
        ],
        action_values: [
          { action_type: "purchase", value: "125" },
          { action_type: "omni_purchase", value: "125" },
          { action_type: "purchase_similar", value: "9999" },
        ],
        video_play_actions: [
          { action_type: "video_view", value: "15" },
        ],
      },
      {
        date_start: "2026-07-20",
        account_id: "100",
        account_currency: "USD",
        campaign_id: "campaign-1",
        adset_id: "adset-1",
        ad_id: "ad-dynamic",
        spend: "20",
        impressions: "200",
        reach: "150",
        inline_link_clicks: "8",
        publisher_platform: "facebook",
        platform_position: "feed",
        actions: [
          { action_type: "mobile_app_install", value: "7" },
          { action_type: "omni_app_install", value: "7" },
        ],
      },
    ];

    const client: MetaGraphReadClient = {
      request: async <T>(path: string) => {
        if (path === "me") {
          return { id: "user-1", name: "Owner" } as T;
        }
        throw new Error(`Unexpected request path: ${path}`);
      },
      getAll: async <T>(path: string, query: MetaGraphQuery = {}) => {
        const values: Record<string, unknown[]> = {
          "me/permissions": [
            { permission: "ads_read", status: "granted" },
            { permission: "business_management", status: "granted" },
            { permission: "pages_show_list", status: "granted" },
          ],
          "me/businesses": [{ id: "business-1", name: "Business" }],
          "me/adaccounts": [
            {
              id: "act_100",
              account_id: "100",
              name: "Account",
              currency: "USD",
              timezone_name: "Asia/Ho_Chi_Minh",
            },
          ],
          "me/accounts": [{ id: "page-1", name: "Page" }],
          "business-1/owned_ad_accounts": [
            {
              id: "act_100",
              account_id: "100",
              name: "Account",
              currency: "USD",
              timezone_name: "Asia/Ho_Chi_Minh",
            },
          ],
          "business-1/client_ad_accounts": [],
          "business-1/owned_pages": [{ id: "page-1", name: "Page" }],
          "business-1/client_pages": [],
          "business-1/owned_apps": [{ id: "app-1", name: "App" }],
          "act_100/campaigns": [
            { id: "campaign-1", name: "Campaign" },
          ],
          "act_100/adsets": [
            {
              id: "adset-1",
              campaign_id: "campaign-1",
              name: "Ad set",
            },
          ],
          "act_100/ads": [
            {
              id: "ad-static",
              campaign_id: "campaign-1",
              adset_id: "adset-1",
              name: "Static",
              creative: { id: "creative-static" },
            },
            {
              id: "ad-dynamic",
              campaign_id: "campaign-1",
              adset_id: "adset-1",
              name: "Dynamic",
              creative: { id: "creative-dynamic" },
            },
          ],
          "act_100/adcreatives": [
            {
              id: "creative-static",
              name: "Static",
              image_hash: "static-hash",
              object_story_spec: { page_id: "page-1" },
            },
            {
              id: "creative-dynamic",
              name: "Dynamic",
              object_story_spec: { page_id: "page-1" },
              asset_feed_spec: {
                images: [
                  { hash: "dynamic-hash-1" },
                  { hash: "dynamic-hash-2" },
                ],
              },
            },
          ],
        };

        if (path === "act_100/insights") {
          insightCalls.push(query);
          if (query.level === "account") {
            return [
              {
                date_start: "2026-07-20",
                date_stop: "2026-07-21",
                account_id: "100",
                attribution_setting: "7d_click_1d_view",
                reach: "200",
              },
            ] as T[];
          }
          if (query.level === "campaign") {
            return [
              {
                date_start: "2026-07-20",
                date_stop: "2026-07-21",
                account_id: "100",
                campaign_id: "campaign-1",
                attribution_setting: "7d_click_1d_view",
                reach: "190",
              },
            ] as T[];
          }
          if (
            Array.isArray(query.breakdowns) &&
            query.breakdowns.length === 3 &&
            !rejectedRichBreakdown
          ) {
            rejectedRichBreakdown = true;
            throw new MetaGraphApiError(
              { code: 100 },
              {
                httpStatus: 400,
                retryAfterMs: null,
                requestPath: "/v24.0/act_100/insights",
              },
            );
          }
          return insightRows as T[];
        }
        if (path === "business-1/client_apps") {
          throw new Error("This business app edge is not authorized.");
        }
        if (!(path in values)) {
          throw new Error(`Unexpected collection path: ${path}`);
        }
        return values[path] as T[];
      },
    };

    const harness = repositoryHarness();
    const ownerDefinition: ResultDefinition = {
      id: "result-owner-qualified-lead",
      canonicalKey: "qualified_lead",
      label: "Owner Qualified Lead",
      shortLabel: "Qualified",
      objectiveKeys: ["leads"],
      rawActionTypes: [],
      rawValueActionTypes: [],
      unit: "count",
      efficiencyMetric: "cost_per_result",
      direction: "lower_is_better",
      defaultForObjective: false,
      minimumResults: 5,
      minimumImpressions: 1_000,
      enabled: true,
    };
    const listResultDefinitions = vi.fn(async () => [
      ...DEFAULT_RESULT_DEFINITIONS.map((definition) => ({
        ...definition,
        objectiveKeys: [...definition.objectiveKeys],
        rawActionTypes: [...definition.rawActionTypes],
        rawValueActionTypes: [
          ...(definition.rawValueActionTypes ?? []),
        ],
      })),
      ownerDefinition,
    ]);
    const ownerMappings = [
      ...defaultResultMappings(),
      {
        id: "owner-mapping-1",
        canonicalResultKey: "qualified_lead",
        rawActionType: "owner_qualified_lead",
        metricSource: "action" as const,
        priority: 0,
        mappingSource: "owner" as const,
        enabled: true,
      },
    ];
    const ownerResultMappingVersion =
      computeResultMappingVersion(ownerMappings);
    const listResultMappings = vi.fn(async () => ownerMappings);
    Object.assign(harness.repository, {
      listResultDefinitions,
      listResultMappings,
    });
    const adapter = new MetaMarketingApiSyncAdapter({
      client,
      expectedMetaUserId: "user-1",
    });
    const syncContext = context(harness.repository);

    const validation = await adapter.validate(syncContext);
    const assets = await adapter.syncAssets(syncContext);
    const insights = await adapter.syncInsights(syncContext);

    expect(validation.warnings).toEqual([]);
    expect(assets.stats).toMatchObject({
      businesses: 1,
      ad_accounts: 1,
      ads: 2,
      creative_assets: 3,
    });
    expect(assets.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "META_BUSINESS_ASSET_INACCESSIBLE",
          resource: "business-1/client_apps",
        }),
      ]),
    );
    expect(insights.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "META_INSIGHT_BREAKDOWN_FALLBACK",
        }),
      ]),
    );
    expect(insightCalls[0]).toMatchObject({
      level: "ad",
      time_increment: 1,
      use_account_attribution_setting: true,
      action_report_time: "mixed",
      breakdowns: [
        "publisher_platform",
        "platform_position",
        "impression_device",
      ],
    });
    const requestedInsightFields = String(insightCalls[0].fields).split(",");
    expect(requestedInsightFields).toEqual(
      expect.arrayContaining([
        "actions",
        "attribution_setting",
        "video_play_actions",
        "video_p100_watched_actions",
      ]),
    );
    expect(requestedInsightFields).not.toContain(
      "video_3_sec_watched_actions",
    );
    expect(
      insightCalls.some(
        (query) =>
          Array.isArray(query.breakdowns) &&
          query.breakdowns.includes("image_asset"),
      ),
    ).toBe(true);
    expect(
      insightCalls.every((query) => query.action_report_time === "mixed"),
    ).toBe(true);
    expect(
      insightCalls
        .filter(
          (query) =>
            query.level === "account" || query.level === "campaign",
        )
        .every(
          (query) =>
            !("time_increment" in query) && !("breakdowns" in query),
        ),
    ).toBe(true);
    expect(
      insightCalls.some(
        (query) =>
          Array.isArray(query.breakdowns) &&
          query.breakdowns.includes("video_asset"),
      ),
    ).toBe(true);
    expect(insights.stats).toMatchObject({
      asset_breakdown_rows_fetched: 4,
      exact_asset_coverage_groups: 0,
      video_3s_source_rows: {
        actions_video_view: 1,
        legacy_direct_field: 0,
        unavailable: 1,
      },
      result_definition_source: "owner_registry",
      result_mapping_version: ownerResultMappingVersion,
    });
    expect(listResultDefinitions).toHaveBeenCalledOnce();
    expect(listResultMappings).toHaveBeenCalledOnce();

    const metrics = harness.metricBatches.flat();
    expect(harness.publishCalls).toHaveLength(1);
    expect(harness.publishCalls[0]).toMatchObject({
      connectionId: "connection:1",
      syncRunId: "run:1",
      resultMappingVersion: ownerResultMappingVersion,
      replacements: [
        {
          adAccountId: "account:act_100",
          dateFrom: "2026-07-20",
          dateTo: "2026-07-21",
        },
      ],
    });
    const accountPeriodReach =
      harness.publishCalls[0].periodReachSnapshots.find(
        (snapshot) => snapshot.scopeLevel === "account",
      );
    expect(accountPeriodReach?.reach).toBe(200);
    expect(metrics).toHaveLength(2);
    expect(
      metrics.reduce(
        (sum, metric) => sum + (metric.reportedReach ?? 0),
        0,
      ),
    ).toBe(230);
    expect(accountPeriodReach?.reach).not.toBe(230);
    expect(metrics.find((metric) => metric.adId === "ad:ad-static")).toMatchObject({
      metricScope: "asset",
      allocationMethod: "single_asset",
      scopeKey: "image:static-hash",
      spend: 10,
      installs: 5,
      video3sViews: 11,
      attributionWindow: "7d_click_1d_view",
      actionReportTime: "mixed",
      syncVersion: "run:1",
      canonicalResultMetrics: expect.arrayContaining([
        {
          canonicalResultKey: "install",
          value: 5,
          selectedActionType: "mobile_app_install",
        },
        {
          canonicalResultKey: "purchase",
          value: 2,
          selectedActionType: "purchase",
        },
        {
          canonicalResultKey: "qualified_lead",
          value: 4,
          selectedActionType: "owner_qualified_lead",
        },
      ]),
      canonicalResultValues: [
        {
          canonicalResultKey: "purchase_value",
          value: 125,
          selectedActionType: "purchase",
        },
      ],
      actionMappingVersion:
        actionMappingVersion({
          installs: {
            actionTypes: settings().installActionTypes,
            strategy: "first-match",
          },
          registrations: {
            actionTypes: settings().registrationActionTypes,
            strategy: "first-match",
          },
        }),
    });
    const staticMetric = metrics.find(
      (metric) => metric.adId === "ad:ad-static",
    );
    expect(
      staticMetric?.canonicalResultMetrics?.filter(
        (fact) => fact.canonicalResultKey === "install",
      ),
    ).toHaveLength(1);
    expect(
      staticMetric?.canonicalResultMetrics?.find(
        (fact) => fact.canonicalResultKey === "install",
      )?.value,
    ).toBe(5);
    expect(
      [
        ...(staticMetric?.canonicalResultMetrics ?? []),
        ...(staticMetric?.canonicalResultValues ?? []),
      ].map((fact) => fact.selectedActionType),
    ).not.toEqual(
      expect.arrayContaining([
        "mobile_app_install_custom",
        "purchase_similar",
      ]),
    );
    expect(metrics.find((metric) => metric.adId === "ad:ad-dynamic")).toMatchObject({
      metricScope: "ad",
      allocationMethod: "unallocated",
      scopeKey: "ad:ad-dynamic",
      creativeAssetId: null,
      spend: 20,
      installs: 7,
    });
    expect(metrics.reduce((total, metric) => total + (metric.spend ?? 0), 0)).toBe(
      30,
    );
  });
});

describe("createStoredMetaSyncAdapter", () => {
  it("defaults token decryption binding to the stored Meta user ID", async () => {
    const key = new Uint8Array(32).fill(17);
    const connection: MetaConnectionSecretRecord = {
      connectionId: "connection:1",
      ownerId: 1,
      metaUserId: "meta-user-1",
      metaUserName: "Owner",
      encryptedAccessToken: encryptMetaToken("stored-token", {
        key,
        binding: "meta-user-1",
      }),
      grantedScopes: ["ads_read"],
      declinedScopes: [],
      tokenExpiresAt: null,
      dataAccessExpiresAt: null,
      status: "connected",
      lastValidatedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:00:00.000Z",
    };
    const repository = {
      getConnectionSecret: async () => connection,
    } as unknown as TrackerRepository;

    await expect(
      createStoredMetaSyncAdapter({
        repository,
        connectionId: connection.connectionId,
        decryption: { key },
      }),
    ).resolves.toBeInstanceOf(MetaMarketingApiSyncAdapter);

    await expect(
      createStoredMetaSyncAdapter({
        repository,
        connectionId: connection.connectionId,
        decryption: { key, binding: "wrong-user" },
      }),
    ).rejects.toBeInstanceOf(TokenEncryptionError);
  });
});
