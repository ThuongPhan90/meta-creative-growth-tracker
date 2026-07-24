import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "./client";
import { TrackerRepository } from "./repository";

describe("Meta connection owner claim", () => {
  it("uses one atomic statement and returns null for a different owner", async () => {
    const unsafe = vi.fn(async (query: string) => {
      void query;
      return [];
    });
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(
      repository.claimOrRefreshConnection({
        metaUserId: "owner-b",
        encryptedAccessToken: "encrypted-token-b",
      }),
    ).resolves.toBeNull();

    const [query] = unsafe.mock.calls[0];
    expect(query).toContain(
      "insert into tracker.meta_connections as current_connection",
    );
    expect(query).toContain(
      "where current_connection.meta_user_id = excluded.meta_user_id",
    );
  });
});

describe("Repository JSONB parameters", () => {
  it("passes structured JSON values instead of double-encoded strings", async () => {
    const unsafe = vi.fn(
      async (_query: string, _parameters?: unknown[]) => {
        void _query;
        void _parameters;
        return [];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await repository.updateSyncStage({
      syncRunId: "1",
      stage: "validate",
      progress: {
        stage_index: 1,
        stage_total: 3,
      },
      stats: {
        discovered: 12,
      },
    });

    const [, parameters] = unsafe.mock.calls[0];
    expect(parameters?.[2]).toEqual({
      stage_index: 1,
      stage_total: 3,
    });
    expect(parameters?.[3]).toEqual({
      discovered: 12,
    });
    expect(typeof parameters?.[2]).toBe("object");
    expect(typeof parameters?.[3]).toBe("object");
  });

  it("keeps bulk JSONB payloads as arrays for jsonb_to_recordset", async () => {
    const unsafe = vi.fn(
      async (_query: string, _parameters?: unknown[]) => {
        void _query;
        void _parameters;
        return [];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await repository.upsertBusinesses("1", [
      {
        metaBusinessId: "business-1",
        name: "Example Business",
        rawPayload: {
          source: "me/businesses",
        },
      },
    ]);

    const [, parameters] = unsafe.mock.calls[0];
    expect(Array.isArray(parameters?.[1])).toBe(true);
    expect(parameters?.[1]).toEqual([
      {
        meta_business_id: "business-1",
        name: "Example Business",
        verification_status: null,
        raw_payload: {
          source: "me/businesses",
        },
      },
    ]);
  });
});

describe("Ad account activity filters", () => {
  it("sorts Meta ad accounts by operational state before discovery freshness", async () => {
    const unsafe = vi.fn(
      async (_query: string, _parameters?: unknown[]) => {
        void _query;
        void _parameters;
        return [];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await repository.listMetaAssets("connection-1");

    const accountQuery = unsafe.mock.calls
      .map(([query]) => query)
      .find((query) => query.includes("from tracker.meta_ad_accounts"));
    expect(accountQuery).toContain(
      "coalesce(is_active and account_status = 1, false) desc",
    );
  });

  it("filters dashboard delivery performance to operational accounts", async () => {
    const unsafe = vi.fn(
      async (_query: string, _parameters?: unknown[]) => {
        void _query;
        void _parameters;
        return [];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await repository.getDeliveryPerformance({
      connectionId: "connection-1",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-24",
      adAccountId: "42",
      currency: "USD",
    });

    const [query, parameters] = unsafe.mock.calls[0];
    expect(query).toContain("account.connection_id = $1");
    expect(query).toContain("and account.is_active");
    expect(query).toContain("and account.account_status = 1");
    expect(parameters).toEqual([
      "connection-1",
      "2026-07-01",
      "2026-07-24",
      "42",
      "USD",
    ]);
  });

  it("filters campaign inventory by active account by default and bypasses it explicitly", async () => {
    const unsafe = vi.fn(
      async (_query: string, _parameters?: unknown[]) => {
        void _query;
        void _parameters;
        return [];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);
    const filters = {
      connectionId: "connection-1",
      accountMetaId: " act_1 ",
      status: "ACTIVE",
      search: "fox",
      limit: 25,
      offset: 10,
    };

    await repository.listCampaignInventory(filters);
    await repository.listCampaignInventory({
      ...filters,
      includeInactiveAccounts: true,
    });

    const [defaultQuery, defaultParameters] = unsafe.mock.calls[0];
    expect(defaultQuery).toContain("$2::boolean");
    expect(defaultQuery).toContain(
      "or (account.is_active and account.account_status = 1)",
    );
    expect(defaultQuery).toContain(
      "coalesce(campaign.effective_status, campaign.status) = $4",
    );
    expect(defaultQuery).not.toContain("or campaign.status = $4");
    expect(defaultQuery).toContain(
      "coalesce(\n            filtered.is_active",
    );
    expect(defaultQuery).toContain(
      "coalesce(filtered.effective_status, filtered.status) = 'ACTIVE'",
    );
    expect(defaultParameters).toEqual([
      "connection-1",
      false,
      "act_1",
      "ACTIVE",
      "fox",
      25,
      10,
    ]);

    const [inclusiveQuery, inclusiveParameters] = unsafe.mock.calls[1];
    expect(inclusiveQuery).toBe(defaultQuery);
    expect(inclusiveParameters).toEqual([
      "connection-1",
      true,
      "act_1",
      "ACTIVE",
      "fox",
      25,
      10,
    ]);
  });

  it("filters creative tracker by active account by default and bypasses it explicitly", async () => {
    const unsafe = vi.fn(
      async (_query: string, _parameters?: unknown[]) => {
        void _query;
        void _parameters;
        return [];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);
    const filters = {
      connectionId: "connection-1",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-24",
      accountMetaId: " act_1 ",
      campaignMetaId: " campaign-1 ",
      currency: " USD ",
      assetType: "video" as const,
      search: "creative",
      limit: 40,
      offset: 20,
    };

    await repository.listCreativeTracker(filters);
    await repository.listCreativeTracker({
      ...filters,
      includeInactiveAccounts: true,
    });

    const [defaultQuery, defaultParameters] = unsafe.mock.calls[0];
    expect(defaultQuery).toContain("$4::boolean");
    expect(defaultQuery).toContain(
      "or (account.is_active and account.account_status = 1)",
    );
    expect(defaultParameters).toEqual([
      "connection-1",
      "2026-07-01",
      "2026-07-24",
      false,
      "act_1",
      "campaign-1",
      "USD",
      "video",
      "creative",
      40,
      20,
    ]);

    const [inclusiveQuery, inclusiveParameters] = unsafe.mock.calls[1];
    expect(inclusiveQuery).toBe(defaultQuery);
    expect(inclusiveParameters).toEqual([
      "connection-1",
      "2026-07-01",
      "2026-07-24",
      true,
      "act_1",
      "campaign-1",
      "USD",
      "video",
      "creative",
      40,
      20,
    ]);
  });

  it("prioritizes creative linked to active Ads in operational accounts", async () => {
    const unsafe = vi.fn(
      async (_query: string, _parameters?: unknown[]) => {
        void _query;
        void _parameters;
        return [];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await repository.listCreativeLibrary({
      connectionId: "connection-1",
      limit: 50,
      offset: 0,
    });

    const [query, parameters] = unsafe.mock.calls[0];
    expect(query).toContain("account.account_status = 1");
    expect(query).toContain(
      "coalesce(ad.effective_status, ad.status) = 'ACTIVE'",
    );
    expect(query).toContain(
      "(coalesce(ad_usage.active_ad_count, 0) > 0) desc",
    );
    expect(parameters).toEqual(["connection-1", null, null, 50, 0]);
  });

  it("bounds one complete creative-library snapshot at 5,001 rows", async () => {
    const unsafe = vi.fn(
      async (_query: string, _parameters?: unknown[]) => {
        void _query;
        void _parameters;
        return [];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await repository.listCreativeLibrary({
      connectionId: "connection-1",
      limit: 9_000,
      offset: 0,
    });

    expect(unsafe.mock.calls[0]?.[1]).toEqual([
      "connection-1",
      null,
      null,
      5_001,
      0,
    ]);
  });

  it("keeps creative performance and its baseline on operational accounts", async () => {
    const unsafe = vi.fn(
      async (_query: string, _parameters?: unknown[]) => {
        void _query;
        void _parameters;
        return [];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await repository.listCreativePerformance({
      connectionId: "connection-1",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-24",
    });

    const [query] = unsafe.mock.calls[0];
    expect(query).toContain("and account.is_active");
    expect(query).toContain("and account.account_status = 1");
  });
});

describe("Interrupted sync recovery", () => {
  it("resets stale progress when restarting a persisted running row", async () => {
    const unsafe = vi.fn(
      async (_query: string, _parameters?: unknown[]) => {
        void _query;
        void _parameters;
        return [];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await repository.startSyncRun("run-1", "validate");

    const [query, parameters] = unsafe.mock.calls[0];
    expect(query).toContain("started_at = now()");
    expect(query).toContain("finished_at = null");
    expect(query).toContain("progress = '{}'::jsonb");
    expect(query).toContain("stats = '{}'::jsonb");
    expect(parameters).toEqual(["run-1", "validate"]);
  });

  it("fails only older active rows for the same connection", async () => {
    const unsafe = vi.fn(
      async (_query: string, _parameters?: unknown[]) => {
        void _query;
        void _parameters;
        return [
          { sync_run_id: "stale-run-1" },
          { sync_run_id: "stale-run-2" },
        ];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(
      repository.recoverInterruptedSyncRuns("connection-1", "current-run"),
    ).resolves.toBe(2);

    const [query, parameters] = unsafe.mock.calls[0];
    expect(query).toContain("status in ('queued', 'running')");
    expect(query).toContain("sync_run_id < $2");
    expect(query).toContain("STALE_SYNC_RUN_RECOVERED");
    expect(parameters).toEqual(["connection-1", "current-run"]);
  });
});

describe("Creative asset link replacement", () => {
  it("deletes then reinserts in one transaction and collapses duplicate links", async () => {
    const transactionUnsafe = vi.fn(
      async (_query: string, _parameters?: unknown[]) => {
        void _query;
        void _parameters;
        return [];
      },
    );
    const begin = vi.fn(
      async (
        callback: (transaction: { unsafe: typeof transactionUnsafe }) =>
          Promise<unknown>,
      ) => callback({ unsafe: transactionUnsafe }),
    );
    const repository = new TrackerRepository({
      begin,
    } as unknown as DatabaseClient);

    await repository.replaceCreativeAssetLinks(
      ["creative-1", "creative-1"],
      [
        {
          creativeId: "creative-1",
          creativeAssetId: "asset-1",
          position: 0,
          role: "primary",
          source: "creative",
        },
        {
          creativeId: "creative-1",
          creativeAssetId: "asset-1",
          position: 0,
          role: "primary",
          source: "object_story_spec",
        },
      ],
    );

    expect(begin).toHaveBeenCalledTimes(1);
    expect(transactionUnsafe).toHaveBeenCalledTimes(2);

    const [deleteQuery, deleteParameters] = transactionUnsafe.mock.calls[0];
    expect(deleteQuery).toContain(
      "delete from tracker.creative_asset_links",
    );
    expect(deleteQuery).not.toContain("insert into");
    expect(deleteParameters).toEqual([["creative-1"]]);

    const [insertQuery, insertParameters] = transactionUnsafe.mock.calls[1];
    expect(insertQuery).toContain(
      "insert into tracker.creative_asset_links",
    );
    expect(insertParameters?.[0]).toEqual([
      {
        creative_id: "creative-1",
        creative_asset_id: "asset-1",
        position: 0,
        role: "primary",
        source: "object_story_spec",
      },
    ]);
  });
});

describe("Ad creative link replacement", () => {
  it("deletes then reinserts in one transaction and collapses duplicate links", async () => {
    const transactionUnsafe = vi.fn(
      async (_query: string, _parameters?: unknown[]) => {
        void _query;
        void _parameters;
        return [];
      },
    );
    const begin = vi.fn(
      async (
        callback: (transaction: { unsafe: typeof transactionUnsafe }) =>
          Promise<unknown>,
      ) => callback({ unsafe: transactionUnsafe }),
    );
    const repository = new TrackerRepository({
      begin,
    } as unknown as DatabaseClient);

    await repository.replaceAdCreativeLinks(
      ["ad-1", "ad-1"],
      [
        {
          adId: "ad-1",
          creativeId: "creative-1",
          relationship: "secondary",
        },
        {
          adId: "ad-1",
          creativeId: "creative-1",
          relationship: "primary",
        },
      ],
    );

    expect(begin).toHaveBeenCalledTimes(1);
    expect(transactionUnsafe).toHaveBeenCalledTimes(2);

    const [deleteQuery, deleteParameters] = transactionUnsafe.mock.calls[0];
    expect(deleteQuery).toContain(
      "delete from tracker.ad_creative_links",
    );
    expect(deleteQuery).not.toContain("insert into");
    expect(deleteParameters).toEqual([["ad-1"]]);

    const [insertQuery, insertParameters] = transactionUnsafe.mock.calls[1];
    expect(insertQuery).toContain(
      "insert into tracker.ad_creative_links",
    );
    expect(insertParameters?.[0]).toEqual([
      {
        ad_id: "ad-1",
        creative_id: "creative-1",
        relationship: "primary",
      },
    ]);
  });
});
