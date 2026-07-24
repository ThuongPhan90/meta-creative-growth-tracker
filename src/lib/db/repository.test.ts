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

describe("Repository JSONB parameters", () => {
  it("passes structured JSON values instead of double-encoded strings", async () => {
    const unsafe = vi.fn(
      async (_query: string, _parameters?: unknown[]) => {
        void _query;
        void _parameters;
        return [];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await repository.updateSyncStage({
      syncRunId: "1",
      stage: "validate",
      progress: {
        stage_index: 1,
        stage_total: 3,
      },
      stats: {
        discovered: 12,
      },
    });

    const [, parameters] = unsafe.mock.calls[0];
    expect(parameters?.[2]).toEqual({
      stage_index: 1,
      stage_total: 3,
    });
    expect(parameters?.[3]).toEqual({
      discovered: 12,
    });
    expect(typeof parameters?.[2]).toBe("object");
    expect(typeof parameters?.[3]).toBe("object");
  });

  it("keeps bulk JSONB payloads as arrays for jsonb_to_recordset", async () => {
    const unsafe = vi.fn(
      async (_query: string, _parameters?: unknown[]) => {
        void _query;
        void _parameters;
        return [];
      },
    );
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await repository.upsertBusinesses("1", [
      {
        metaBusinessId: "business-1",
        name: "FOXSCORE",
        rawPayload: {
          source: "me/businesses",
        },
      },
    ]);

    const [, parameters] = unsafe.mock.calls[0];
    expect(Array.isArray(parameters?.[1])).toBe(true);
    expect(parameters?.[1]).toEqual([
      {
        meta_business_id: "business-1",
        name: "FOXSCORE",
        verification_status: null,
        raw_payload: {
          source: "me/businesses",
        },
      },
    ]);
  });
});
