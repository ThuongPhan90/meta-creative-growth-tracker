import { NextRequest, NextResponse } from "next/server";

import {
  getRuntimeConfiguration,
  readDatabaseHealth,
  readOwnerSession,
} from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const configuration = getRuntimeConfiguration();
  const ownerSession = readOwnerSession(request);
  const database = ownerSession ? await readDatabaseHealth() : null;

  return NextResponse.json(
    {
      ok: true,
      mode: configuration.demoMode ? "demo" : "live",
      configured: {
        database: configuration.databaseConfigured,
        meta: configuration.metaConfigured,
        security: configuration.securityConfigured,
        cron: configuration.cronConfigured,
        legal: configuration.legalConfigured,
      },
      database: ownerSession
        ? {
            ready: database?.ok ?? false,
            pendingMigrations: database?.pendingMigrations.length ?? null,
            driftedMigrations: database?.driftedMigrations.length ?? null,
          }
        : undefined,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
