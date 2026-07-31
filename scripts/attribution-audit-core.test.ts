import { describe, expect, it, vi } from "vitest";

import {
  ATTRIBUTION_AUDIT_SQL_STATEMENTS,
  ATTRIBUTION_AUDIT_TABLES,
  CONFLICT_SAMPLES_SQL,
  runAttributionAudit,
  sanitizeAttributionWindow,
  UNPINNED_DAILY_SUMMARY_SQL,
  type AttributionAuditQuery,
} from "./attribution-audit-core";

function tableRows(
  overrides: Partial<Record<string, Record<string, unknown>>> = {},
): Record<string, unknown>[] {
  return ATTRIBUTION_AUDIT_TABLES.map((table, index) => ({
    table_name: table,
    active_rows: index === 0 ? "12" : "0",
    active_accounts: index === 0 ? "2" : "0",
    variant_accounts: "0",
    overlapping_grains: "0",
    invalid_window_rows: "0",
    ...overrides[table],
  }));
}

function queryFor(input?: {
  readOnly?: string;
  snapshotCount?: string;
  tables?: Record<string, unknown>[];
  cross?: Record<string, unknown>;
  samples?: Record<string, unknown>[];
}): AttributionAuditQuery {
  return vi.fn(async (statement: string) => {
    if (statement.includes("current_setting('transaction_read_only')")) {
      return [
        { transaction_read_only: input?.readOnly ?? "on" },
      ];
    }
    if (statement.includes("count(*)::text as snapshot_count")) {
      return [{ snapshot_count: input?.snapshotCount ?? "1" }];
    }
    if (statement.includes("table_names(table_name)")) {
      return input?.tables ?? tableRows();
    }
    if (statement.includes("as conflict_accounts")) {
      return [
        input?.cross ?? {
          conflict_accounts: "0",
          invalid_window_rows: "0",
        },
      ];
    }
    if (statement.includes("from samples")) {
      return input?.samples ?? [];
    }
    if (statement.includes("as candidate_rows")) {
      return [
        {
          candidate_rows: "0",
          candidate_accounts: "0",
          variant_accounts: "0",
          overlapping_grains: "0",
          invalid_window_rows: "0",
        },
      ];
    }
    throw new Error("Unexpected audit query in test.");
  });
}

describe("production attribution audit", () => {
  it("passes only a populated, conflict-free published snapshot", async () => {
    const query = queryFor();

    await expect(runAttributionAudit(query)).resolves.toEqual({
      scope: "current_published_snapshot",
      status: "pass",
      releaseSafe: true,
      snapshotCount: 1,
      activeRowCount: 12,
      tableSummaries: [
        {
          table: "daily_metrics",
          activeRows: 12,
          activeAccounts: 2,
          variantAccounts: 0,
          overlappingGrains: 0,
          invalidWindowRows: 0,
        },
        ...ATTRIBUTION_AUDIT_TABLES.slice(1).map((table) => ({
          table,
          activeRows: 0,
          activeAccounts: 0,
          variantAccounts: 0,
          overlappingGrains: 0,
          invalidWindowRows: 0,
        })),
      ],
      crossTableConflictAccounts: 0,
      crossTableInvalidWindowRows: 0,
      conflictSamples: [],
      unpinnedDailyDiagnostic: null,
      sampleLimit: 10,
    });
    expect(query).not.toHaveBeenCalledWith(
      CONFLICT_SAMPLES_SQL,
      expect.anything(),
    );
  });

  it("fails the gate and returns only redacted, ordinal conflict samples", async () => {
    const query = queryFor({
      tables: tableRows({
        daily_metrics: {
          active_rows: "18",
          active_accounts: "2",
          variant_accounts: "1",
          overlapping_grains: "3",
        },
      }),
      cross: {
        conflict_accounts: "1",
        invalid_window_rows: "0",
      },
      samples: [
        {
          scope: "daily_metrics",
          snapshot_slot: "1",
          account_slot: "2",
          row_count: "8",
          attribution_window_count: "3",
          attribution_windows: [
            "1d_click",
            "7d_click_1d_view",
            "secret-shaped-but-unknown",
          ],
          invalid_window_rows: "0",
          overlapping_grains: "3",
          source_tables: ["daily_metrics"],
        },
      ],
    });

    const report = await runAttributionAudit(query, 5);

    expect(report.status).toBe("conflict");
    expect(report.releaseSafe).toBe(false);
    expect(report.conflictSamples).toEqual([
      {
        scope: "daily_metrics",
        snapshotSlot: 1,
        accountSlot: 2,
        rowCount: 8,
        attributionWindowCount: 3,
        attributionWindows: [
          "1d_click",
          "7d_click_1d_view",
          "<nonstandard-window>",
        ],
        invalidWindowRows: 0,
        overlappingGrains: 3,
        sourceTables: ["daily_metrics"],
      },
    ]);
    expect(query).toHaveBeenCalledWith(CONFLICT_SAMPLES_SQL, [5]);
    expect(JSON.stringify(report)).not.toContain("secret-shaped-but-unknown");
  });

  it("is inconclusive when no populated published snapshot can be audited", async () => {
    await expect(
      runAttributionAudit(
        queryFor({
          snapshotCount: "0",
          tables: tableRows({
            daily_metrics: { active_rows: "0", active_accounts: "0" },
          }),
        }),
      ),
    ).resolves.toMatchObject({
      status: "inconclusive",
      releaseSafe: false,
      snapshotCount: 0,
      activeRowCount: 0,
      unpinnedDailyDiagnostic: {
        basis: "latest_fetched_sync_per_account",
        releaseEvidence: false,
        candidateRows: 0,
      },
    });
  });

  it("fails closed unless Postgres confirms the transaction is read-only", async () => {
    await expect(
      runAttributionAudit(queryFor({ readOnly: "off" })),
    ).rejects.toThrow("server-confirmed read-only transaction");
  });

  it("fails closed when a required table summary is absent", async () => {
    await expect(
      runAttributionAudit(
        queryFor({ tables: tableRows().slice(0, 3) }),
      ),
    ).rejects.toThrow("every required table");
  });

  it("uses only read statements scoped to the pinned reporting snapshot", () => {
    const normalized = ATTRIBUTION_AUDIT_SQL_STATEMENTS.map((statement) =>
      statement.trim().toLowerCase(),
    );
    for (const statement of normalized) {
      expect(statement).toMatch(/^(select|with)\b/);
      expect(statement).not.toMatch(
        /\b(insert|update|delete|alter|drop|truncate|create|grant|revoke)\b/,
      );
    }
    for (const table of ATTRIBUTION_AUDIT_TABLES) {
      expect(CONFLICT_SAMPLES_SQL).toContain(`tracker.${table}`);
    }
    expect(CONFLICT_SAMPLES_SQL).toContain(
      "from tracker.reporting_snapshots",
    );
    expect(CONFLICT_SAMPLES_SQL).toContain(
      "metric.sync_version = snapshot.sync_version",
    );
    expect(CONFLICT_SAMPLES_SQL).toContain(
      "period.sync_version = snapshot.sync_version",
    );
    expect(UNPINNED_DAILY_SUMMARY_SQL).toContain(
      "order by last_fetched_at desc, sync_version desc",
    );
  });

  it("allows only recognized attribution labels in output", () => {
    expect(sanitizeAttributionWindow("account_default")).toBe(
      "account_default",
    );
    expect(sanitizeAttributionWindow("7d_click_1d_view")).toBe(
      "7d_click_1d_view",
    );
    expect(sanitizeAttributionWindow("arbitrary-private-label")).toBe(
      "<nonstandard-window>",
    );
  });
});
