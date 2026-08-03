export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "DATABASE_URL is not configured. Add a pooled Postgres connection string before using live mode.",
    );
    this.name = "DatabaseNotConfiguredError";
  }
}

export class MigrationDriftError extends Error {
  constructor(migrationId: string) {
    super(
      `Migration ${migrationId} was already applied with different contents. Add a new migration instead of editing an applied one.`,
    );
    this.name = "MigrationDriftError";
  }
}

export class SyncAlreadyRunningError extends Error {
  constructor(connectionId: string | number | bigint) {
    super(`A sync is already running for Meta connection ${connectionId}.`);
    this.name = "SyncAlreadyRunningError";
  }
}

/**
 * Optimistic concurrency guard for owner preferences. A stale browser tab may
 * never overwrite a newer metric preset silently; callers reload the current
 * settings snapshot and let the owner decide what to keep.
 */
export class SettingsUpdateConflictError extends Error {
  constructor() {
    super("Settings were changed by a newer request.");
    this.name = "SettingsUpdateConflictError";
  }
}
