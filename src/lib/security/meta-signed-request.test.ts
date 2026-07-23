import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  createMetaDataDeletionConfirmation,
  MetaSignedRequestError,
  verifyMetaSignedRequest,
} from "./meta-signed-request";

function sign(payload: object, secret: string) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = createHmac("sha256", secret)
    .update(encodedPayload, "ascii")
    .digest("base64url");
  return `${signature}.${encodedPayload}`;
}

describe("verifyMetaSignedRequest", () => {
  it("verifies Meta's HMAC-SHA256 envelope", () => {
    const secret = "app-secret-value";
    expect(
      verifyMetaSignedRequest(
        sign(
          {
            algorithm: "HMAC-SHA256",
            user_id: "123",
            issued_at: 1_000,
          },
          secret,
        ),
        secret,
        { nowSeconds: 1_100 },
      ).user_id,
    ).toBe("123");
  });

  it("rejects a modified payload", () => {
    const secret = "app-secret-value";
    const value = sign(
      {
        algorithm: "HMAC-SHA256",
        user_id: "123",
        issued_at: 1_000,
      },
      secret,
    );
    expect(() =>
      verifyMetaSignedRequest(`${value}x`, secret, { nowSeconds: 1_100 }),
    ).toThrow(MetaSignedRequestError);
  });

  it("rejects missing, stale, and future-issued requests", () => {
    const secret = "app-secret-value";
    expect(() =>
      verifyMetaSignedRequest(
        sign({ algorithm: "HMAC-SHA256", user_id: "123" }, secret),
        secret,
        { nowSeconds: 10_000 },
      ),
    ).toThrow(MetaSignedRequestError);
    expect(() =>
      verifyMetaSignedRequest(
        sign(
          {
            algorithm: "HMAC-SHA256",
            user_id: "123",
            issued_at: 1_000,
          },
          secret,
        ),
        secret,
        { nowSeconds: 10_000, maxAgeSeconds: 3_600 },
      ),
    ).toThrow(MetaSignedRequestError);
    expect(() =>
      verifyMetaSignedRequest(
        sign(
          {
            algorithm: "HMAC-SHA256",
            user_id: "123",
            issued_at: 10_301,
          },
          secret,
        ),
        secret,
        { nowSeconds: 10_000, maxFutureSkewSeconds: 300 },
      ),
    ).toThrow(MetaSignedRequestError);
  });
});

describe("createMetaDataDeletionConfirmation", () => {
  it("returns a stable receipt for Meta retries without exposing the secret", () => {
    const payload = { user_id: "123", issued_at: 1_000 };
    const first = createMetaDataDeletionConfirmation(payload, "app-secret");
    const retry = createMetaDataDeletionConfirmation(payload, "app-secret");
    const otherRequest = createMetaDataDeletionConfirmation(
      { ...payload, issued_at: 1_001 },
      "app-secret",
    );

    expect(first).toMatch(/^[a-f0-9]{24}$/);
    expect(retry).toBe(first);
    expect(otherRequest).not.toBe(first);
    expect(first).not.toContain("app-secret");
  });
});
