import type { DatabaseClient } from "@/lib/db/client";
import { SyncAlreadyRunningError } from "@/lib/db/errors";
import type { TrackerRepository } from "@/lib/db/repository";
import type { SyncRunRecord } from "@/lib/db/types";
import { describe, expect, it, vi } from "vitest";

import type { MetaSyncAdapter, RunSyncInput } from "./contracts";
import { runMetaSync, stagesForSyncKind } from "./orchestrator";

function syncRun(status: SyncRunRecord["status"]): SyncRunRecord {
  return {
    syncRunId: "run-1",
    connectionId: "connection-1",
    requestKey: "same-request",
    syncKind: "assets",
    triggerSource: "manual",
    status,
    windowStart: null,
    windowEnd: null,
    startedAt: status === "queued" ? null : "2026-07-24T00:00:00.000Z",
    finishedAt: status === "succeeded" ? "2026-07-24T00:01:00.000Z" : null,
    currentStage: null,
    progress: {},
    stats: {},
    errorCode: null,
    errorMessage: null,
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
  };
}

function concurrentHarness(
  existingStatus: SyncRunRecord["status"] = "queued",
) {
  let locked = false;
  const release = vi.fn();
  const database = {
    reserve: vi.fn(async () => ({
      unsafe: vi.fn(async (query: string) => {
        if (query.includes("pg_try_advisory_lock")) {
          if (locked) return [{ acquired: false }];
          locked = true;
          return [{ acquired: true }];
        }
        if (query.includes("pg_advisory_unlock")) {
          locked = false;
          return [{ unlocked: true }];
        }
        throw new Error(`Unexpected lock query: ${query}`);
      }),
      release,
    })),
  } as unknown as DatabaseClient;

  const createSyncRun = vi.fn(async () => syncRun(existingStatus));
  const finishSyncRun = vi.fn(async () => undefined);
  const failSyncRun = vi.fn(async () => undefined);
  const repository = {
    database,
    createSyncRun,
    recoverInterruptedSyncRuns: vi.fn(async () => 0),
    startSyncRun: vi.fn(async () => undefined),
    updateSyncStage: vi.fn(async () => undefined),
    saveCheckpoint: vi.fn(async () => undefined),
    finishSyncRun,
    failSyncRun,
    getSyncRun: vi.fn(async () => syncRun("succeeded")),
  } as unknown as TrackerRepository;

  let continueValidation: (() => void) | undefined;
  const validationGate = new Promise<void>((resolve) => {
    continueValidation = resolve;
  });
  const adapter = {
    validate: vi.fn(async () => {
      await validationGate;
      return {};
    }),
    syncAssets: vi.fn(async () => ({})),
    syncInsights: vi.fn(async () => ({})),
  } satisfies MetaSyncAdapter;
  const input = {
    connectionId: "connection-1",
    syncKind: "assets",
    triggerSource: "manual",
    requestKey: "same-request",
    adapter,
    repository,
  } satisfies RunSyncInput;

  return {
    adapter,
    continueValidation: () => continueValidation?.(),
    createSyncRun,
    failSyncRun,
    finishSyncRun,
    input,
    release,
  };
}

describe("sync stage plans", () => {
  it("runs only validation and inventory for an asset sync", () => {
    expect(stagesForSyncKind("assets")).toEqual(["validate", "assets"]);
  });

  it("does not fetch assets during an insights-only retry", () => {
    expect(stagesForSyncKind("insights")).toEqual(["validate", "insights"]);
  });

  it.each(["full", "incremental"] as const)(
    "runs the full ordered pipeline for %s",
    (kind) => {
      expect(stagesForSyncKind(kind)).toEqual([
        "validate",
        "assets",
        "insights",
      ]);
    },
  );
});

describe("sync idempotency ownership", () => {
  it("locks the connection before creating a run and never cancels the shared run", async () => {
    const harness = concurrentHarness();
    const first = runMetaSync(harness.input);
    await vi.waitFor(() => {
      expect(harness.createSyncRun).toHaveBeenCalledTimes(1);
      expect(harness.adapter.validate).toHaveBeenCalledTimes(1);
    });

    await expect(runMetaSync(harness.input)).rejects.toBeInstanceOf(
      SyncAlreadyRunningError,
    );

    expect(harness.createSyncRun).toHaveBeenCalledTimes(1);
    expect(harness.finishSyncRun).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled" }),
    );
    expect(harness.failSyncRun).not.toHaveBeenCalled();

    harness.continueValidation();
    await expect(first).resolves.toMatchObject({
      run: { status: "succeeded" },
    });
    expect(harness.release).toHaveBeenCalledTimes(2);
  });

  it("restarts a stale running row after acquiring its connection lock", async () => {
    const harness = concurrentHarness("running");
    const retry = runMetaSync(harness.input);

    await vi.waitFor(() => {
      expect(harness.adapter.validate).toHaveBeenCalledTimes(1);
    });
    harness.continueValidation();

    await expect(retry).resolves.toMatchObject({
      run: { status: "succeeded" },
    });
    expect(harness.createSyncRun).toHaveBeenCalledTimes(1);
    expect(harness.finishSyncRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "succeeded" }),
    );
  });
});
