import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "./client";
import { TrackerRepository } from "./repository";

describe("Meta connection owner claim", () => {
  it("uses one atomic statement and returns null for a different owner", async () => {
    const unsafe = vi.fn(async (query: string) => {
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
