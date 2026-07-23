import type postgres from "postgres";

import { DatabaseNotConfiguredError } from "./errors";

export type DatabaseClient = ReturnType<typeof postgres>;

type DatabaseGlobal = typeof globalThis & {
  __metaCreativeTrackerDatabase?: Promise<DatabaseClient>;
};

const databaseGlobal = globalThis as DatabaseGlobal;

export function getDatabaseUrl(
  environment: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = environment.DATABASE_URL?.trim();
  return value ? value : null;
}

export function isDatabaseConfigured(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return getDatabaseUrl(environment) !== null;
}

export function getDatabasePoolSize(
  environment: NodeJS.ProcessEnv = process.env,
): number {
  return environment.VERCEL ? 2 : 5;
}

export function getDatabaseSslMode(
  environment: NodeJS.ProcessEnv = process.env,
): "verify-full" | undefined {
  return environment.NODE_ENV === "production" ? "verify-full" : undefined;
}

async function createDatabaseClient(): Promise<DatabaseClient> {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new DatabaseNotConfiguredError();
  }

  const { default: createPostgresClient } = await import("postgres");
  return createPostgresClient(databaseUrl, {
    // One connection is reserved for the advisory sync lock while repository
    // queries continue through the pool. A pool of 1 would deadlock on Vercel.
    max: getDatabasePoolSize(),
    // verify-full encrypts traffic and validates the provider certificate and
    // hostname. postgres.js `require` encrypts but disables certificate checks.
    ssl: getDatabaseSslMode(),
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    prepare: false,
    onnotice: () => undefined,
  });
}

/**
 * Creates the Postgres.js pool only when a live route, script, or sync job asks
 * for it. Importing this module during `next build` never opens a connection.
 */
export async function getDatabase(): Promise<DatabaseClient> {
  databaseGlobal.__metaCreativeTrackerDatabase ??= createDatabaseClient();
  return databaseGlobal.__metaCreativeTrackerDatabase;
}

/**
 * Build-safe helper for pages that can fall back to setup/demo mode.
 */
export async function getOptionalDatabase(): Promise<DatabaseClient | null> {
  if (!isDatabaseConfigured()) {
    return null;
  }

  return getDatabase();
}

export async function closeDatabase(): Promise<void> {
  const databasePromise = databaseGlobal.__metaCreativeTrackerDatabase;
  databaseGlobal.__metaCreativeTrackerDatabase = undefined;

  if (databasePromise) {
    const database = await databasePromise;
    await database.end({ timeout: 5 });
  }
}
