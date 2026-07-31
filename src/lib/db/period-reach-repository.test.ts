import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "./client";
import { TrackerRepository } from "./repository";
import { computeResultMappingVersion } from "./result-mapping-version";
import type { DailyMetricInput } from "./types";

const filters = {
  connectionId: "connection-1",
  dateFrom: "2026-07-01",
  dateTo: "2026-07-31",
  adAccountIds: ["act_100"],
  attributionWindow: "7d_click_1d_view",
  actionReportTime: "mixed" as const,
  syncVersion: "run-9",
  resultMappingVersion: "result-map-v1:current",
};

describe("period Reach repository", () => {
  it("reads one exact period snapshot without summing daily Reach", async () => {
    const unsafe = vi.fn(
      async (query: string, parameters?: unknown[]) => {
        void query;
        void parameters;
        return [
          {
            snapshot_sync_version: "run-9",
            snapshot_result_mapping_version:
              "result-map-v1:current",
            normalized_results_require_resync: false,
            period_reach_snapshot_id: 1,
            meta_ad_account_id: "act_100",
            meta_campaign_id: null,
            reach: 100,
            date_from: "2026-07-01",
            date_to: "2026-07-31",
            attribution_window: "7d_click_1d_view",
            action_report_time: "mixed",
            sync_version: "run-9",
          },
        ];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(repository.getPeriodReach(filters)).resolves.toEqual({
      available: true,
      scopeLevel: "account",
      adAccountId: "act_100",
      campaignId: null,
      reach: 100,
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      attributionWindow: "7d_click_1d_view",
      actionReportTime: "mixed",
      syncVersion: "run-9",
    });

    const [query, parameters] = unsafe.mock.calls[0];
    expect(query).toContain("tracker.period_reach_snapshots period");
    expect(query).not.toContain("reported_reach");
    expect(query).not.toContain("sum(");
    expect(parameters).toEqual([
      "connection-1",
      "2026-07-01",
      "2026-07-31",
      "act_100",
      null,
      "account",
      "7d_click_1d_view",
      "mixed",
    ]);
  });

  it("refuses to sum Reach across accounts or campaigns", async () => {
    const unsafe = vi.fn(async () => {
      throw new Error("Unsafe overlap must be rejected before SQL.");
    });
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(
      repository.getPeriodReach({
        ...filters,
        adAccountIds: ["act_100", "act_200"],
      }),
    ).resolves.toEqual({
      available: false,
      reason: "multi_account_overlap_unsafe",
    });
    await expect(
      repository.getPeriodReach({
        ...filters,
        campaignIds: ["campaign-1", "campaign-2"],
      }),
    ).resolves.toEqual({
      available: false,
      reason: "multi_campaign_overlap_unsafe",
    });
    expect(unsafe).not.toHaveBeenCalled();
  });

  it("returns unavailable while the reporting snapshot is stale", async () => {
    const unsafe = vi.fn(async () => [
      {
        snapshot_sync_version: "run-9",
        snapshot_result_mapping_version: "result-map-v1:current",
        normalized_results_require_resync: true,
        period_reach_snapshot_id: 1,
      },
    ]);
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(repository.getPeriodReach(filters)).resolves.toEqual({
      available: false,
      reason: "reporting_snapshot_stale",
    });
  });

  it("classifies a non-current requested sync version as stale", async () => {
    const unsafe = vi.fn(
      async (query: string, parameters?: unknown[]) => {
        expect(query).not.toContain(
          "snapshot.sync_version = $8",
        );
        expect(parameters).not.toContain("run-8");
        return [
          {
            snapshot_sync_version: "run-9",
            snapshot_result_mapping_version:
              "result-map-v1:current",
            normalized_results_require_resync: false,
            period_reach_snapshot_id: null,
          },
        ];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(
      repository.getPeriodReach({
        ...filters,
        syncVersion: "run-8",
      }),
    ).resolves.toEqual({
      available: false,
      reason: "reporting_snapshot_stale",
    });
  });

  it("stores the Meta period value as-is at account grain", async () => {
    const unsafe = vi.fn(
      async (query: string, parameters?: unknown[]) => {
        void query;
        void parameters;
        return [{ affected_count: 1 }];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(
      repository.upsertPeriodReachSnapshots("connection-1", [
        {
          adAccountId: "account-1",
          campaignId: null,
          scopeLevel: "account",
          dateFrom: "2026-07-01",
          dateTo: "2026-07-31",
          attributionWindow: "7d_click_1d_view",
          actionReportTime: "mixed",
          syncVersion: "run-9",
          reach: 100,
        },
      ]),
    ).resolves.toBe(1);

    const [query, parameters] = unsafe.mock.calls[0];
    expect(query).toContain(
      "insert into tracker.period_reach_snapshots",
    );
    expect(parameters?.[1]).toEqual([
      expect.objectContaining({ reach: 100 }),
    ]);
  });

  it("does not advance the pointer when period Reach storage fails", async () => {
    const mappings = [
      {
        canonicalResultKey: "purchase",
        rawActionType: "purchase",
        metricSource: "action" as const,
        priority: 0,
        enabled: true,
      },
    ];
    const mappingVersion = computeResultMappingVersion(mappings);
    const calls: string[] = [];
    const transactionUnsafe = vi.fn(async (query: string) => {
      calls.push(query);
      if (query.includes("from tracker.meta_connections")) {
        return [{ connection_id: "connection-1" }];
      }
      if (query.includes("from tracker.result_mappings mapping")) {
        return [
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
      }
      if (query.includes("insert into tracker.daily_metrics")) {
        return [{ affected_count: 1 }];
      }
      if (query.includes("insert into tracker.period_reach_snapshots")) {
        throw new Error("period Reach write failed");
      }
      return [];
    });
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
    const metric: DailyMetricInput = {
      metricDate: "2026-07-20",
      adAccountId: "account-1",
      campaignId: "campaign-1",
      adSetId: "adset-1",
      adId: "ad-1",
      metricScope: "ad",
      scopeKey: "ad:ad-1",
      allocationMethod: "unallocated",
      attributionWindow: "account_default",
      actionReportTime: "mixed",
      syncVersion: "run-9",
      accountTimezone: "Asia/Ho_Chi_Minh",
      currency: "USD",
      spend: 10,
    };

    await expect(
      repository.publishDailyMetricWindows({
        connectionId: "connection-1",
        syncRunId: "run-9",
        resultMappingVersion: mappingVersion,
        periodReachSnapshots: [
          {
            adAccountId: "account-1",
            campaignId: null,
            scopeLevel: "account",
            dateFrom: "2026-07-20",
            dateTo: "2026-07-21",
            attributionWindow: "account_default",
            actionReportTime: "mixed",
            syncVersion: "run-9",
            reach: 100,
          },
        ],
        replacements: [
          {
            adAccountId: "account-1",
            dateFrom: "2026-07-20",
            dateTo: "2026-07-21",
            metrics: [metric],
          },
        ],
      }),
    ).rejects.toThrow("period Reach write failed");

    expect(
      calls.some((query) =>
        query.includes("insert into tracker.reporting_snapshots"),
      ),
    ).toBe(false);
  });
});
