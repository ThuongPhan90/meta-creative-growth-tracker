import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "./client";
import { SettingsUpdateConflictError } from "./errors";
import { TrackerRepository } from "./repository";
import { computeResultMappingVersion } from "./result-mapping-version";
import type { MetricDisplayPresets } from "@/lib/reporting/metric-preset";
import type {
  DailyMetricInput,
  DatabaseId,
  PeriodReachSnapshotInput,
} from "./types";

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

const AVAILABLE_CANONICAL_SNAPSHOT_ROW = {
  snapshot_status: "available",
  snapshot_sync_version: "run-9",
  snapshot_result_mapping_version: TEST_RESULT_MAPPING_VERSION,
};

function compactSql(query: string) {
  return query.replace(/\s+/g, " ").trim();
}

function expectAccountDefaultAwareAttributionFilter(input: {
  query: string;
  metricAlias: string;
  parameter: string;
  optional?: boolean;
}) {
  const normalized = compactSql(input.query);
  const nullablePrefix = input.optional
    ? `${input.parameter}::text is null or `
    : "";

  expect(normalized).toContain(
    `${nullablePrefix}${input.parameter} = 'account_default' or ${input.metricAlias}.attribution_window = ${input.parameter}`,
  );
}

describe("Meta connection owner claim", () => {
  it("uses one atomic statement and returns null for a different owner", async () => {
    const unsafe = vi.fn(async (query: string, parameters?: unknown[]) => {
      void parameters;
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

describe("Metric display preset settings persistence", () => {
  const currentUpdatedAt = new Date("2026-08-01T10:00:00.000Z");
  const baseSettingsRow = {
    owner_id: 1,
    reporting_timezone: "Asia/Ho_Chi_Minh",
    reporting_currency: "VND",
    sync_lookback_days: 30,
    minimum_install_threshold: 20,
    minimum_registration_threshold: 10,
    benchmark_mode: "os",
    benchmark_window_days: 30,
    benchmark_by_os: true,
    benchmark_by_format: true,
    number_format: "vi-VN",
    compare_default: "previous_period",
    scoring_weight_cpi: 40,
    scoring_weight_cpa: 40,
    scoring_weight_hook: 10,
    scoring_weight_hold: 10,
    sync_cadence: "manual",
    alert_channel: "none",
    install_action_types: ["mobile_app_install"],
    registration_action_types: ["complete_registration"],
    metric_display_presets: { version: 1, presets: {} },
    last_initial_sync_at: null,
    updated_at: currentUpdatedAt,
  };

  it("locks current settings, stores versioned JSONB and writes the full audit trail", async () => {
    const unsafe = vi.fn(async (query: string, parameters?: unknown[]) => {
      void parameters;
      if (query.includes("select * from tracker.app_settings")) {
        return [baseSettingsRow];
      }
      if (query.includes("update tracker.app_settings")) {
        return [
          {
            ...baseSettingsRow,
            metric_display_presets: {
              version: 1,
              presets: { "sales:purchase": ["spend"] },
            },
            updated_at: new Date("2026-08-01T10:01:00.000Z"),
          },
        ];
      }
      return [];
    });
    const repository = new TrackerRepository({
      begin: async (
        callback: (transaction: { unsafe: typeof unsafe }) => Promise<unknown>,
      ) => callback({ unsafe }),
    } as unknown as DatabaseClient);

    const next: MetricDisplayPresets = {
      version: 1,
      presets: { "sales:purchase": ["spend"] },
    };
    const normalizedNext: MetricDisplayPresets = {
      version: 1,
      presets: {
        "sales:purchase": [
          "spend",
          "result:purchase",
          "efficiency:purchase",
        ],
      },
    };
    await expect(
      repository.updateSettings({
        metricDisplayPresets: next,
        expectedUpdatedAt: currentUpdatedAt.toISOString(),
      }),
    ).resolves.toMatchObject({
      metricDisplayPresets: normalizedNext,
      updatedAt: "2026-08-01T10:01:00.000Z",
    });

    const updateCall = unsafe.mock.calls.find(([query]) =>
      query.includes("update tracker.app_settings"),
    );
    expect(updateCall?.[0]).toContain("metric_display_presets = $21::jsonb");
    expect(updateCall?.[1]?.[20]).toEqual(normalizedNext);
    const auditCall = unsafe.mock.calls.find(([query]) =>
      query.includes("insert into tracker.settings_audit_log"),
    );
    expect(auditCall?.[1]?.[0]).toMatchObject({
      metricDisplayPresets: { version: 1, presets: {} },
    });
    expect(auditCall?.[1]?.[1]).toMatchObject({
      metricDisplayPresets: normalizedNext,
    });
  });

  it("fails closed when the caller carries an older settings revision", async () => {
    const unsafe = vi.fn(async (query: string, parameters?: unknown[]) => {
      void query;
      void parameters;
      return [baseSettingsRow];
    });
    const repository = new TrackerRepository({
      begin: async (
        callback: (transaction: { unsafe: typeof unsafe }) => Promise<unknown>,
      ) => callback({ unsafe }),
    } as unknown as DatabaseClient);

    await expect(
      repository.updateSettings({
        metricDisplayPresets: { version: 1, presets: {} },
        expectedUpdatedAt: "2026-08-01T09:59:00.000Z",
      }),
    ).rejects.toBeInstanceOf(SettingsUpdateConflictError);
    expect(unsafe).toHaveBeenCalledOnce();
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
            attributionWindow: "1d_click",
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
                attributionWindow: "1d_click",
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

  it("advances the snapshot for an exact zero-delivery account window", async () => {
    const transactionUnsafe = vi.fn(
      async (query: string, _parameters?: unknown[]) => {
        void _parameters;
        if (query.includes("from tracker.meta_connections")) {
          return [{ connection_id: "connection-1" }];
        }
        if (query.includes("from tracker.result_mappings mapping")) {
          return TEST_RESULT_MAPPING_ROWS;
        }
        if (query.includes("insert into tracker.period_reach_snapshots")) {
          return [{ affected_count: 1 }];
        }
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

    await expect(
      repository.publishDailyMetricWindows({
        connectionId: "connection-1",
        syncRunId: "run-new",
        resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
        periodReachSnapshots: [periodReach("account-1", 0)],
        replacements: [
          {
            adAccountId: "account-1",
            dateFrom: "2026-07-20",
            dateTo: "2026-07-21",
            metrics: [],
          },
        ],
      }),
    ).resolves.toBe(0);

    expect(begin).toHaveBeenCalledOnce();
    expect(
      transactionUnsafe.mock.calls.some(([query]) =>
        query.includes("insert into tracker.period_reach_snapshots"),
      ),
    ).toBe(true);
    const [pointerQuery, pointerParameters] =
      transactionUnsafe.mock.calls.at(-1) ?? [];
    expect(pointerQuery).toContain("insert into tracker.reporting_snapshots");
    expect(pointerParameters).toEqual([
      "connection-1",
      "run-new",
      "run-new",
      TEST_RESULT_MAPPING_VERSION,
      "2026-07-20",
      "2026-07-21",
    ]);
  });

  it("rejects multiple daily attribution windows across distinct grains in one account", async () => {
    const begin = vi.fn(async () => {
      throw new Error("The invalid publish must not open a transaction.");
    });
    const repository = new TrackerRepository({
      begin,
    } as unknown as DatabaseClient);
    await expect(
      repository.publishDailyMetricWindows({
        connectionId: "connection-1",
        syncRunId: "run-new",
        resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
        periodReachSnapshots: [
          {
            ...periodReach("account-1", 100),
            attributionWindow: "7d_click_1d_view",
          },
        ],
        replacements: [
          {
            adAccountId: "account-1",
            dateFrom: "2026-07-20",
            dateTo: "2026-07-21",
            metrics: [
              metric("account-1", "1", {
                attributionWindow: "7d_click_1d_view",
              }),
              metric("account-1", "2", {
                metricScope: "asset",
                scopeKey: "image:image-2",
                allocationMethod: "exact",
                creativeId: "creative-2",
                creativeAssetId: "asset-2",
                attributionWindow: "1d_click",
              }),
            ],
          },
        ],
      }),
    ).rejects.toThrow(
      "cannot include multiple concrete attribution windows for one ad account",
    );

    expect(begin).not.toHaveBeenCalled();
  });

  it("rejects multiple period Reach attribution windows across scopes in one account", async () => {
    const begin = vi.fn(async () => {
      throw new Error("The invalid publish must not open a transaction.");
    });
    const repository = new TrackerRepository({
      begin,
    } as unknown as DatabaseClient);
    const accountReach: PeriodReachSnapshotInput = {
      ...periodReach("account-1", 100),
      attributionWindow: "7d_click_1d_view",
    };
    const campaignReach: PeriodReachSnapshotInput = {
      ...accountReach,
      campaignId: "campaign-1",
      scopeLevel: "campaign",
      reach: 80,
    };
    await expect(
      repository.publishDailyMetricWindows({
        connectionId: "connection-1",
        syncRunId: "run-new",
        resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
        periodReachSnapshots: [
          accountReach,
          {
            ...campaignReach,
            attributionWindow: "1d_click",
          },
        ],
        replacements: [
          {
            adAccountId: "account-1",
            dateFrom: "2026-07-20",
            dateTo: "2026-07-21",
            metrics: [
              metric("account-1", "1", {
                attributionWindow: "7d_click_1d_view",
              }),
            ],
          },
        ],
      }),
    ).rejects.toThrow(
      "cannot include multiple concrete period Reach attribution windows for one ad account",
    );

    expect(begin).not.toHaveBeenCalled();
  });

  it("rejects a period Reach window that differs from the account daily window", async () => {
    const begin = vi.fn(async () => {
      throw new Error("The invalid publish must not open a transaction.");
    });
    const repository = new TrackerRepository({
      begin,
    } as unknown as DatabaseClient);

    await expect(
      repository.publishDailyMetricWindows({
        connectionId: "connection-1",
        syncRunId: "run-new",
        resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
        periodReachSnapshots: [
          {
            ...periodReach("account-1", 100),
            attributionWindow: "1d_click",
          },
        ],
        replacements: [
          {
            adAccountId: "account-1",
            dateFrom: "2026-07-20",
            dateTo: "2026-07-21",
            metrics: [
              metric("account-1", "1", {
                attributionWindow: "7d_click_1d_view",
              }),
            ],
          },
        ],
      }),
    ).rejects.toThrow(
      "Period Reach attribution window does not match its daily metrics",
    );
    expect(begin).not.toHaveBeenCalled();
  });

  it("normalizes account_default sentinels to the one concrete account window", async () => {
    const transactionUnsafe = vi.fn(
      async (query: string, parameters?: unknown[]) => {
        if (query.includes("from tracker.meta_connections")) {
          return [{ connection_id: "connection-1" }];
        }
        if (query.includes("from tracker.result_mappings mapping")) {
          return TEST_RESULT_MAPPING_ROWS;
        }
        if (query.includes("insert into tracker.daily_metrics")) {
          return [
            {
              affected_count: Array.isArray(parameters?.[0])
                ? parameters[0].length
                : 0,
            },
          ];
        }
        if (
          query.includes("insert into tracker.period_reach_snapshots")
        ) {
          return [
            {
              affected_count: Array.isArray(parameters?.[1])
                ? parameters[1].length
                : 0,
            },
          ];
        }
        return [];
      },
    );
    const begin = vi.fn(
      async (
        callback: (transaction: {
          unsafe: typeof transactionUnsafe;
        }) => Promise<unknown>,
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
        periodReachSnapshots: [
          periodReach("account-1", 100),
          periodReach("account-2", 200),
          {
            ...periodReach("account-2", 150),
            campaignId: "campaign-3",
            scopeLevel: "campaign",
            attributionWindow: "1d_click",
          },
        ],
        replacements: [
          {
            adAccountId: "account-1",
            dateFrom: "2026-07-20",
            dateTo: "2026-07-21",
            metrics: [
              metric("account-1", "1", {
                attributionWindow: "account_default",
              }),
              metric("account-1", "2", {
                attributionWindow: "7d_click_1d_view",
              }),
            ],
          },
          {
            adAccountId: "account-2",
            dateFrom: "2026-07-20",
            dateTo: "2026-07-21",
            metrics: [
              metric("account-2", "3", {
                attributionWindow: "account_default",
              }),
            ],
          },
        ],
      }),
    ).resolves.toBe(3);

    const dailyCall = transactionUnsafe.mock.calls.find(([query]) =>
      query.includes("insert into tracker.daily_metrics"),
    );
    expect(dailyCall?.[1]?.[0]).toEqual([
      expect.objectContaining({
        ad_account_id: "account-1",
        attribution_window: "7d_click_1d_view",
      }),
      expect.objectContaining({
        ad_account_id: "account-1",
        attribution_window: "7d_click_1d_view",
      }),
      expect.objectContaining({
        ad_account_id: "account-2",
        attribution_window: "1d_click",
      }),
    ]);
    const reachPayloads = transactionUnsafe.mock.calls
      .filter(([query]) =>
        query.includes("insert into tracker.period_reach_snapshots"),
      )
      .flatMap(([, parameters]) =>
        Array.isArray(parameters?.[1]) ? parameters[1] : [],
      );
    expect(reachPayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ad_account_id: "account-1",
          attribution_window: "7d_click_1d_view",
        }),
        expect.objectContaining({
          ad_account_id: "account-2",
          attribution_window: "1d_click",
        }),
        expect.objectContaining({
          ad_account_id: "account-2",
          campaign_id: "campaign-3",
          attribution_window: "1d_click",
        }),
      ]),
    );
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
          ...AVAILABLE_CANONICAL_SNAPSHOT_ROW,
          row_kind: "result",
          canonical_result_key: "purchase",
          objective_key: "sales",
          metric_source: "action",
          currency: "USD",
          value: 12,
          objective_spend: 600,
        },
        {
          ...AVAILABLE_CANONICAL_SNAPSHOT_ROW,
          row_kind: "objective_spend",
          canonical_result_key: null,
          objective_key: "sales",
          metric_source: null,
          currency: "USD",
          value: null,
          objective_spend: 600,
        },
        {
          ...AVAILABLE_CANONICAL_SNAPSHOT_ROW,
          row_kind: "result",
          canonical_result_key: "purchase",
          objective_key: "sales",
          metric_source: "action",
          currency: "VND",
          value: 7,
          objective_spend: 7_000_000,
        },
        {
          ...AVAILABLE_CANONICAL_SNAPSHOT_ROW,
          row_kind: "objective_spend",
          canonical_result_key: null,
          objective_key: "sales",
          metric_source: null,
          currency: "VND",
          value: null,
          objective_spend: 7_000_000,
        },
        {
          ...AVAILABLE_CANONICAL_SNAPSHOT_ROW,
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
        attributionWindow: "account_default",
        actionReportTime: "mixed",
        syncVersion: "run-9",
        resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
      }),
    ).resolves.toEqual({
      available: true,
      syncVersion: "run-9",
      resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
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
    expectAccountDefaultAwareAttributionFilter({
      query,
      metricAlias: "fact",
      parameter: "$7",
    });
    expectAccountDefaultAwareAttributionFilter({
      query,
      metricAlias: "metric",
      parameter: "$7",
    });
    expect(
      compactSql(query).match(/fact\.attribution_window = \$7/g),
    ).toHaveLength(2);
    expect(query).toContain("from objective_delivery spend");
    expect(parameters?.slice(0, 8)).toEqual([
      "connection-1",
      "2026-07-01",
      "2026-07-31",
      ["act_usd", "act_vnd"],
      null,
      null,
      "account_default",
      "mixed",
    ]);
    expect(parameters?.[9]).toBe("run-9");
    expect(parameters?.[10]).toBe(TEST_RESULT_MAPPING_VERSION);
  });

  it("returns objective-scoped native delivery results without synthesizing Reach", async () => {
    const unsafe = vi.fn(async (query: string, parameters?: unknown[]) => {
      void query;
      void parameters;
      return [
        {
          ...AVAILABLE_CANONICAL_SNAPSHOT_ROW,
          row_kind: "result",
          canonical_result_key: "impressions",
          objective_key: "awareness",
          metric_source: "delivery",
          currency: "USD",
          value: 1_200,
          objective_spend: 50,
        },
        {
          ...AVAILABLE_CANONICAL_SNAPSHOT_ROW,
          row_kind: "result",
          canonical_result_key: "link_click",
          objective_key: "traffic",
          metric_source: "delivery",
          currency: "USD",
          value: 45,
          objective_spend: 100,
        },
        {
          ...AVAILABLE_CANONICAL_SNAPSHOT_ROW,
          row_kind: "objective_spend",
          canonical_result_key: null,
          objective_key: "awareness",
          metric_source: null,
          currency: "USD",
          value: null,
          objective_spend: 50,
        },
        {
          ...AVAILABLE_CANONICAL_SNAPSHOT_ROW,
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
        objectiveMappings: [
          {
            objectiveKey: "awareness",
            rawObjectiveKeys: ["OUTCOME_AWARENESS"],
          },
          {
            objectiveKey: "traffic",
            rawObjectiveKeys: ["OUTCOME_TRAFFIC"],
          },
        ],
        attributionWindow: "account_default",
        actionReportTime: "mixed",
        syncVersion: "run-9",
        resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
      }),
    ).resolves.toEqual({
      available: true,
      syncVersion: "run-9",
      resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
      results: [
        {
          canonicalResultKey: "impressions",
          objectiveKey: "awareness",
          metricSource: "delivery",
          currency: "USD",
          value: 1_200,
          objectiveSpend: 50,
        },
        {
          canonicalResultKey: "link_click",
          objectiveKey: "traffic",
          metricSource: "delivery",
          currency: "USD",
          value: 45,
          objectiveSpend: 100,
        },
      ],
      spendByObjective: [
        { objectiveKey: "awareness", currency: "USD", spend: 50 },
        { objectiveKey: "traffic", currency: "USD", spend: 100 },
      ],
    });

    const [query] = unsafe.mock.calls[0];
    const normalized = compactSql(query);
    expect(normalized).toContain(
      "sum(metric.impressions)::numeric as impressions",
    );
    expect(normalized).toContain(
      "sum(metric.link_clicks)::numeric as link_clicks",
    );
    expect(normalized).toContain(
      "'impressions'::text as canonical_result_key",
    );
    expect(normalized).toContain(
      "'link_click'::text as canonical_result_key",
    );
    expect(normalized).toContain("'delivery'::text as metric_source");
    expect(normalized).toContain("select * from delivery_totals");
    expect(
      normalized.match(
        /fact\.canonical_result_key not in \( 'reach', 'impressions', 'link_click' \)/g,
      ),
    ).toHaveLength(2);
    expect(query).not.toContain(
      "'reach'::text as canonical_result_key",
    );
    expectAccountDefaultAwareAttributionFilter({
      query,
      metricAlias: "metric",
      parameter: "$7",
    });
  });

  it("treats an explicit empty account scope as no accounts", async () => {
    const unsafe = vi.fn(async (query: string, parameters?: unknown[]) => {
      void query;
      void parameters;
      return [AVAILABLE_CANONICAL_SNAPSHOT_ROW];
    });
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(
      repository.getCanonicalResultTotals({
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
      }),
    ).resolves.toEqual({
      available: true,
      syncVersion: "run-9",
      resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
      results: [],
      spendByObjective: [],
    });

    expect(unsafe.mock.calls[0]?.[1]?.[3]).toEqual([]);
  });

  it.each([
    ["reporting_snapshot_unavailable", "reporting_snapshot_unavailable"],
    ["reporting_snapshot_stale", "reporting_snapshot_stale"],
  ] as const)(
    "returns %s instead of conflating snapshot state with an empty report",
    async (snapshotStatus, reason) => {
      const unsafe = vi.fn(async () => [
        {
          snapshot_status: snapshotStatus,
          snapshot_sync_version: "run-other",
          snapshot_result_mapping_version: "mapping-other",
        },
      ]);
      const repository = new TrackerRepository({
        unsafe,
      } as unknown as DatabaseClient);

      await expect(
        repository.getCanonicalResultTotals({
          connectionId: "connection-1",
          dateFrom: "2026-07-01",
          dateTo: "2026-07-31",
          objectiveMappings: [],
          attributionWindow: "account_default",
          actionReportTime: "mixed",
          syncVersion: "run-9",
          resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
        }),
      ).resolves.toEqual({
        available: false,
        reason,
        results: [],
        spendByObjective: [],
      });
    },
  );
});

describe("Canonical result trend", () => {
  it("returns snapshot-pinned daily Result rows with Objective spend", async () => {
    const unsafe = vi.fn(async (query: string, parameters?: unknown[]) => {
      void query;
      void parameters;
      return [
        {
          ...AVAILABLE_CANONICAL_SNAPSHOT_ROW,
          metric_date: "2026-07-01",
          canonical_result_key: "install",
          objective_key: "app_promotion",
          metric_source: "action",
          currency: "USD",
          value: 10,
          daily_spend: 100,
        },
        {
          ...AVAILABLE_CANONICAL_SNAPSHOT_ROW,
          metric_date: "2026-07-01",
          canonical_result_key: "purchase_value",
          objective_key: "sales",
          metric_source: "action_value",
          currency: "USD",
          value: 250,
          daily_spend: 80,
        },
        {
          ...AVAILABLE_CANONICAL_SNAPSHOT_ROW,
          metric_date: "2026-07-02",
          canonical_result_key: "link_click",
          objective_key: "traffic",
          metric_source: "delivery",
          currency: "USD",
          value: 45,
          daily_spend: 120,
        },
      ];
    });
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(
      repository.getCanonicalResultTrend({
        connectionId: "connection-1",
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
        adAccountIds: [" act_1 "],
        campaignMetaIds: [" campaign_1 "],
        objectiveKeys: [" APP_PROMOTION ", "sales", "traffic"],
        objectiveMappings: [
          {
            objectiveKey: "app_promotion",
            rawObjectiveKeys: ["OUTCOME_APP_PROMOTION"],
          },
          {
            objectiveKey: "sales",
            rawObjectiveKeys: ["OUTCOME_SALES"],
          },
          {
            objectiveKey: "traffic",
            rawObjectiveKeys: ["OUTCOME_TRAFFIC"],
          },
        ],
        currency: " usd ",
        attributionWindow: "account_default",
        actionReportTime: "mixed",
        syncVersion: " run-9 ",
        resultMappingVersion: ` ${TEST_RESULT_MAPPING_VERSION} `,
      }),
    ).resolves.toEqual({
      available: true,
      syncVersion: "run-9",
      resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
      results: [
        {
          metricDate: "2026-07-01",
          canonicalResultKey: "install",
          objectiveKey: "app_promotion",
          metricSource: "action",
          currency: "USD",
          value: 10,
          dailySpend: 100,
        },
        {
          metricDate: "2026-07-01",
          canonicalResultKey: "purchase_value",
          objectiveKey: "sales",
          metricSource: "action_value",
          currency: "USD",
          value: 250,
          dailySpend: 80,
        },
        {
          metricDate: "2026-07-02",
          canonicalResultKey: "link_click",
          objectiveKey: "traffic",
          metricSource: "delivery",
          currency: "USD",
          value: 45,
          dailySpend: 120,
        },
      ],
    });

    const [query, parameters] = unsafe.mock.calls[0];
    const normalized = compactSql(query);
    expect(normalized).toContain(
      "from tracker.action_metric_daily fact",
    );
    expect(normalized).toContain(
      "from tracker.action_value_daily fact",
    );
    expect(normalized).toContain(
      "sum(metric.impressions)::numeric as impressions",
    );
    expect(normalized).toContain(
      "sum(metric.link_clicks)::numeric as link_clicks",
    );
    expect(normalized).toContain(
      "group by fact.metric_date, fact.canonical_result_key, scope.objective_key, upper(fact.currency)",
    );
    expect(normalized).toContain(
      "delivery.metric_date = total.metric_date",
    );
    expect(normalized).toContain(
      "coalesce(delivery.daily_spend, 0) as daily_spend",
    );
    expect(
      normalized.match(
        /fact\.canonical_result_key not in \( 'reach', 'impressions', 'link_click' \)/g,
      ),
    ).toHaveLength(2);
    expect(query).not.toContain(
      "'reach'::text as canonical_result_key",
    );
    expectAccountDefaultAwareAttributionFilter({
      query,
      metricAlias: "fact",
      parameter: "$7",
    });
    expectAccountDefaultAwareAttributionFilter({
      query,
      metricAlias: "metric",
      parameter: "$7",
    });
    expect(normalized).toContain(
      "fact.sync_version = scope.snapshot_sync_version",
    );
    expect(normalized).toContain(
      "fact.result_mapping_version = scope.snapshot_result_mapping_version",
    );
    expect(normalized).toContain(
      "not scope.normalized_results_require_resync",
    );
    expect(normalized).toContain(
      "campaign.meta_campaign_id = any($12::text[])",
    );
    expect(parameters?.slice(0, 8)).toEqual([
      "connection-1",
      "2026-07-01",
      "2026-07-31",
      ["act_1"],
      ["app_promotion", "sales", "traffic"],
      "USD",
      "account_default",
      "mixed",
    ]);
    expect(parameters?.[9]).toBe("run-9");
    expect(parameters?.[10]).toBe(TEST_RESULT_MAPPING_VERSION);
    expect(parameters?.[11]).toEqual(["campaign_1"]);
  });

  it("keeps an exact attribution request exact and preserves an available empty Objective registry", async () => {
    const unsafe = vi.fn(
      async (_query: string, _parameters?: unknown[]) => {
        void _query;
        void _parameters;
        return [AVAILABLE_CANONICAL_SNAPSHOT_ROW];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);
    const base = {
      connectionId: "connection-1" as DatabaseId,
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      attributionWindow: "7d_click_1d_view",
      actionReportTime: "mixed" as const,
      syncVersion: "run-9",
      resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
    };

    await repository.getCanonicalResultTrend({
      ...base,
      objectiveMappings: [
        {
          objectiveKey: "sales",
          rawObjectiveKeys: ["OUTCOME_SALES"],
        },
      ],
    });
    expect(unsafe.mock.calls[0]?.[1]?.[6]).toBe(
      "7d_click_1d_view",
    );

    await expect(
      repository.getCanonicalResultTrend({
        ...base,
        objectiveMappings: [],
      }),
    ).resolves.toEqual({
      available: true,
      syncVersion: "run-9",
      resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
      results: [],
    });
    expect(unsafe).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["reporting_snapshot_unavailable", "reporting_snapshot_unavailable"],
    ["reporting_snapshot_stale", "reporting_snapshot_stale"],
  ] as const)(
    "returns %s instead of an ambiguous empty trend",
    async (snapshotStatus, reason) => {
      const unsafe = vi.fn(async () => [
        {
          snapshot_status: snapshotStatus,
          snapshot_sync_version: "run-other",
          snapshot_result_mapping_version: "mapping-other",
        },
      ]);
      const repository = new TrackerRepository({
        unsafe,
      } as unknown as DatabaseClient);

      await expect(
        repository.getCanonicalResultTrend({
          connectionId: "connection-1",
          dateFrom: "2026-07-01",
          dateTo: "2026-07-31",
          objectiveMappings: [],
          attributionWindow: "account_default",
          actionReportTime: "mixed",
          syncVersion: "run-9",
          resultMappingVersion: TEST_RESULT_MAPPING_VERSION,
        }),
      ).resolves.toEqual({
        available: false,
        reason,
        results: [],
      });
    },
  );
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
    expectAccountDefaultAwareAttributionFilter({
      query,
      metricAlias: "metric",
      parameter: "$8",
      optional: true,
    });
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
    expect(query).toContain("account.meta_ad_account_id = any($6::text[])");
    expect(query).toContain("selected_campaign.meta_campaign_id = $7");
    expectAccountDefaultAwareAttributionFilter({
      query,
      metricAlias: "metric",
      parameter: "$8",
      optional: true,
    });
    expect(query).toContain("metric.action_report_time = $9");
    expect(query).toContain("metric.sync_version = $10");
    expect(parameters).toEqual([
      "connection-1",
      "2026-07-01",
      "2026-07-24",
      "42",
      null,
      ["act_123"],
      "campaign_456",
      "7d_click_1d_view",
      "conversion",
      "sync_42",
      false,
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

  it("keeps an exact, normalized multi-account scope for daily delivery trend", async () => {
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
      adAccountMetaIds: [" act_123 ", "act_456", "act_123", ""],
      includeInactiveAccounts: true,
    });

    expect(unsafe.mock.calls[0]?.[0]).toContain(
      "account.meta_ad_account_id = any($6::text[])",
    );
    expect(unsafe.mock.calls[0]?.[1]?.[5]).toEqual([
      "act_123",
      "act_456",
    ]);
    expect(unsafe.mock.calls[0]?.[1]?.[10]).toBe(true);
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
    expectAccountDefaultAwareAttributionFilter({
      query: defaultQuery,
      metricAlias: "metric",
      parameter: "$11",
      optional: true,
    });
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
      null,
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
      null,
      null,
    ]);
  });

  it("filters exact linked Account and Campaign IDs before the creative-library limit", async () => {
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
      adAccountMetaIds: [" act_2 ", "act_1", "act_2", ""],
      campaignMetaIds: [
        " campaign-2 ",
        "campaign-1",
        "campaign-2",
      ],
      limit: 5_001,
      offset: 0,
    });

    const [query, parameters] = unsafe.mock.calls[0];
    const normalized = compactSql(query);
    expect(normalized).toContain(
      "$7::text[] is null or entity_links.ad_account_ids && $7::text[]",
    );
    expect(normalized).toContain(
      "$8::text[] is null or entity_links.campaign_ids && $8::text[]",
    );
    expect(query.indexOf("entity_links.ad_account_ids &&")).toBeLessThan(
      query.indexOf("order by"),
    );
    expect(query.indexOf("entity_links.campaign_ids &&")).toBeLessThan(
      query.indexOf("limit $4"),
    );
    expect(parameters).toEqual([
      "connection-1",
      null,
      null,
      5_001,
      0,
      null,
      ["act_2", "act_1"],
      ["campaign-2", "campaign-1"],
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
      null,
      null,
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

  it("bounds one complete creative-performance snapshot at 5,001 rows", async () => {
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
      limit: 9_000,
      offset: 0,
    });

    expect(unsafe.mock.calls[0]?.[1]?.[6]).toBe(5_001);
    expect(unsafe.mock.calls[0]?.[1]?.[7]).toBe(0);
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
    expectAccountDefaultAwareAttributionFilter({
      query,
      metricAlias: "metric",
      parameter: "$12",
      optional: true,
    });
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

describe("Live Delivery summary", () => {
  const readyAccount = {
    metaAdAccountId: "act_1",
    accountTimezone: "Asia/Ho_Chi_Minh",
    isOperational: true,
    deliveryEligible: true,
    inventoryObservedAt: "2026-08-01T08:00:00.000Z",
    latestMetricDate: "2026-08-01",
    inventoryState: "ready",
    deliveryState: "ready",
  };

  it("keeps scope in the first CTE and rolls reconciled ad and asset rows up before counting Ads", async () => {
    const unsafe = vi.fn(async (query: string, parameters?: unknown[]) => {
      void query;
      void parameters;
      return [];
    });
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await repository.getLiveDeliverySummary({
      connectionId: "connection-1",
      selectedAdAccountMetaIds: [" act_2 ", "act_1", "act_2", ""],
      freshnessThresholdDays: 2,
      asOf: "2026-08-01T12:00:00.000Z",
    });

    const [query, parameters] = unsafe.mock.calls[0];
    const normalized = compactSql(query);
    expect(normalized).toContain(
      "account.meta_ad_account_id = any($2::text[])",
    );
    expect(normalized).toContain(
      "metric.metric_scope in ('ad', 'asset')",
    );
    expect(normalized).not.toContain("metric.metric_scope = 'ad'");
    expect(normalized).toContain(
      "group by metric.ad_account_id, metric.ad_id, metric.metric_date",
    );
    expect(normalized).toContain("snapshot.sync_version = metric.sync_version");
    expect(normalized).toContain("metric.action_report_time = 'mixed'");
    expect(normalized).not.toContain("business_ad_accounts");
    expect(parameters).toEqual([
      "connection-1",
      ["act_2", "act_1"],
      2,
      "2026-08-01T12:00:00.000Z",
    ]);
  });

  it("marks incomplete account coverage partial without presenting a false zero", async () => {
    const unsafe = vi.fn(
      async (query: string, parameters?: unknown[]) => {
        void query;
        void parameters;
        return [
        {
          inventory_observed_at: "2026-08-01T08:00:00.000Z",
          snapshot_sync_version: "run-42",
          snapshot_published_at: "2026-08-01T08:05:00.000Z",
          latest_run_status: "partial",
          latest_run_finished_at: "2026-08-01T08:05:00.000Z",
          metric_date_min: "2026-07-31",
          metric_date_max: "2026-08-01",
          selected_account_count: 2,
          inventory_ready_account_count: 1,
          delivery_eligible_account_count: 2,
          delivery_ready_account_count: 1,
          active_campaign_count: 2,
          active_ad_set_count: 3,
          active_ad_count: 4,
          comparable_active_ad_count: 2,
          active_delivering_ad_count: 1,
          mapped_active_creative_family_count: 2,
          active_ads_with_creative_family: 2,
          accounts: [
            readyAccount,
            {
              ...readyAccount,
              metaAdAccountId: "act_2",
              latestMetricDate: null,
              inventoryState: "stale",
              deliveryState: "unavailable",
            },
          ],
        },
        ];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    const result = await repository.getLiveDeliverySummary({
      connectionId: "connection-1",
      selectedAdAccountMetaIds: ["act_1", "act_2"],
      asOf: "2026-08-01T12:00:00.000Z",
    });

    expect(result).toMatchObject({
      state: "partial",
      selectedAccountCount: 2,
      inventoryReadyAccountCount: 1,
      deliveryEligibleAccountCount: 2,
      deliveryReadyAccountCount: 1,
      reportingSnapshot: { syncVersion: "run-42", state: "available" },
      latestRun: { status: "partial" },
      activeAds: { value: 4, state: "partial" },
      activeAdsComparableForDelivery: { value: 2, state: "partial" },
      activeDeliveringAds: { value: 1, state: "partial" },
      activeWithoutDelivery: { value: 1, state: "partial" },
      mappingCoverage: {
        activeAdsTotal: 4,
        activeAdsWithCreativeFamily: 2,
        percent: 50,
      },
    });
    expect(result.accounts).toHaveLength(2);
    expect(result.accounts[1]).toMatchObject({
      metaAdAccountId: "act_2",
      deliveryState: "unavailable",
    });
  });

  it("keeps a validated zero delivery distinct from unavailable", async () => {
    const unsafe = vi.fn(
      async () => [
        {
          selected_account_count: 1,
          metric_date_min: "2026-08-01",
          metric_date_max: "2026-08-01",
          inventory_ready_account_count: 1,
          delivery_eligible_account_count: 1,
          delivery_ready_account_count: 1,
          active_campaign_count: 1,
          active_ad_set_count: 1,
          active_ad_count: 2,
          comparable_active_ad_count: 2,
          active_delivering_ad_count: 0,
          mapped_active_creative_family_count: 0,
          active_ads_with_creative_family: 0,
          accounts: [readyAccount],
        },
      ],
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    const result = await repository.getLiveDeliverySummary({
      connectionId: "connection-1",
      selectedAdAccountMetaIds: ["act_1"],
    });

    expect(result.state).toBe("ready");
    expect(result.activeDeliveringAds).toMatchObject({
      value: 0,
      state: "ready",
    });
    expect(result.activeWithoutDelivery).toMatchObject({
      value: 2,
      state: "ready",
    });
  });

  it("marks delivery partial when eligible accounts have different latest local metric dates", async () => {
    const unsafe = vi.fn(
      async () => [
        {
          selected_account_count: 2,
          inventory_ready_account_count: 2,
          delivery_eligible_account_count: 2,
          delivery_ready_account_count: 2,
          metric_date_min: "2026-07-31",
          metric_date_max: "2026-08-01",
          active_campaign_count: 2,
          active_ad_set_count: 2,
          active_ad_count: 4,
          comparable_active_ad_count: 4,
          active_delivering_ad_count: 3,
          mapped_active_creative_family_count: 2,
          active_ads_with_creative_family: 3,
          accounts: [
            readyAccount,
            {
              ...readyAccount,
              metaAdAccountId: "act_2",
              latestMetricDate: "2026-07-31",
            },
          ],
        },
      ],
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    const result = await repository.getLiveDeliverySummary({
      connectionId: "connection-1",
      selectedAdAccountMetaIds: ["act_1", "act_2"],
    });

    expect(result).toMatchObject({
      state: "partial",
      metricDateMin: "2026-07-31",
      metricDateMax: "2026-08-01",
      activeDeliveringAds: { value: 3, state: "partial" },
      activeWithoutDelivery: { value: 1, state: "partial" },
    });
  });

  it("returns unavailable delivery counts when no eligible account has a latest metric date", async () => {
    const unsafe = vi.fn(
      async () => [
        {
          selected_account_count: 1,
          inventory_ready_account_count: 1,
          delivery_eligible_account_count: 1,
          delivery_ready_account_count: 0,
          active_campaign_count: 1,
          active_ad_set_count: 1,
          active_ad_count: 2,
          comparable_active_ad_count: 0,
          active_delivering_ad_count: 0,
          mapped_active_creative_family_count: 1,
          active_ads_with_creative_family: 1,
          accounts: [
            {
              ...readyAccount,
              latestMetricDate: null,
              deliveryState: "unavailable",
            },
          ],
        },
      ],
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    const result = await repository.getLiveDeliverySummary({
      connectionId: "connection-1",
      selectedAdAccountMetaIds: ["act_1"],
    });

    expect(result.state).toBe("unavailable");
    expect(result.activeAds).toMatchObject({ value: 2, state: "ready" });
    expect(result.activeDeliveringAds).toMatchObject({
      value: null,
      state: "unavailable",
    });
    expect(result.activeWithoutDelivery).toMatchObject({
      value: null,
      state: "unavailable",
    });
  });
});

describe("Ad inventory", () => {
  it("uses one scoped query and never loses reconciled asset delivery", async () => {
    const unsafe = vi.fn(
      async (query: string, parameters?: unknown[]) => {
        void query;
        void parameters;
        return [
        {
          ad_id: "db_ad_1",
          meta_ad_id: "ad_1",
          name: "Active creative ad",
          status: "ACTIVE",
          effective_status: "ACTIVE",
          is_active: true,
          is_operational: true,
          last_seen_at: "2026-08-01T08:00:00.000Z",
          meta_campaign_id: "campaign_1",
          campaign_name: "Campaign",
          meta_ad_set_id: "adset_1",
          ad_set_name: "Ad set",
          meta_ad_account_id: "act_1",
          ad_account_name: "Account",
          inventory_observed_at: "2026-08-01T08:00:00.000Z",
          latest_metric_date: "2026-08-01",
          creative_family_ids: ["cf_1"],
          delivery_state: "delivering",
          total_count: 1,
        },
        ];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    const result = await repository.listAdInventory({
      connectionId: "connection-1",
      selectedAdAccountMetaIds: ["act_1", "act_2"],
      status: "active",
      delivery: "latest",
      freshnessThresholdDays: 2,
      asOf: "2026-08-01T12:00:00.000Z",
    });

    expect(unsafe).toHaveBeenCalledOnce();
    const [query, parameters] = unsafe.mock.calls[0];
    const normalized = compactSql(query);
    expect(normalized).toContain(
      "account.meta_ad_account_id = any($2::text[])",
    );
    expect(normalized).toContain(
      "metric.metric_scope in ('ad', 'asset')",
    );
    expect(normalized).not.toContain("metric.metric_scope = 'ad'");
    expect(normalized).toContain(
      "group by metric.ad_account_id, metric.ad_id, metric.metric_date",
    );
    expect(normalized).toContain("$4::text = 'latest'");
    expect(normalized).toContain("), page_rows as (");
    expect(normalized).toContain("from account_delivery_state account");
    expect(normalized).toContain(
      "coalesce(ad.effective_status, ad.status) like '%PAUSED'",
    );
    expect(normalized).toContain("account.account_delivery_state = 'ready'");
    expect(normalized).toContain("$10::boolean or (account.is_active and account.account_status = 1)");
    expect(normalized).toContain("and account.is_operational and ad.is_active");
    expect(parameters).toEqual([
      "connection-1",
      ["act_1", "act_2"],
      "active",
      "latest",
      null,
      50,
      0,
      2,
      "2026-08-01T12:00:00.000Z",
      false,
    ]);
    expect(result).toMatchObject({
      total: 1,
      items: [
        {
          metaAdId: "ad_1",
          deliveryState: "delivering",
          isOperational: true,
          latestMetricDate: "2026-08-01",
          creativeFamilyIds: ["cf_1"],
        },
      ],
    });
  });

  it("keeps stale or unavailable accounts out of the missing-delivery filter", async () => {
    const unsafe = vi.fn(async (query: string, parameters?: unknown[]) => {
      void query;
      void parameters;
      return [];
    });
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await repository.listAdInventory({
      connectionId: "connection-1",
      selectedAdAccountMetaIds: ["act_1"],
      delivery: "missing",
    });

    const [query] = unsafe.mock.calls[0];
    const normalized = compactSql(query);
    expect(normalized).toContain("$4::text = 'missing'");
    expect(normalized).toContain("not coalesce(metric.has_delivery, false)");
    expect(normalized).toContain("account.account_delivery_state = 'ready'");
    expect(normalized).toContain(
      "coalesce(ad.effective_status, ad.status) = 'ACTIVE'",
    );
  });

  it("returns an empty page without querying for an empty account scope", async () => {
    const unsafe = vi.fn(async () => []);
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(
      repository.listAdInventory({
        connectionId: "connection-1",
        selectedAdAccountMetaIds: [],
        limit: 20,
        offset: 40,
      }),
    ).resolves.toEqual({ items: [], total: 0, limit: 20, offset: 40 });
    expect(unsafe).not.toHaveBeenCalled();
  });

  it("rejects an oversized account scope instead of silently truncating it", async () => {
    const unsafe = vi.fn(async () => []);
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(
      repository.listAdInventory({
        connectionId: "connection-1",
        selectedAdAccountMetaIds: Array.from(
          { length: 251 },
          (_, index) => `act_${index}`,
        ),
      }),
    ).rejects.toThrow("cannot contain more than 250");
    expect(unsafe).not.toHaveBeenCalled();
  });

  it("keeps the total count when a requested page is past the final row", async () => {
    const unsafe = vi.fn(async (query: string, parameters?: unknown[]) => {
      void query;
      void parameters;
      return [{ ad_id: null, total_count: 73 }];
    });
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    const result = await repository.listAdInventory({
      connectionId: "connection-1",
      selectedAdAccountMetaIds: ["act_1"],
      offset: 100,
    });

    expect(result).toEqual({ items: [], total: 73, limit: 50, offset: 100 });
    expect(compactSql(unsafe.mock.calls[0]?.[0] ?? "")).toContain(
      "from (select count(*) as total_count from filtered) total",
    );
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
