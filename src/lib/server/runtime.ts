import "server-only";

import {
  checkDatabaseHealth,
  getDatabase,
  isDatabaseConfigured,
  runMigrations,
  type DatabaseHealth,
  type MigrationResult,
} from "@/lib/db";
import { getLegalConfiguration } from "./legal";

type RuntimeGlobal = typeof globalThis & {
  __mcgtMigrationPromise?: Promise<MigrationResult>;
  __mcgtDatabaseHealthCache?: {
    expiresAt: number;
    promise: Promise<DatabaseHealth | null>;
  };
};

const runtimeGlobal = globalThis as RuntimeGlobal;

function hasValue(name: string) {
  return Boolean(process.env[name]?.trim());
}

function hasLongSecret(name: string) {
  const value = process.env[name];
  return Boolean(value && Buffer.byteLength(value, "utf8") >= 32);
}

export function isDemoMode() {
  return process.env.DEMO_MODE?.trim().toLowerCase() !== "false";
}

export type RuntimeConfiguration = {
  demoMode: boolean;
  databaseConfigured: boolean;
  metaConfigured: boolean;
  securityConfigured: boolean;
  cronConfigured: boolean;
  legalConfigured: boolean;
};

export function getRuntimeConfiguration(): RuntimeConfiguration {
  return {
    demoMode: isDemoMode(),
    databaseConfigured: isDatabaseConfigured(),
    metaConfigured:
      hasValue("APP_URL") &&
      hasValue("META_APP_ID") &&
      hasValue("META_APP_SECRET"),
    securityConfigured:
      /^[a-fA-F0-9]{64}$/.test(
        process.env.TOKEN_ENCRYPTION_KEY?.trim() ?? "",
      ) &&
      hasLongSecret("SESSION_SECRET") &&
      hasLongSecret("OWNER_SETUP_SECRET"),
    cronConfigured: hasLongSecret("CRON_SECRET"),
    legalConfigured: getLegalConfiguration().configured,
  };
}

/**
 * Called only after the owner has passed the setup-secret gate. Migrations are
 * idempotent and cached per warm server instance; CLI commands remain the
 * explicit verification/fallback path.
 */
export async function ensureDatabaseReady(): Promise<MigrationResult> {
  runtimeGlobal.__mcgtMigrationPromise ??= (async () => {
    const database = await getDatabase();
    const result = await runMigrations(database);
    runtimeGlobal.__mcgtDatabaseHealthCache = undefined;
    return result;
  })().catch((error) => {
    runtimeGlobal.__mcgtMigrationPromise = undefined;
    throw error;
  });

  return runtimeGlobal.__mcgtMigrationPromise;
}

export async function readDatabaseHealth(): Promise<DatabaseHealth | null> {
  if (!isDatabaseConfigured()) return null;

  const now = Date.now();
  const cached = runtimeGlobal.__mcgtDatabaseHealthCache;
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise: Promise<DatabaseHealth | null> = getDatabase()
    .then((database) => checkDatabaseHealth(database))
    .catch(() => {
      // A transient database failure must be retried by the next request rather
      // than being remembered as an unavailable schema for the whole TTL.
      if (runtimeGlobal.__mcgtDatabaseHealthCache?.promise === promise) {
        runtimeGlobal.__mcgtDatabaseHealthCache = undefined;
      }
      return null;
    });
  runtimeGlobal.__mcgtDatabaseHealthCache = {
    expiresAt: now + 60_000,
    promise,
  };
  return promise;
}
