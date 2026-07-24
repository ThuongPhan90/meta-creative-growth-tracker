import { describe, expect, it } from "vitest";

import { evaluateMetaConnectionLifecycle } from "./connection-lifecycle";

const NOW = new Date("2026-07-24T00:00:00.000Z");

describe("Meta connection lifecycle", () => {
  it("uses the earliest token or data-access deadline", () => {
    expect(
      evaluateMetaConnectionLifecycle(
        {
          status: "connected",
          tokenExpiresAt: "2026-10-01T00:00:00.000Z",
          dataAccessExpiresAt: "2026-07-30T00:00:00.000Z",
        },
        NOW,
      ),
    ).toBe("expiring_soon");
  });

  it("requires reauthorization at or after a known deadline", () => {
    expect(
      evaluateMetaConnectionLifecycle(
        {
          status: "connected",
          tokenExpiresAt: NOW.toISOString(),
          dataAccessExpiresAt: null,
        },
        NOW,
      ),
    ).toBe("needs_reauth");
  });

  it("never reports malformed or missing deadlines as healthy", () => {
    expect(
      evaluateMetaConnectionLifecycle({
        status: "connected",
        tokenExpiresAt: "not-a-date",
        dataAccessExpiresAt: null,
      }),
    ).toBe("unknown");
    expect(
      evaluateMetaConnectionLifecycle({
        status: "connected",
        tokenExpiresAt: null,
        dataAccessExpiresAt: null,
      }),
    ).toBe("unknown");
  });

  it("honors an explicit revoked or reauthorization state", () => {
    for (const status of ["revoked", "needs_reauth"]) {
      expect(
        evaluateMetaConnectionLifecycle({
          status,
          tokenExpiresAt: "2027-01-01T00:00:00.000Z",
          dataAccessExpiresAt: null,
        }),
      ).toBe("needs_reauth");
    }
  });
});
