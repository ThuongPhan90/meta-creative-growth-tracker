import { describe, expect, it } from "vitest";

import { loadMigrations } from "./migrations";

describe("database migrations", () => {
  it("loads migrations deterministically with sha256 checksums", async () => {
    const migrations = await loadMigrations();

    expect(migrations.map((migration) => migration.id)).toEqual([
      "0001_core",
      "0002_indexes_and_views",
      "0003_data_contract_v2",
      "0004_settings_v2",
      "0005_reporting_snapshot",
      "0006_reporting_scope",
      "0007_result_definitions",
      "0008_normalized_result_facts",
      "0009_period_reach_snapshots",
      "0010_metric_display_presets",
    ]);
    expect(migrations.every((migration) => migration.checksum.length === 64)).toBe(
      true,
    );
  });

  it("keeps physical creative identity and dynamic allocation safeguards", async () => {
    const [core] = await loadMigrations();

    expect(core.sql).toContain("meta_video_id");
    expect(core.sql).toContain("meta_image_hash");
    expect(core.sql).toContain("allocation_method");
    expect(core.sql).toContain("unallocated");
  });

  it("adds a generated family ID and canonical entity-link projection", async () => {
    const migrations = await loadMigrations();
    const contract = migrations.find(
      (migration) => migration.id === "0003_data_contract_v2",
    );

    expect(contract?.sql).toContain("generated always as");
    expect(contract?.sql).toContain("md5(asset_key)");
    expect(contract?.sql).toContain("creative_family_entity_links");
  });

  it("adds governed settings and an audit trail", async () => {
    const migrations = await loadMigrations();
    const settings = migrations.find(
      (migration) => migration.id === "0004_settings_v2",
    );

    expect(settings?.sql).toContain("settings_audit_log");
    expect(settings?.sql).toContain("scoring_weight_cpi");
    expect(settings?.sql).toContain("sync_cadence");
  });

  it("adds an atomic reporting snapshot and action report time grain", async () => {
    const migrations = await loadMigrations();
    const snapshot = migrations.find(
      (migration) => migration.id === "0005_reporting_snapshot",
    );

    expect(snapshot?.sql).toContain("reporting_snapshots");
    expect(snapshot?.sql).toContain("action_report_time");
    expect(snapshot?.sql).toContain("sync_version");
    expect(snapshot?.sql).toContain(
      "daily_metrics_natural_key_unique",
    );
  });

  it("persists explicit Business and Ad Account reporting scope", async () => {
    const migrations = await loadMigrations();
    const scope = migrations.find(
      (migration) => migration.id === "0006_reporting_scope",
    );

    expect(scope?.sql).toContain("reporting_scopes");
    expect(scope?.sql).toContain("reporting_scope_business_members");
    expect(scope?.sql).toContain("reporting_scope_ad_account_members");
  });

  it("adds configurable result definitions, mappings and overrides", async () => {
    const migrations = await loadMigrations();
    const results = migrations.find(
      (migration) => migration.id === "0007_result_definitions",
    );

    expect(results?.sql).toContain("result_definitions");
    expect(results?.sql).toContain("result_mappings");
    expect(results?.sql).toContain("campaign_result_overrides");
    expect(results?.sql).toContain("Meta-attributed Purchase");
  });

  it("materializes normalized Meta-attributed result facts without alias double counting", async () => {
    const migrations = await loadMigrations();
    const facts = migrations.find(
      (migration) =>
        migration.id === "0008_normalized_result_facts",
    );

    expect(facts?.sql).toContain("action_metric_daily");
    expect(facts?.sql).toContain("action_value_daily");
    expect(facts?.sql).toContain("selected_action_types");
    expect(facts?.sql).toContain("sync_version");
  });

  it("adds versioned owner-scoped display metric presets", async () => {
    const migrations = await loadMigrations();
    const presets = migrations.find(
      (migration) => migration.id === "0010_metric_display_presets",
    );

    expect(presets?.sql).toContain("metric_display_presets");
    expect(presets?.sql).toContain('"version":1');
    expect(presets?.sql).toContain("app_settings_metric_display_presets_shape_check");
    expect(presets?.sql).not.toContain("update tracker.app_settings");
  });
});
