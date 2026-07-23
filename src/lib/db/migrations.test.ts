import { describe, expect, it } from "vitest";

import { loadMigrations } from "./migrations";

describe("database migrations", () => {
  it("loads migrations deterministically with sha256 checksums", async () => {
    const migrations = await loadMigrations();

    expect(migrations.map((migration) => migration.id)).toEqual([
      "0001_core",
      "0002_indexes_and_views",
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
});
