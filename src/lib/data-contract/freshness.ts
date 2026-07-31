import type { Freshness, SyncHealthStatus } from "@/types/view-models";

export type FreshnessInput = Omit<Freshness, "freshnessSeconds"> & {
  now?: string | Date;
};

export function computeFreshnessSeconds(
  dataThroughAt: string | null,
  now: string | Date = new Date(),
): number | null {
  if (!dataThroughAt) return null;
  const dataTime = new Date(dataThroughAt).getTime();
  const nowTime = new Date(now).getTime();
  if (!Number.isFinite(dataTime) || !Number.isFinite(nowTime)) return null;
  return Math.max(0, Math.floor((nowTime - dataTime) / 1_000));
}

export function createFreshness(input: FreshnessInput): Freshness {
  return {
    lastSyncedAt: input.lastSyncedAt,
    dataThroughAt: input.dataThroughAt,
    syncVersion: input.syncVersion ?? null,
    syncStatus: input.syncStatus,
    freshnessSeconds: computeFreshnessSeconds(
      input.dataThroughAt,
      input.now,
    ),
    syncMode: input.syncMode,
  };
}

export function statusForFreshness(
  freshnessSeconds: number | null,
  warningAfterSeconds: number,
  errorAfterSeconds: number,
  partial = false,
): SyncHealthStatus {
  if (partial) return "partial";
  if (freshnessSeconds === null || freshnessSeconds >= errorAfterSeconds) {
    return "error";
  }
  if (freshnessSeconds >= warningAfterSeconds) return "warning";
  return "healthy";
}
