import type { DatabaseClient } from "@/lib/db/client";
import { describe, expect, it, vi } from "vitest";

import { withConnectionSyncLock } from "./lock";

describe("withConnectionSyncLock", () => {
  it("releases the reserved connection even when advisory unlock fails", async () => {
    const release = vi.fn();
    const unsafe = vi
      .fn()
      .mockResolvedValueOnce([{ acquired: true }])
      .mockRejectedValueOnce(new Error("connection lost during unlock"));
    const database = {
      reserve: vi.fn(async () => ({ unsafe, release })),
    } as unknown as DatabaseClient;

    await expect(
      withConnectionSyncLock(database, "connection-1", async () => "done"),
    ).rejects.toThrow("connection lost during unlock");

    expect(release).toHaveBeenCalledTimes(1);
  });
});
