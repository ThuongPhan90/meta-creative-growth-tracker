export {
  closeDatabase,
  getDatabase,
  getDatabaseUrl,
  getOptionalDatabase,
  isDatabaseConfigured,
  type DatabaseClient,
} from "./client";
export {
  DatabaseNotConfiguredError,
  MigrationDriftError,
  SyncAlreadyRunningError,
} from "./errors";
export { checkDatabaseHealth, type DatabaseHealth } from "./health";
export {
  defaultMigrationsDirectory,
  loadMigrations,
  runMigrations,
  type DatabaseMigration,
  type MigrationResult,
} from "./migrations";
export {
  createOptionalTrackerRepository,
  createTrackerRepository,
  TrackerRepository,
} from "./repository";
export type * from "./types";
