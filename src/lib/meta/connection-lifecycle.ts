const EXPIRING_SOON_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;

export type MetaConnectionLifecycle =
  | "healthy"
  | "expiring_soon"
  | "needs_reauth"
  | "unknown";

export interface MetaConnectionLifecycleInput {
  status: string;
  tokenExpiresAt: string | null;
  dataAccessExpiresAt: string | null;
}

function parseDeadline(value: string | null): number | null {
  if (value === null) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

export function evaluateMetaConnectionLifecycle(
  connection: MetaConnectionLifecycleInput,
  now: number | Date = Date.now(),
): MetaConnectionLifecycle {
  if (
    connection.status === "needs_reauth" ||
    connection.status === "revoked"
  ) {
    return "needs_reauth";
  }

  const deadlines = [
    parseDeadline(connection.tokenExpiresAt),
    parseDeadline(connection.dataAccessExpiresAt),
  ].filter((deadline): deadline is number => deadline !== null);
  if (deadlines.some((deadline) => Number.isNaN(deadline))) {
    return "unknown";
  }
  if (deadlines.length === 0) {
    return "unknown";
  }

  const nowTimestamp =
    now instanceof Date ? now.getTime() : now;
  const effectiveDeadline = Math.min(...deadlines);
  if (effectiveDeadline <= nowTimestamp) {
    return "needs_reauth";
  }
  if (effectiveDeadline - nowTimestamp <= EXPIRING_SOON_WINDOW_MS) {
    return "expiring_soon";
  }
  return "healthy";
}
