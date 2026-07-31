import { fileURLToPath } from "node:url";
import path from "node:path";

import createPostgresClient from "postgres";

import {
  runAttributionAudit,
  type AttributionAuditQuery,
} from "./attribution-audit-core";

const READ_ONLY_TRANSACTION_MODE =
  "isolation level repeatable read read only";

function safePostgresErrorCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[0-9A-Z]{5}$/.test(error.code)
  ) {
    return error.code;
  }
  return null;
}

export async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error(
      "Attribution audit failed closed: DATABASE_URL is not configured.",
    );
    process.exitCode = 1;
    return;
  }

  const database = createPostgresClient(databaseUrl, {
    max: 1,
    ssl: "verify-full",
    prepare: false,
    idle_timeout: 5,
    connect_timeout: 10,
    max_lifetime: 60,
    onnotice: () => undefined,
  });

  try {
    const report = await database.begin(
      READ_ONLY_TRANSACTION_MODE,
      async (transaction) => {
        const query: AttributionAuditQuery = async (
          statement,
          parameters = [],
        ) => {
          const rows = await transaction.unsafe(
            statement,
            [...parameters],
          );
          return Array.from(rows) as Record<string, unknown>[];
        };
        return runAttributionAudit(query);
      },
    );

    console.log(JSON.stringify(report, null, 2));
    if (!report.releaseSafe) {
      console.error(
        report.status === "conflict"
          ? "Attribution audit failed closed: published attribution conflicts were found."
          : "Attribution audit failed closed: no populated published snapshot was available to prove safety.",
      );
      process.exitCode = 2;
    }
  } catch (error: unknown) {
    const code = safePostgresErrorCode(error);
    console.error(
      `Attribution audit failed closed: database connection, schema, or read-only verification failed${code ? ` (Postgres ${code})` : ""}.`,
    );
    process.exitCode = 1;
  } finally {
    await database.end({ timeout: 5 }).catch(() => undefined);
  }
}

const invokedPath = process.argv[1]
  ? path.resolve(process.argv[1])
  : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  void main();
}
