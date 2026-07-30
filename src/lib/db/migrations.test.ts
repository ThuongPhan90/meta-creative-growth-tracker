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
});
