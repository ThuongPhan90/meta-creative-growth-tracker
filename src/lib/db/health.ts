import type { DatabaseClient } from "./client";
import { loadMigrations } from "./migrations";

interface HealthRow extends Record<string, unknown> {
  database_name: string;
  server_version: string;
}

interface MigrationRow extends Record<string, unknown> {
  migration_id: string;
  checksum_sha256: string;
}

export interface DatabaseHealth {
  ok: boolean;
  databaseName: string;
  serverVersion: string;
  appliedMigrations: string[];
  pendingMigrations: string[];
  driftedMigrations: string[];
  missingRelations: string[];
}

const requiredRelations = [
  "tracker.app_owners",
  "tracker.app_settings",
  "tracker.meta_connections",
  "tracker.meta_businesses",
  "tracker.meta_ad_accounts",
  "tracker.meta_pages",
  "tracker.meta_apps",
  "tracker.meta_campaigns",
  "tracker.meta_ad_sets",
  "tracker.meta_ads",
  "tracker.meta_creatives",
  "tracker.creative_assets",
  "tracker.daily_metrics",
  "tracker.reporting_snapshots",
  "tracker.reporting_scopes",
  "tracker.reporting_scope_business_members",
  "tracker.reporting_scope_ad_account_members",
  "tracker.result_definitions",
  "tracker.result_mappings",
  "tracker.campaign_result_overrides",
  "tracker.action_metric_daily",
  "tracker.action_value_daily",
  "tracker.sync_runs",
  "tracker.connection_coverage",
  "tracker.creative_asset_usage",
] as const;

export async function checkDatabaseHealth(
  database: DatabaseClient,
): Promise<DatabaseHealth> {
  const healthRows = (await database.unsafe(`
    select
      current_database() as database_name,
      current_setting('server_version') as server_version
  `)) as unknown as HealthRow[];
  const migrationRows = (await database.unsafe(`
    select migration_id, checksum_sha256
    from tracker.schema_migrations
    order by migration_id
  `)) as unknown as MigrationRow[];
  const localMigrations = await loadMigrations();
  const appliedMap = new Map(
    migrationRows.map((migration) => [
      migration.migration_id,
      migration.checksum_sha256,
    ]),
  );
  const pendingMigrations = localMigrations
    .filter((migration) => !appliedMap.has(migration.id))
    .map((migration) => migration.id);
  const driftedMigrations = localMigrations
    .filter((migration) => {
      const checksum = appliedMap.get(migration.id);
      return Boolean(checksum && checksum !== migration.checksum);
    })
    .map((migration) => migration.id);

  const relationRows = (await database.unsafe(
    `
      select relation_name
      from unnest($1::text[]) as relation_name
      where to_regclass(relation_name) is null
    `,
    [requiredRelations],
  )) as unknown as Array<{ relation_name: string }>;
  const missingRelations = relationRows.map((row) => row.relation_name);
  const health = healthRows[0];

  return {
    ok:
      pendingMigrations.length === 0 &&
      driftedMigrations.length === 0 &&
      missingRelations.length === 0,
    databaseName: health.database_name,
    serverVersion: health.server_version,
    appliedMigrations: migrationRows.map((migration) => migration.migration_id),
    pendingMigrations,
    driftedMigrations,
    missingRelations,
  };
}
