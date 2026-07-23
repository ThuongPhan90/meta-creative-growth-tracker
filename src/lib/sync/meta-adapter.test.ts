import type { TrackerRepository } from "@/lib/db/repository";
import type {
  DailyMetricInput,
  DatabaseId,
  MetaConnectionSecretRecord,
  TrackerSettings,
} from "@/lib/db/types";
import { MetaGraphApiError } from "@/lib/meta/client";
import type { MetaGraphQuery, MetaInsightRow } from "@/lib/meta/types";
import {
  encryptMetaToken,
  TokenEncryptionError,
} from "@/lib/security/encryption";
import { describe, expect, it } from "vitest";

import type { MetaSyncStageContext } from "./contracts";
import {
  chooseInsightAllocation,
  createStoredMetaSyncAdapter,
  exactCoverageMatches,
  extractPhysicalCreativeAssets,
  MetaMarketingApiSyncAdapter,
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
    benchmarkMode: "os",
    installActionTypes: [
      "mobile_app_install",
      "omni_app_install",
      "app_install",
    ],
    registrationActionTypes: ["complete_registration"],
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

function repositoryHarness(): {
  repository: TrackerRepository;
  metricBatches: DailyMetricInput[][];
} {
  const metricBatches: DailyMetricInput[][] = [];
  const repository = {
    getSettings: async () => settings(),
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
    reconcileAdAccountInventory: async () => undefined,
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
    replaceAdCreativeLinks: async () => undefined,
    replaceDailyMetricsWindow: async (input: {
      metrics: readonly DailyMetricInput[];
    }) => {
      metricBatches.push([...input.metrics]);
      return input.metrics.length;
    },
  };
  return {
    repository: repository as unknown as TrackerRepository,
    metricBatches,
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

  it("preserves the previous metric window when asset mapping is partial", async () => {
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
    const adapter = new MetaMarketingApiSyncAdapter({ client });
    const syncContext = context(harness.repository);

    await adapter.syncAssets(syncContext);
    const result = await adapter.syncInsights(syncContext);

    expect(harness.metricBatches).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "META_ACCOUNT_METRICS_PRESERVED",
          resource: "act_100",
        }),
      ]),
    );
    expect(result.checkpoint).toBeUndefined();
  });

  it("discovers all asset edges and stores dynamic spend once at ad scope", async () => {
    const insightCalls: MetaGraphQuery[] = [];
    let rejectedRichBreakdown = false;
    const insightRows: MetaInsightRow[] = [
      {
        date_start: "2026-07-20",
        account_id: "100",
        account_currency: "USD",
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
          { action_type: "video_view", value: "11" },
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
      breakdowns: [
        "publisher_platform",
        "platform_position",
        "impression_device",
      ],
    });
    expect(
      insightCalls.some(
        (query) =>
          Array.isArray(query.breakdowns) &&
          query.breakdowns.includes("image_asset"),
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
    });

    const metrics = harness.metricBatches.flat();
    expect(metrics).toHaveLength(2);
    expect(metrics.find((metric) => metric.adId === "ad:ad-static")).toMatchObject({
      metricScope: "asset",
      allocationMethod: "single_asset",
      scopeKey: "image:static-hash",
      spend: 10,
      installs: 5,
      video3sViews: 11,
    });
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
