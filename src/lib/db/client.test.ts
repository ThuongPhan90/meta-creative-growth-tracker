import { describe, expect, it } from "vitest";

import {
  getDatabasePoolSize,
  getDatabaseSslMode,
  getDatabaseUrl,
  isDatabaseConfigured,
} from "./client";

describe("database configuration", () => {
  it("stays build-safe when DATABASE_URL is absent", () => {
    const environment: NodeJS.ProcessEnv = { NODE_ENV: "test" };

    expect(getDatabaseUrl(environment)).toBeNull();
    expect(isDatabaseConfigured(environment)).toBe(false);
  });

  it("ignores whitespace-only connection strings", () => {
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      DATABASE_URL: "   ",
    };

    expect(getDatabaseUrl(environment)).toBeNull();
  });

  it("returns a configured connection string without opening a connection", () => {
    const databaseUrl = "postgres://owner:secret@localhost:5432/tracker";
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl,
    };

    expect(getDatabaseUrl(environment)).toBe(databaseUrl);
    expect(isDatabaseConfigured(environment)).toBe(true);
  });

  it("keeps a second Vercel connection available while the sync lock is reserved", () => {
    expect(
      getDatabasePoolSize({ NODE_ENV: "production", VERCEL: "1" }),
    ).toBeGreaterThanOrEqual(2);
    expect(getDatabasePoolSize({ NODE_ENV: "development" })).toBe(5);
  });

  it("verifies the Postgres certificate and hostname in production", () => {
    expect(getDatabaseSslMode({ NODE_ENV: "production" })).toBe(
      "verify-full",
    );
    expect(getDatabaseSslMode({ NODE_ENV: "development" })).toBeUndefined();
  });
});
