import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { DatabaseClient } from "./client";
import { MigrationDriftError } from "./errors";

export interface DatabaseMigration {
  id: string;
  checksum: string;
  filePath: string;
  sql: string;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

interface AppliedMigrationRow extends Record<string, unknown> {
  migration_id: string;
  checksum_sha256: string;
}

export function defaultMigrationsDirectory(): string {
  return path.join(process.cwd(), "database", "migrations");
}

export async function loadMigrations(
  directory = defaultMigrationsDirectory(),
): Promise<DatabaseMigration[]> {
  const names = (await readdir(directory))
    .filter((name) => /^\d+_[a-z0-9_]+\.sql$/i.test(name))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    names.map(async (name) => {
      const filePath = path.join(directory, name);
      const sql = await readFile(filePath, "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");

      return {
        id: name.replace(/\.sql$/i, ""),
        checksum,
        filePath,
        sql,
      };
    }),
  );
}

export async function runMigrations(
  database: DatabaseClient,
  directory = defaultMigrationsDirectory(),
): Promise<MigrationResult> {
  const migrations = await loadMigrations(directory);
  return database.begin(async (transaction) => {
    // Serializes first-connect auto migration across concurrent serverless
    // instances. The transaction-scoped lock is always released on commit or
    // rollback, including abrupt failures.
    await transaction.unsafe(
      "select pg_advisory_xact_lock(hashtext('meta-creative-growth-tracker:migrations'))",
    );
    await transaction.unsafe("create schema if not exists tracker");
    await transaction.unsafe(`
      create table if not exists tracker.schema_migrations (
        migration_id text primary key,
        checksum_sha256 text not null,
        applied_at timestamptz not null default now()
      )
    `);

    const appliedRows = (await transaction.unsafe(
      "select migration_id, checksum_sha256 from tracker.schema_migrations",
    )) as unknown as AppliedMigrationRow[];
    const applied = new Map(
      appliedRows.map((row) => [row.migration_id, row.checksum_sha256]),
    );
    const result: MigrationResult = { applied: [], skipped: [] };

    for (const migration of migrations) {
      const existingChecksum = applied.get(migration.id);

      if (existingChecksum === migration.checksum) {
        result.skipped.push(migration.id);
        continue;
      }

      if (existingChecksum) {
        throw new MigrationDriftError(migration.id);
      }

      await transaction.unsafe(migration.sql);
      await transaction.unsafe(
        `
          insert into tracker.schema_migrations (
            migration_id,
            checksum_sha256
          ) values ($1, $2)
        `,
        [migration.id, migration.checksum],
      );
      result.applied.push(migration.id);
    }

    return result;
  });
}
