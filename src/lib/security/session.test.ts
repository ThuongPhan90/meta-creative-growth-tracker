import { describe, expect, it } from "vitest";
import {
  createOwnerSession,
  verifyOwnerSession,
} from "./session";
import { SignedTokenError } from "./signed-token";

const SECRET = "session-secret-with-at-least-32-characters";

describe("owner session", () => {
  it("signs and verifies scoped owner claims", () => {
    const token = createOwnerSession("meta-user:123", {
      secret: SECRET,
      nowSeconds: 1_000,
      ttlSeconds: 600,
      sessionId: "session-1",
    });

    expect(
      verifyOwnerSession(token, {
        secret: SECRET,
        nowSeconds: 1_300,
      }),
    ).toEqual({
      kind: "owner_session",
      sub: "meta-user:123",
      iat: 1_000,
      exp: 1_600,
      jti: "session-1",
    });
  });

  it("rejects tampering and expired sessions", () => {
    const token = createOwnerSession("owner", {
      secret: SECRET,
      nowSeconds: 1_000,
      ttlSeconds: 60,
      sessionId: "session-1",
    });

    expect(() =>
      verifyOwnerSession(`${token.slice(0, -1)}x`, {
        secret: SECRET,
        nowSeconds: 1_001,
      }),
    ).toThrow(SignedTokenError);
    expect(() =>
      verifyOwnerSession(token, {
        secret: SECRET,
        nowSeconds: 1_061,
        clockToleranceSeconds: 0,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "EXPIRED" }),
    );
  });
});
