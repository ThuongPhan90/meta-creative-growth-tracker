import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "./client";
import { TrackerRepository } from "./repository";
import { computeResultMappingVersion } from "./result-mapping-version";
import type { DailyMetricInput, DatabaseId } from "./types";

const TEST_RESULT_MAPPINGS = [
  {
    canonicalResultKey: "purchase",
    rawActionType: "purchase",
    metricSource: "action" as const,
    priority: 0,
    enabled: true,
  },
];
const TEST_RESULT_MAPPING_VERSION = computeResultMappingVersion(
  TEST_RESULT_MAPPINGS,
);
const TEST_RESULT_MAPPING_ROWS = [
  {
    result_mapping_id: 1,
    canonical_key: "purchase",
    raw_action_type: "purchase",
    metric_source: "action",
    priority: 0,
    mapping_source: "system",
    enabled: true,
  },
];

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

describe("Settings audit log", () => {
  it("returns the complete owner-scoped history in deterministic order", async () => {
    const changedAt = new Date("2026-07-29T09:42:00.000Z");
    const unsafe = vi.fn(async (query: string) => {
      void query;
      return [
        {
          settings_audit_id: 7n,
          changed_at: changedAt,
          changed_by: "owner",
          before_state: { reportingCurrency: null },
          after_state: { reportingCurrency: "VND" },
        },
      ];
    });
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(repository.listSettingsAuditLog()).resolves.toEqual([
      {
        settingsAuditId: "7",
        changedAt: changedAt.toISOString(),
        changedBy: "owner",
        beforeState: { reportingCurrency: null },
        afterState: { reportingCurrency: "VND" },
      },
    ]);
    expect(unsafe).toHaveBeenCalledOnce();
    expect(unsafe.mock.calls[0]?.[0]).toContain("where owner_id = 1");
    expect(unsafe.mock.calls[0]?.[0]).toContain(
      "order by changed_at desc, settings_audit_id desc",
    );
    expect(unsafe.mock.calls[0]?.[0]).not.toContain("limit");
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

describe("Atomic daily metric publishing", () => {
  function metric(
    adAccountId: string,
    suffix: string,
    overrides: Partial<DailyMetricInput> = {},
  ): DailyMetricInput {
    return {
      metricDate: "2026-07-20",
      adAccountId,
      campaignId: `campaign-${suffix}`,
      adSetId: `adset-${suffix}`,
      adId: `ad-${suffix}`,
      metricScope: "ad",
      scopeKey: `ad:${suffix}`,
      allocationMethod: "unallocated",
      actionReportTime: "mixed",
      syncVersion: "run-new",
      accountTimezone: "Asia/Ho_Chi_Minh",
      currency: "USD",
      spend: Number(suffix),
      ...overrides,
    };
  }

  function periodReach(
    adAccountId: DatabaseId,
    reach: number,
  ) {
    return {
      adAccountId,
      campaignId: null,
      scopeLevel: "account" as const,
      dateFrom: "2026-07-20",
      dateTo: "2026-07-21",
      attributionWindow: "account_default",
      actionReportTime: "mixed" as const,
      syncVersion: "run-new",
      reach,
    };
  }

  it("commits all account replacements before advancing the snapshot pointer", async () => {
    let visibleSyncVersion = "run-old";
    const versionsVisibleDuringTransaction: string[] = [];
    const rootUnsafe = vi.fn(async () => {
      throw new Error("Atomic publish must not write outside its transaction.");
    });
    const transactionUnsafe = vi.fn(
      async (query: string, _parameters?: unknown[]) => {
        void _parameters;
        versionsVisibleDuringTransaction.push(visibleSyncVersion);
        if (query.includes("from tracker.meta_connections")) {
          return [{ connection_id: "connection-1" }];
        }
        if (query.includes("from tracker.result_mappings mapping")) {
          return TEST_RESULT_MAPPING_ROWS;
        }
        if (query.includes("insert into tracker.daily_metrics")) {
          return [{ affected_count: 2 }];
        }
        if (
          query.includes("insert into tracker.period_reach_snapshots")
        ) {
          return [{ affected_count: 2 }];
        }
        return [];
      },
    );
    const begin = vi.fn(
      async (
        callback: (transaction: { unsafe: typeof transactionUnsafe }) =>
          Promise<unknown>,
      ) => {
        const result = await callback({ unsafe: transactionUnsafe });
        visibleSyncVersion = "run-new";
        return result;
      },
    );
    const repository = new TrackerRepository({
      unsafe: rootUnsafe,
      begin,
    } as unknown as DatabaseClient);

    await expect(
      repository.publishDailyMetricWindows({
        connectionId: "connection-1",
        syncRunId: "run-new",
        resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
        periodReachSnapshots: [
          periodReach("account-1", 100),
          {
            ...periodReach("account-2", 200),
            dateFrom: "2026-07-19",
          },
        ],
        replacements: [
          {
            adAccountId: "account-1",
            dateFrom: "2026-07-20",
            dateTo: "2026-07-21",
            metrics: [
              metric("account-1", "1", {
                syncVersion: "stale-version",
              }),
            ],
          },
          {
            adAccountId: "account-2",
            dateFrom: "2026-07-19",
            dateTo: "2026-07-21",
            metrics: [
              metric("account-2", "2", {
                actionReportTime: "conversion",
              }),
            ],
          },
        ],
      }),
    ).resolves.toBe(2);

    expect(begin).toHaveBeenCalledOnce();
    expect(rootUnsafe).not.toHaveBeenCalled();
    expect(transactionUnsafe).toHaveBeenCalledTimes(13);
    expect(
      transactionUnsafe.mock.calls
        .map(([query]) => query)
        .filter((query) => query.includes("delete from tracker.")),
    ).toEqual([
      expect.stringContaining(
        "delete from tracker.period_reach_snapshots",
      ),
      expect.stringContaining("delete from tracker.action_metric_daily"),
      expect.stringContaining("delete from tracker.action_value_daily"),
      expect.stringContaining("delete from tracker.daily_metrics"),
      expect.stringContaining(
        "delete from tracker.period_reach_snapshots",
      ),
      expect.stringContaining("delete from tracker.action_metric_daily"),
      expect.stringContaining("delete from tracker.action_value_daily"),
      expect.stringContaining("delete from tracker.daily_metrics"),
    ]);

    const metricCall = transactionUnsafe.mock.calls.find(([query]) =>
      query.includes("insert into tracker.daily_metrics"),
    );
    const [metricQuery, metricParameters] = metricCall ?? [];
    expect(metricQuery).toContain("insert into tracker.daily_metrics");
    expect(metricParameters?.[0]).toEqual([
      expect.objectContaining({
        ad_account_id: "account-1",
        action_report_time: "mixed",
        sync_version: "run-new",
      }),
      expect.objectContaining({
        ad_account_id: "account-2",
        action_report_time: "conversion",
        sync_version: "run-new",
      }),
    ]);

    const [pointerQuery, pointerParameters] =
      transactionUnsafe.mock.calls.at(-1) ?? [];
    expect(pointerQuery).toContain("insert into tracker.reporting_snapshots");
    expect(pointerQuery).toContain("on conflict (connection_id) do update");
    expect(pointerParameters).toEqual([
      "connection-1",
      "run-new",
      "run-new",
      TEST_RESULT_MAPPING_VERSION,
      "2026-07-20",
      "2026-07-21",
    ]);
    expect(
      new Set(versionsVisibleDuringTransaction),
    ).toEqual(new Set(["run-old"]));
    expect(versionsVisibleDuringTransaction).toHaveLength(13);
    expect(visibleSyncVersion).toBe("run-new");
  });

  it("does not advance or expose a new snapshot when metric storage fails", async () => {
    let visibleSyncVersion = "run-old";
    const transactionUnsafe = vi.fn(async (query: string) => {
      if (query.includes("from tracker.meta_connections")) {
        return [{ connection_id: "connection-1" }];
      }
      if (query.includes("from tracker.result_mappings mapping")) {
        return TEST_RESULT_MAPPING_ROWS;
      }
      if (query.includes("insert into tracker.daily_metrics")) {
        throw new Error("metric write failed");
      }
      return [];
    });
    const begin = vi.fn(
      async (
        callback: (transaction: { unsafe: typeof transactionUnsafe }) =>
          Promise<unknown>,
      ) => {
        const result = await callback({ unsafe: transactionUnsafe });
        visibleSyncVersion = "run-new";
        return result;
      },
    );
    const repository = new TrackerRepository({
      begin,
    } as unknown as DatabaseClient);

    await expect(
      repository.publishDailyMetricWindows({
        connectionId: "connection-1",
        syncRunId: "run-new",
        resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
        periodReachSnapshots: [periodReach("account-1", 100)],
        replacements: [
          {
            adAccountId: "account-1",
            dateFrom: "2026-07-20",
            dateTo: "2026-07-21",
            metrics: [metric("account-1", "1")],
          },
        ],
      }),
    ).rejects.toThrow("metric write failed");

    expect(
      transactionUnsafe.mock.calls.some(([query]) =>
        query.includes("tracker.reporting_snapshots"),
      ),
    ).toBe(false);
    expect(visibleSyncVersion).toBe("run-old");
  });

  it("aggregates canonical facts once and keeps retries idempotent", async () => {
    const transactions: Array<
      Array<[query: string, parameters?: unknown[]]>
    > = [];
    const begin = vi.fn(
      async (
        callback: (transaction: {
          unsafe: (
            query: string,
            parameters?: unknown[],
          ) => Promise<unknown[]>;
        }) => Promise<unknown>,
      ) => {
        const calls: Array<
          [query: string, parameters?: unknown[]]
        > = [];
        transactions.push(calls);
        return callback({
          unsafe: async (query, parameters) => {
            calls.push([query, parameters]);
            if (query.includes("from tracker.meta_connections")) {
              return [{ connection_id: "connection-1" }];
            }
            if (
              query.includes("from tracker.result_mappings mapping")
            ) {
              return TEST_RESULT_MAPPING_ROWS;
            }
            if (query.includes("insert into tracker.daily_metrics")) {
              return [{ affected_count: 2 }];
            }
            if (
              query.includes("insert into tracker.action_metric_daily") ||
              query.includes("insert into tracker.action_value_daily") ||
              query.includes(
                "insert into tracker.period_reach_snapshots",
              )
            ) {
              return [{ affected_count: 1 }];
            }
            return [];
          },
        });
      },
    );
    const repository = new TrackerRepository({
      begin,
    } as unknown as DatabaseClient);
    const metrics = [
      metric("account-1", "1", {
        scopeKey: "asset:image-1",
        metricScope: "asset",
        allocationMethod: "exact",
        fetchedAt: "2026-07-21T00:00:00.000Z",
        canonicalResultMetrics: [
          {
            canonicalResultKey: "purchase",
            value: 3,
            selectedActionType: "purchase",
          },
        ],
        canonicalResultValues: [
          {
            canonicalResultKey: "purchase_value",
            value: 30,
            selectedActionType: "purchase",
          },
        ],
      }),
      metric("account-1", "1", {
        scopeKey: "asset:image-2",
        metricScope: "asset",
        allocationMethod: "exact",
        fetchedAt: "2026-07-21T00:00:00.000Z",
        canonicalResultMetrics: [
          {
            canonicalResultKey: "purchase",
            value: 2,
            selectedActionType: "purchase",
          },
        ],
        canonicalResultValues: [
          {
            canonicalResultKey: "purchase_value",
            value: 20,
            selectedActionType: "purchase",
          },
        ],
      }),
    ];
    const publish = () =>
      repository.publishDailyMetricWindows({
        connectionId: "connection-1",
        syncRunId: "run-new",
        resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
        periodReachSnapshots: [periodReach("account-1", 100)],
        replacements: [
          {
            adAccountId: "account-1",
            dateFrom: "2026-07-20",
            dateTo: "2026-07-21",
            metrics,
          },
        ],
      });

    await expect(publish()).resolves.toBe(2);
    await expect(publish()).resolves.toBe(2);

    expect(begin).toHaveBeenCalledTimes(2);
    for (const calls of transactions) {
      const metricFactCall = calls.find(([query]) =>
        query.includes("insert into tracker.action_metric_daily"),
      );
      const valueFactCall = calls.find(([query]) =>
        query.includes("insert into tracker.action_value_daily"),
      );
      expect(metricFactCall?.[1]?.[0]).toEqual([
        expect.objectContaining({
          canonical_result_key: "purchase",
          currency: "USD",
          value: 5,
          selected_action_types: ["purchase"],
          sync_version: "run-new",
          result_mapping_version: TEST_RESULT_MAPPING_VERSION,
        }),
      ]);
      expect(valueFactCall?.[1]?.[0]).toEqual([
        expect.objectContaining({
          canonical_result_key: "purchase_value",
          currency: "USD",
          value: 50,
          selected_action_types: ["purchase"],
          sync_version: "run-new",
          result_mapping_version: TEST_RESULT_MAPPING_VERSION,
        }),
      ]);
      expect(metricFactCall?.[0]).toContain(
        "value = excluded.value",
      );
      expect(valueFactCall?.[0]).toContain(
        "value = excluded.value",
      );
      expect(calls.at(-1)?.[0]).toContain(
        "insert into tracker.reporting_snapshots",
      );
      expect(calls.at(-1)?.[1]?.[3]).toBe(
        TEST_RESULT_MAPPING_VERSION,
      );
    }
  });

  it("rolls back the whole publish when an action value fact fails", async () => {
    let visibleSyncVersion = "run-old";
    const calls: string[] = [];
    const begin = vi.fn(
      async (
        callback: (transaction: {
          unsafe: (query: string) => Promise<unknown[]>;
        }) => Promise<unknown>,
      ) => {
        const result = await callback({
          unsafe: async (query) => {
            calls.push(query);
            if (query.includes("from tracker.meta_connections")) {
              return [{ connection_id: "connection-1" }];
            }
            if (
              query.includes("from tracker.result_mappings mapping")
            ) {
              return TEST_RESULT_MAPPING_ROWS;
            }
            if (query.includes("insert into tracker.daily_metrics")) {
              return [{ affected_count: 1 }];
            }
            if (query.includes("insert into tracker.action_metric_daily")) {
              return [{ affected_count: 1 }];
            }
            if (query.includes("insert into tracker.action_value_daily")) {
              throw new Error("action value write failed");
            }
            return [];
          },
        });
        visibleSyncVersion = "run-new";
        return result;
      },
    );
    const repository = new TrackerRepository({
      begin,
    } as unknown as DatabaseClient);

    await expect(
      repository.publishDailyMetricWindows({
        connectionId: "connection-1",
        syncRunId: "run-new",
        resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
        periodReachSnapshots: [periodReach("account-1", 100)],
        replacements: [
          {
            adAccountId: "account-1",
            dateFrom: "2026-07-20",
            dateTo: "2026-07-21",
            metrics: [
              metric("account-1", "1", {
                canonicalResultMetrics: [
                  {
                    canonicalResultKey: "purchase",
                    value: 1,
                    selectedActionType: "purchase",
                  },
                ],
                canonicalResultValues: [
                  {
                    canonicalResultKey: "purchase_value",
                    value: 10,
                    selectedActionType: "purchase",
                  },
                ],
              }),
            ],
          },
        ],
      }),
    ).rejects.toThrow("action value write failed");

    expect(
      calls.some((query) =>
        query.includes("insert into tracker.action_metric_daily"),
      ),
    ).toBe(true);
    expect(
      calls.some((query) =>
        query.includes("tracker.reporting_snapshots"),
      ),
    ).toBe(false);
    expect(visibleSyncVersion).toBe("run-old");
  });

  it("preserves the snapshot when mappings change during a sync", async () => {
    const calls: string[] = [];
    const transactionUnsafe = vi.fn(async (query: string) => {
      calls.push(query);
      if (query.includes("from tracker.meta_connections")) {
        return [{ connection_id: "connection-1" }];
      }
      if (query.includes("from tracker.result_mappings mapping")) {
        return [
          {
            result_mapping_id: 2,
            canonical_key: "purchase",
            raw_action_type: "owner_purchase",
            metric_source: "action",
            priority: 0,
            mapping_source: "owner",
            enabled: true,
          },
        ];
      }
      return [];
    });
    const begin = vi.fn(
      async (
        callback: (transaction: { unsafe: typeof transactionUnsafe }) =>
          Promise<unknown>,
      ) => callback({ unsafe: transactionUnsafe }),
    );
    const repository = new TrackerRepository({
      begin,
    } as unknown as DatabaseClient);

    await expect(
      repository.publishDailyMetricWindows({
        connectionId: "connection-1",
        syncRunId: "run-new",
        resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
        periodReachSnapshots: [periodReach("account-1", 100)],
        replacements: [
          {
            adAccountId: "account-1",
            dateFrom: "2026-07-20",
            dateTo: "2026-07-21",
            metrics: [metric("account-1", "1")],
          },
        ],
      }),
    ).rejects.toThrow("Result mappings changed while Insights were syncing");

    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("for update");
    expect(calls[1]).toContain("from tracker.result_mappings mapping");
    expect(
      calls.some((query) => query.includes("delete from tracker.")),
    ).toBe(false);
    expect(
      calls.some((query) =>
        query.includes("tracker.reporting_snapshots"),
      ),
    ).toBe(false);
  });
});

describe("Canonical result totals", () => {
  it("keeps account currencies split and returns spend-only objectives", async () => {
    const unsafe = vi.fn(async (query: string, parameters?: unknown[]) => {
      void query;
      void parameters;
      return [
        {
          row_kind: "result",
          canonical_result_key: "purchase",
          objective_key: "sales",
          metric_source: "action",
          currency: "USD",
          value: 12,
          objective_spend: 600,
        },
        {
          row_kind: "objective_spend",
          canonical_result_key: null,
          objective_key: "sales",
          metric_source: null,
          currency: "USD",
          value: null,
          objective_spend: 600,
        },
        {
          row_kind: "result",
          canonical_result_key: "purchase",
          objective_key: "sales",
          metric_source: "action",
          currency: "VND",
          value: 7,
          objective_spend: 7_000_000,
        },
        {
          row_kind: "objective_spend",
          canonical_result_key: null,
          objective_key: "sales",
          metric_source: null,
          currency: "VND",
          value: null,
          objective_spend: 7_000_000,
        },
        {
          row_kind: "objective_spend",
          canonical_result_key: null,
          objective_key: "traffic",
          metric_source: null,
          currency: "USD",
          value: null,
          objective_spend: 100,
        },
      ];
    });
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(
      repository.getCanonicalResultTotals({
        connectionId: "connection-1",
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
        adAccountIds: [" act_usd ", "act_vnd"],
        objectiveMappings: [
          {
            objectiveKey: "sales",
            rawObjectiveKeys: ["OUTCOME_SALES", "CONVERSIONS"],
          },
          {
            objectiveKey: "traffic",
            rawObjectiveKeys: ["OUTCOME_TRAFFIC"],
          },
        ],
        attributionWindow: "7d_click_1d_view",
        actionReportTime: "mixed",
        syncVersion: "run-9",
        resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
      }),
    ).resolves.toEqual({
      results: [
        {
          canonicalResultKey: "purchase",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "USD",
          value: 12,
          objectiveSpend: 600,
        },
        {
          canonicalResultKey: "purchase",
          objectiveKey: "sales",
          metricSource: "action",
          currency: "VND",
          value: 7,
          objectiveSpend: 7_000_000,
        },
      ],
      spendByObjective: [
        { objectiveKey: "sales", currency: "USD", spend: 600 },
        {
          objectiveKey: "sales",
          currency: "VND",
          spend: 7_000_000,
        },
        { objectiveKey: "traffic", currency: "USD", spend: 100 },
      ],
    });

    const [query, parameters] = unsafe.mock.calls[0];
    expect(query).toContain("from tracker.action_metric_daily fact");
    expect(query).toContain("from tracker.action_value_daily fact");
    expect(query).toContain("upper(fact.currency) as currency");
    expect(query).toContain(
      "fact.sync_version = scope.snapshot_sync_version",
    );
    expect(query).toContain(
      "fact.result_mapping_version =",
    );
    expect(query).toContain(
      "not scope.normalized_results_require_resync",
    );
    expect(query).toContain(
      "metric.sync_version = scope.snapshot_sync_version",
    );
    expect(query).toContain("from objective_spend spend");
    expect(parameters?.slice(0, 8)).toEqual([
      "connection-1",
      "2026-07-01",
      "2026-07-31",
      ["act_usd", "act_vnd"],
      null,
      null,
      "7d_click_1d_view",
      "mixed",
    ]);
    expect(parameters?.[9]).toBe("run-9");
    expect(parameters?.[10]).toBe(TEST_RESULT_MAPPING_VERSION);
  });

  it("treats an explicit empty account scope as no accounts", async () => {
    const unsafe = vi.fn(async (query: string, parameters?: unknown[]) => {
      void query;
      void parameters;
      return [];
    });
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await repository.getCanonicalResultTotals({
      connectionId: "connection-1",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      adAccountIds: [],
      objectiveMappings: [
        {
          objectiveKey: "sales",
          rawObjectiveKeys: ["OUTCOME_SALES"],
        },
      ],
      attributionWindow: "7d_click_1d_view",
      actionReportTime: "mixed",
      syncVersion: "run-9",
      resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
    });

    expect(unsafe.mock.calls[0]?.[1]?.[3]).toEqual([]);
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
      attributionWindow: "account_default",
      actionReportTime: "mixed",
      syncVersion: "sync_42",
    });

    const [query, parameters] = unsafe.mock.calls[0];
    expect(query).toContain("account.connection_id = $1");
    expect(query).toContain("and account.is_active");
    expect(query).toContain("and account.account_status = 1");
    expect(query).toContain("metric.attribution_window = $8");
    expect(query).toContain("metric.action_report_time = $9");
    expect(query).toContain("metric.sync_version = $10");
    expect(parameters).toEqual([
      "connection-1",
      "2026-07-01",
      "2026-07-24",
      "42",
      "USD",
      null,
      null,
      "account_default",
      "mixed",
      "sync_42",
      null,
    ]);
  });

  it("returns daily Overview trend as separate currency series", async () => {
    const unsafe = vi.fn(
      async (_query: string, _parameters?: unknown[]) => {
        void _query;
        void _parameters;
        return [
          {
            metric_date: "2026-07-01",
            currency: "USD",
            spend: 100,
            impressions: 1_000,
            link_clicks: 50,
            installs: 10,
            registrations: 5,
            video_3s_views: 200,
            video_100_views: 100,
          },
          {
            metric_date: "2026-07-01",
            currency: "VND",
            spend: 250_000,
            impressions: 2_000,
            link_clicks: 80,
            installs: 5,
            registrations: 2,
            video_3s_views: 300,
            video_100_views: 120,
          },
        ];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    const result = await repository.getDeliveryTrend({
      connectionId: "connection-1",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-24",
      adAccountId: "42",
      accountMetaId: " act_123 ",
      campaignMetaId: " campaign_456 ",
      attributionWindow: "7d_click_1d_view",
      actionReportTime: "conversion",
      syncVersion: "sync_42",
    });

    const [query, parameters] = unsafe.mock.calls[0];
    expect(query).toContain(
      "group by metric.metric_date, metric.currency",
    );
    expect(query).toContain("account.meta_ad_account_id = $6");
    expect(query).toContain("selected_campaign.meta_campaign_id = $7");
    expect(query).toContain("metric.attribution_window = $8");
    expect(query).toContain("metric.action_report_time = $9");
    expect(query).toContain("metric.sync_version = $10");
    expect(parameters).toEqual([
      "connection-1",
      "2026-07-01",
      "2026-07-24",
      "42",
      null,
      "act_123",
      "campaign_456",
      "7d_click_1d_view",
      "conversion",
      "sync_42",
      null,
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      metricDate: "2026-07-01",
      currency: "USD",
      cpi: 10,
      costPerRegistration: 20,
    });
    expect(result[1]).toMatchObject({
      metricDate: "2026-07-01",
      currency: "VND",
      cpi: 50_000,
      costPerRegistration: 125_000,
    });
  });

  it("passes a normalized currency filter to daily trend", async () => {
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

    await repository.getDeliveryTrend({
      connectionId: "connection-1",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-24",
      currency: " USD ",
    });

    expect(unsafe.mock.calls[0]?.[1]?.[4]).toBe("USD");
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
      attributionWindow: "account_default",
      actionReportTime: "mixed" as const,
      syncVersion: "sync_42",
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
    expect(defaultQuery).toContain("metric.attribution_window = $11");
    expect(defaultQuery).toContain("metric.action_report_time = $12");
    expect(defaultQuery).toContain("metric.sync_version = $13");
    expect(defaultParameters).toEqual([
      "connection-1",
      false,
      "act_1",
      "ACTIVE",
      "fox",
      null,
      null,
      null,
      25,
      10,
      "account_default",
      "mixed",
      "sync_42",
      null,
    ]);

    const [inclusiveQuery, inclusiveParameters] = unsafe.mock.calls[1];
    expect(inclusiveQuery).toBe(defaultQuery);
    expect(inclusiveParameters).toEqual([
      "connection-1",
      true,
      "act_1",
      "ACTIVE",
      "fox",
      null,
      null,
      null,
      25,
      10,
      "account_default",
      "mixed",
      "sync_42",
      null,
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
    expect(parameters).toEqual([
      "connection-1",
      null,
      null,
      50,
      0,
      null,
    ]);
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
      null,
    ]);
  });

  it("looks up one Creative Family before applying the list limit", async () => {
    const familyId = "cf_0123456789abcdef01234567";
    const unsafe = vi.fn(
      async (_query: string, _parameters?: unknown[]) => {
        void _query;
        void _parameters;
        return [
          {
            creative_asset_id: "asset-7001",
            creative_family_id: familyId,
            asset_key: "video:7001",
            asset_type: "video",
            meta_video_id: "7001",
            meta_image_hash: null,
            name: "Family beyond snapshot cap",
            thumbnail_url: null,
            preview_url: null,
            width: 1080,
            height: 1920,
            duration_seconds: 15,
            creative_codes: ["V7001-VA"],
            page_names: [],
            creative_container_count: 1,
            ad_count: 1,
            current_ad_count: 1,
            active_ad_count: 1,
            ad_account_count: 1,
            page_count: 0,
            meta_creative_ids: ["creative-7001"],
            ad_ids: ["ad-7001"],
            campaign_ids: ["campaign-7001"],
            ad_account_ids: ["act_1"],
            page_ids: [],
            last_used_at: "2026-07-30T00:00:00.000Z",
            last_seen_at: "2026-07-30T00:00:00.000Z",
          },
        ];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    const result = await repository.getCreativeFamilyById(
      "connection-1",
      familyId,
    );

    const [query, parameters] = unsafe.mock.calls[0];
    expect(query).toContain("asset.creative_family_id = $6");
    expect(query.indexOf("asset.creative_family_id = $6")).toBeLessThan(
      query.indexOf("limit $4"),
    );
    expect(parameters).toEqual([
      "connection-1",
      null,
      null,
      1,
      0,
      familyId,
    ]);
    expect(result).toMatchObject({
      creativeAssetId: "asset-7001",
      creativeFamilyId: familyId,
    });
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

  it("filters Creative Family performance by canonical ID and context", async () => {
    const familyId = "cf_0123456789abcdef01234567";
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
      creativeFamilyId: familyId,
      dateFrom: "2026-07-01",
      dateTo: "2026-07-30",
      currency: "VND",
      accountMetaId: "act_1",
      campaignMetaId: "campaign_1",
      attributionWindow: "account_default",
      actionReportTime: "mixed",
      syncVersion: "sync_42",
    });

    const [query, parameters] = unsafe.mock.calls[0];
    expect(query).toContain("asset.creative_family_id = $11");
    expect(query).toContain("metric.attribution_window = $12");
    expect(query).toContain("metric.action_report_time = $13");
    expect(query).toContain("metric.sync_version = $14");
    expect(parameters?.slice(8)).toEqual([
      "act_1",
      "campaign_1",
      familyId,
      "account_default",
      "mixed",
      "sync_42",
      null,
    ]);
  });

  it("applies one normalized Objective boundary to Campaign, Creative, delivery, and trend queries", async () => {
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
    const objectiveRawKeys = [
      " outcome_leads ",
      "lead_generation",
    ];

    await repository.listCampaignInventory({
      connectionId: "connection-1",
      objectiveRawKeys,
    });
    await repository.listCreativePerformance({
      connectionId: "connection-1",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      objectiveRawKeys,
    });
    await repository.getDeliveryPerformance({
      connectionId: "connection-1",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      objectiveRawKeys,
    });
    await repository.getDeliveryTrend({
      connectionId: "connection-1",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      objectiveRawKeys,
    });

    expect(unsafe).toHaveBeenCalledTimes(4);
    for (const [, parameters] of unsafe.mock.calls) {
      expect(parameters?.at(-1)).toEqual([
        "OUTCOME_LEADS",
        "LEAD_GENERATION",
      ]);
    }
    expect(unsafe.mock.calls[0]?.[0]).toContain(
      "upper(coalesce(campaign.objective, ''))",
    );
    for (const [query] of unsafe.mock.calls.slice(1)) {
      expect(query).toContain(
        "upper(coalesce(objective_campaign.objective, ''))",
      );
    }
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
