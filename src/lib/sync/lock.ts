import type { DatabaseClient } from "@/lib/db/client";
import { SyncAlreadyRunningError } from "@/lib/db/errors";
import type { DatabaseId } from "@/lib/db/types";

interface LockRow extends Record<string, unknown> {
  acquired: boolean;
}

interface ReservedConnection {
  unsafe(
    query: string,
    parameters?: readonly unknown[],
  ): Promise<readonly Record<string, unknown>[]>;
  release(): void;
}

interface ReservableDatabase {
  reserve(): Promise<ReservedConnection>;
}

function lockName(connectionId: DatabaseId): string {
  return `meta-creative-growth-tracker:sync:${connectionId}`;
}

/**
 * Session advisory lock: no row/transaction lock is held while Meta network
 * calls run. The reserved pooled connection is always released in `finally`.
 */
export async function withConnectionSyncLock<T>(
  database: DatabaseClient,
  connectionId: DatabaseId,
  operation: () => Promise<T>,
): Promise<T> {
  const reservable = database as unknown as ReservableDatabase;
  const reserved = await reservable.reserve();
  const key = lockName(connectionId);
  let acquired = false;

  try {
    const rows = (await reserved.unsafe(
      "select pg_try_advisory_lock(hashtextextended($1, 0)) as acquired",
      [key],
    )) as LockRow[];
    acquired = Boolean(rows[0]?.acquired);

    if (!acquired) {
      throw new SyncAlreadyRunningError(connectionId);
    }

    return await operation();
  } finally {
    try {
      if (acquired) {
        await reserved.unsafe(
          "select pg_advisory_unlock(hashtextextended($1, 0))",
          [key],
        );
      }
    } finally {
      reserved.release();
    }
  }
}
