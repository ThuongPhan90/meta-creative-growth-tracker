import { describe, expect, it } from "vitest";
import {
  EnvironmentValidationError,
  getMetaServerEnv,
  getSecurityServerEnv,
} from "./env";

describe("server environment validation", () => {
  it("returns normalized server-only Meta configuration", () => {
    expect(
      getMetaServerEnv({
        APP_URL: "https://tracker.example/",
        META_APP_ID: "123456",
        META_APP_SECRET: "1234567890abcdef1234567890abcdef",
        META_GRAPH_VERSION: "v24.0",
      }),
    ).toEqual({
      appUrl: "https://tracker.example",
      metaAppId: "123456",
      metaAppSecret: "1234567890abcdef1234567890abcdef",
      metaGraphVersion: "v24.0",
    });
  });

  it("reports variable names but never their invalid values", () => {
    const leakedCandidate = "very-short-secret";
    const error = (() => {
      try {
        getSecurityServerEnv({
          SESSION_SECRET: leakedCandidate,
          TOKEN_ENCRYPTION_KEY: "bad-key",
          OWNER_SETUP_SECRET: "also-short",
        });
      } catch (cause) {
        return cause;
      }
    })();

    expect(error).toBeInstanceOf(EnvironmentValidationError);
    expect(String(error)).toContain("SESSION_SECRET");
    expect(String(error)).toContain("TOKEN_ENCRYPTION_KEY");
    expect(String(error)).toContain("OWNER_SETUP_SECRET");
    expect(String(error)).not.toContain(leakedCandidate);
    expect(String(error)).not.toContain("bad-key");
    expect(String(error)).not.toContain("also-short");
  });

  it("requires an independent owner bootstrap secret", () => {
    expect(
      getSecurityServerEnv({
        SESSION_SECRET: "s".repeat(32),
        TOKEN_ENCRYPTION_KEY: "a".repeat(64),
        OWNER_SETUP_SECRET: "o".repeat(32),
      }),
    ).toEqual({
      sessionSecret: "s".repeat(32),
      tokenEncryptionKey: "a".repeat(64),
      ownerSetupSecret: "o".repeat(32),
    });
  });

  it("rejects reused security secrets without exposing their value", () => {
    const reusedSecret = "a".repeat(64);
    const error = (() => {
      try {
        getSecurityServerEnv({
          SESSION_SECRET: reusedSecret,
          TOKEN_ENCRYPTION_KEY: reusedSecret,
          OWNER_SETUP_SECRET: "o".repeat(32),
        });
      } catch (cause) {
        return cause;
      }
    })();

    expect(error).toBeInstanceOf(EnvironmentValidationError);
    expect(String(error)).toContain("SESSION_SECRET");
    expect(String(error)).toContain("TOKEN_ENCRYPTION_KEY");
    expect(String(error)).not.toContain(reusedSecret);
  });
});
