import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "./client";
import { TrackerRepository } from "./repository";
import { computeResultMappingVersion } from "./result-mapping-version";

describe("result registry repository", () => {
  it("versions semantic mappings independently of row order and metadata", () => {
    const first = [
      {
        canonicalResultKey: "purchase",
        rawActionType: "purchase",
        metricSource: "action" as const,
        priority: 0,
        enabled: true,
      },
      {
        canonicalResultKey: "purchase_value",
        rawActionType: "purchase",
        metricSource: "action_value" as const,
        priority: 0,
        enabled: true,
      },
    ];
    const reordered = [
      { ...first[1], id: "database-row-9", mappingSource: "owner" },
      { ...first[0], id: "database-row-2", mappingSource: "system" },
    ];

    expect(computeResultMappingVersion(first)).toBe(
      computeResultMappingVersion(reordered),
    );
    expect(computeResultMappingVersion(first)).toMatch(
      /^result-map-v1:[a-f0-9]{64}$/,
    );
    expect(
      computeResultMappingVersion([
        first[0],
        { ...first[1], priority: 1 },
      ]),
    ).not.toBe(computeResultMappingVersion(first));
    expect(
      computeResultMappingVersion([
        first[0],
        { ...first[1], enabled: false },
      ]),
    ).not.toBe(computeResultMappingVersion(first));
  });

  it("maps persisted definitions, aliases and campaign overrides", async () => {
    const unsafe = vi.fn(
      async (query: string, _parameters?: unknown[]) => {
        void _parameters;
        if (query.includes("from tracker.result_definitions")) {
          return [
            {
              result_definition_id: 1n,
              canonical_key: "purchase",
              label: "Purchase",
              short_label: "Purchase",
              objective_keys: ["sales"],
              raw_action_types: ["purchase"],
              raw_value_action_types: [],
              unit: "count",
              efficiency_metric: "cost_per_result",
              direction: "lower_is_better",
              default_for_objective: true,
              minimum_results: 5,
              minimum_impressions: 1000,
              enabled: true,
            },
          ];
        }
        if (query.includes("from tracker.result_mappings mapping")) {
          return [
            {
              result_mapping_id: 2n,
              canonical_key: "purchase",
              raw_action_type: "purchase",
              metric_source: "action",
              priority: 0,
              mapping_source: "system",
              enabled: true,
            },
          ];
        }
        return [
          {
            meta_campaign_id: "campaign_1",
            canonical_key: "purchase",
            enabled: true,
          },
        ];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(repository.listResultDefinitions()).resolves.toEqual([
      expect.objectContaining({
        id: "1",
        canonicalKey: "purchase",
        rawActionTypes: ["purchase"],
      }),
    ]);
    await expect(repository.listResultMappings()).resolves.toEqual([
      {
        id: "2",
        canonicalResultKey: "purchase",
        rawActionType: "purchase",
        metricSource: "action",
        priority: 0,
        mappingSource: "system",
        enabled: true,
      },
    ]);
    await expect(
      repository.listCampaignResultOverrides("connection_1"),
    ).resolves.toEqual([
      {
        campaignId: "campaign_1",
        canonicalResultKey: "purchase",
        enabled: true,
      },
    ]);
    expect(unsafe.mock.calls[2]?.[1]).toEqual(["connection_1"]);
  });

  it("replaces mappings and records before/after audit in one transaction", async () => {
    let mappingRead = 0;
    const transactionUnsafe = vi.fn(
      async (query: string, _parameters?: unknown[]) => {
        void _parameters;
        if (
          query.includes("from tracker.meta_connections") &&
          query.includes("for update")
        ) {
          return [{ connection_id: "connection_1" }];
        }
        if (query.includes("from tracker.result_mappings mapping")) {
          mappingRead += 1;
          return [
            {
              result_mapping_id: mappingRead,
              canonical_key: "purchase",
              raw_action_type:
                mappingRead === 1 ? "purchase" : "owner_purchase",
              metric_source: "action",
              priority: 0,
              mapping_source:
                mappingRead === 1 ? "system" : "owner",
              enabled: true,
            },
          ];
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
      repository.saveResultMappings({
        connectionId: "connection_1",
        mappings: [
          {
            canonicalResultKey: "purchase",
            rawActionType: "owner_purchase",
            metricSource: "action",
            priority: 0,
            enabled: true,
          },
        ],
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        rawActionType: "owner_purchase",
        mappingSource: "owner",
      }),
    ]);

    expect(begin).toHaveBeenCalledOnce();
    expect(transactionUnsafe).toHaveBeenCalledTimes(7);
    expect(transactionUnsafe.mock.calls[0]?.[0]).toContain("for update");
    expect(transactionUnsafe.mock.calls[2]?.[0]).toContain(
      "delete from tracker.result_mappings",
    );
    expect(transactionUnsafe.mock.calls[3]?.[1]).toEqual([
      "connection_1",
      [
        {
          canonical_result_key: "purchase",
          raw_action_type: "owner_purchase",
          metric_source: "action",
          priority: 0,
          enabled: true,
        },
      ],
    ]);
    expect(transactionUnsafe.mock.calls[5]?.[0]).toContain(
      "result_mapping_version is distinct from $2",
    );
    expect(transactionUnsafe.mock.calls[5]?.[1]?.[0]).toBe(
      "connection_1",
    );
    const auditParameters = transactionUnsafe.mock.calls[6]?.[1];
    expect(auditParameters?.[0]).toEqual({
      resultMappings: [
        expect.objectContaining({ rawActionType: "purchase" }),
      ],
      resultMappingVersion: expect.stringMatching(
        /^result-map-v1:/,
      ),
    });
    expect(auditParameters?.[1]).toEqual({
      resultMappings: [
        expect.objectContaining({ rawActionType: "owner_purchase" }),
      ],
      resultMappingVersion: expect.stringMatching(
        /^result-map-v1:/,
      ),
      resultMappingsChanged: true,
      normalizedResultsRequireResync: true,
    });
    expect(typeof auditParameters?.[0]).toBe("object");
  });

  it("clears stale state when mappings return to the snapshot hash", async () => {
    let mappingRead = 0;
    const queries: string[] = [];
    const transactionUnsafe = vi.fn(
      async (query: string, parameters?: unknown[]) => {
        void parameters;
        queries.push(query);
        if (
          query.includes("from tracker.meta_connections") &&
          query.includes("for update")
        ) {
          return [{ connection_id: "connection_1" }];
        }
        if (query.includes("from tracker.result_mappings mapping")) {
          mappingRead += 1;
          return [
            {
              result_mapping_id: mappingRead,
              canonical_key: "purchase",
              raw_action_type:
                mappingRead === 1 ? "owner_purchase" : "purchase",
              metric_source: "action",
              priority: 0,
              mapping_source:
                mappingRead === 1 ? "system" : "owner",
              enabled: true,
            },
          ];
        }
        if (query.includes("update tracker.reporting_snapshots")) {
          return [{ normalized_results_require_resync: false }];
        }
        return [];
      },
    );
    const repository = new TrackerRepository({
      begin: async (
        callback: (transaction: { unsafe: typeof transactionUnsafe }) =>
          Promise<unknown>,
      ) => callback({ unsafe: transactionUnsafe }),
    } as unknown as DatabaseClient);

    await repository.saveResultMappings({
      connectionId: "connection_1",
      mappings: [
        {
          canonicalResultKey: "purchase",
          rawActionType: "purchase",
          metricSource: "action",
          priority: 0,
          enabled: true,
        },
      ],
    });

    expect(
      queries.some(
        (query) =>
          query.includes("update tracker.reporting_snapshots") &&
          query.includes("else null"),
      ),
    ).toBe(true);
    const auditParameters = transactionUnsafe.mock.calls.at(-1)?.[1];
    expect(auditParameters?.[1]).toEqual(
      expect.objectContaining({
        resultMappingsChanged: true,
        normalizedResultsRequireResync: false,
      }),
    );
  });

  it("rolls back a mapping replacement when snapshot invalidation fails", async () => {
    let mappingRead = 0;
    const queries: string[] = [];
    const transactionUnsafe = vi.fn(async (query: string) => {
      queries.push(query);
      if (
        query.includes("from tracker.meta_connections") &&
        query.includes("for update")
      ) {
        return [{ connection_id: "connection_1" }];
      }
      if (query.includes("from tracker.result_mappings mapping")) {
        mappingRead += 1;
        return [
          {
            result_mapping_id: mappingRead,
            canonical_key: "purchase",
            raw_action_type:
              mappingRead === 1 ? "purchase" : "owner_purchase",
            metric_source: "action",
            priority: 0,
            mapping_source: mappingRead === 1 ? "system" : "owner",
            enabled: true,
          },
        ];
      }
      if (query.includes("update tracker.reporting_snapshots")) {
        throw new Error("snapshot invalidation failed");
      }
      return [];
    });
    const repository = new TrackerRepository({
      begin: async (
        callback: (transaction: { unsafe: typeof transactionUnsafe }) =>
          Promise<unknown>,
      ) => callback({ unsafe: transactionUnsafe }),
    } as unknown as DatabaseClient);

    await expect(
      repository.saveResultMappings({
        connectionId: "connection_1",
        mappings: [
          {
            canonicalResultKey: "purchase",
            rawActionType: "owner_purchase",
            metricSource: "action",
            priority: 0,
            enabled: true,
          },
        ],
      }),
    ).rejects.toThrow("snapshot invalidation failed");

    expect(
      queries.some((query) =>
        query.includes("insert into tracker.settings_audit_log"),
      ),
    ).toBe(false);
  });
});
