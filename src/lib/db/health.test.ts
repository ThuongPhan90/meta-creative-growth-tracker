import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "./client";

const mocks = vi.hoisted(() => ({
  loadMigrations: vi.fn(),
}));

vi.mock("./migrations", () => ({
  loadMigrations: mocks.loadMigrations,
}));

import { checkDatabaseHealth } from "./health";

function localMigration(id: string, checksum: string) {
  return {
    id,
    checksum,
    filePath: `/migrations/${id}.sql`,
    sql: `-- ${id}`,
  };
}

describe("database health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads metadata, migrations and missing relations in one database call", async () => {
    const unsafe = vi.fn().mockResolvedValue([
      {
        database_name: "tracker_test",
        server_version: "17.4",
        migrations: [
          { migration_id: "0001_core", checksum_sha256: "checksum-1" },
          { migration_id: "0002_indexes", checksum_sha256: "old-checksum" },
          { migration_id: "0004_retired", checksum_sha256: "checksum-4" },
        ],
        missing_relations: ["tracker.meta_ads"],
      },
    ]);
    mocks.loadMigrations.mockResolvedValue([
      localMigration("0001_core", "checksum-1"),
      localMigration("0002_indexes", "new-checksum"),
      localMigration("0003_reporting", "checksum-3"),
    ]);

    const result = await checkDatabaseHealth({
      unsafe,
    } as unknown as DatabaseClient);

    expect(unsafe).toHaveBeenCalledTimes(1);
    const [query, parameters] = unsafe.mock.calls[0] as [
      string,
      readonly [readonly string[]],
    ];
    expect(query).toContain("current_database()");
    expect(query).toContain("tracker.schema_migrations");
    expect(query).toContain("to_regclass");
    expect(parameters[0]).toContain("tracker.app_settings");
    expect(result).toEqual({
      ok: false,
      databaseName: "tracker_test",
      serverVersion: "17.4",
      appliedMigrations: ["0001_core", "0002_indexes", "0004_retired"],
      pendingMigrations: ["0003_reporting"],
      driftedMigrations: ["0002_indexes"],
      missingRelations: ["tracker.meta_ads"],
    });
  });

  it("starts migration file loading without waiting for the database query", async () => {
    let resolveHealthRows!: (value: unknown[]) => void;
    const healthRows = new Promise<unknown[]>((resolve) => {
      resolveHealthRows = resolve;
    });
    const unsafe = vi.fn().mockReturnValue(healthRows);
    mocks.loadMigrations.mockResolvedValue([]);

    const resultPromise = checkDatabaseHealth({
      unsafe,
    } as unknown as DatabaseClient);

    expect(unsafe).toHaveBeenCalledTimes(1);
    expect(mocks.loadMigrations).toHaveBeenCalledTimes(1);

    resolveHealthRows([
      {
        database_name: "tracker_test",
        server_version: "17.4",
        migrations: [],
        missing_relations: [],
      },
    ]);

    await expect(resultPromise).resolves.toMatchObject({ ok: true });
  });
});
