import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseMocks = vi.hoisted(() => ({
  checkDatabaseHealth: vi.fn(),
  getDatabase: vi.fn(),
  isDatabaseConfigured: vi.fn(),
  runMigrations: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => databaseMocks);
vi.mock("./legal", () => ({
  getLegalConfiguration: () => ({ configured: true }),
}));

import { ensureDatabaseReady, readDatabaseHealth } from "./runtime";

type TestRuntimeGlobal = typeof globalThis & {
  __mcgtMigrationPromise?: Promise<unknown>;
  __mcgtDatabaseHealthCache?: {
    expiresAt: number;
    promise: Promise<unknown>;
  };
};

const runtimeGlobal = globalThis as TestRuntimeGlobal;

describe("server runtime database health cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeGlobal.__mcgtMigrationPromise = undefined;
    runtimeGlobal.__mcgtDatabaseHealthCache = undefined;
    databaseMocks.isDatabaseConfigured.mockReturnValue(true);
    databaseMocks.getDatabase.mockResolvedValue({});
  });

  it("deduplicates concurrent and warm schema-health reads", async () => {
    const health = { ok: true };
    databaseMocks.checkDatabaseHealth.mockResolvedValue(health);

    await expect(
      Promise.all([readDatabaseHealth(), readDatabaseHealth()]),
    ).resolves.toEqual([health, health]);
    await expect(readDatabaseHealth()).resolves.toBe(health);

    expect(databaseMocks.getDatabase).toHaveBeenCalledTimes(1);
    expect(databaseMocks.checkDatabaseHealth).toHaveBeenCalledTimes(1);
  });

  it("retries immediately after a transient health failure", async () => {
    const health = { ok: true };
    databaseMocks.checkDatabaseHealth
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(health);

    await expect(readDatabaseHealth()).resolves.toBeNull();
    await expect(readDatabaseHealth()).resolves.toBe(health);

    expect(databaseMocks.checkDatabaseHealth).toHaveBeenCalledTimes(2);
  });

  it("does not let an older failure erase a newer health cache entry", async () => {
    let rejectOld!: (reason: Error) => void;
    databaseMocks.checkDatabaseHealth.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectOld = reject;
      }),
    );

    const oldRead = readDatabaseHealth();
    await vi.waitFor(() => {
      expect(databaseMocks.checkDatabaseHealth).toHaveBeenCalledTimes(1);
    });
    const newerPromise = Promise.resolve({ ok: true });
    runtimeGlobal.__mcgtDatabaseHealthCache = {
      expiresAt: Date.now() + 60_000,
      promise: newerPromise,
    };
    rejectOld(new Error("stale failure"));

    await expect(oldRead).resolves.toBeNull();
    expect(runtimeGlobal.__mcgtDatabaseHealthCache?.promise).toBe(
      newerPromise,
    );
  });

  it("invalidates the warm health value after migrations", async () => {
    const health = { ok: true };
    databaseMocks.checkDatabaseHealth.mockResolvedValue(health);
    databaseMocks.runMigrations.mockResolvedValue({});

    await readDatabaseHealth();
    await ensureDatabaseReady();
    await readDatabaseHealth();

    expect(databaseMocks.checkDatabaseHealth).toHaveBeenCalledTimes(2);
  });
});
