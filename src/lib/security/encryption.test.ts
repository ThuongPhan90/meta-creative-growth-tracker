import { describe, expect, it } from "vitest";
import {
  decryptMetaToken,
  encryptMetaToken,
  TokenEncryptionError,
} from "./encryption";

const KEY = "a".repeat(64);
const OTHER_KEY = "b".repeat(64);

describe("Meta token encryption", () => {
  it("round-trips with AES-256-GCM and a binding", () => {
    const encrypted = encryptMetaToken("EAAB-secret-meta-token", {
      key: KEY,
      binding: "owner:123",
    });

    expect(encrypted).not.toContain("EAAB-secret-meta-token");
    expect(
      decryptMetaToken(encrypted, {
        key: KEY,
        binding: "owner:123",
      }),
    ).toBe("EAAB-secret-meta-token");
  });

  it("uses a random nonce for every encryption", () => {
    const first = encryptMetaToken("same-token", { key: KEY });
    const second = encryptMetaToken("same-token", { key: KEY });
    expect(first).not.toBe(second);
  });

  it("rejects tampering, a wrong binding, and a wrong key", () => {
    const encrypted = encryptMetaToken("token", {
      key: KEY,
      binding: "owner:123",
    });
    const parts = encrypted.split(".");
    parts[2] = `${parts[2].slice(0, -1)}${
      parts[2].endsWith("A") ? "B" : "A"
    }`;

    for (const operation of [
      () =>
        decryptMetaToken(parts.join("."), {
          key: KEY,
          binding: "owner:123",
        }),
      () =>
        decryptMetaToken(encrypted, {
          key: KEY,
          binding: "owner:other",
        }),
      () =>
        decryptMetaToken(encrypted, {
          key: OTHER_KEY,
          binding: "owner:123",
        }),
    ]) {
      expect(operation).toThrow(TokenEncryptionError);
    }
  });
});
