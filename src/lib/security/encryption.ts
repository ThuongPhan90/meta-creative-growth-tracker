import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCMTypes,
} from "node:crypto";
import { getSecurityServerEnv } from "./env";

const ENVELOPE_VERSION = "v1";
const ALGORITHM: CipherGCMTypes = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const BASE_AAD = "meta-creative-growth-tracker:meta-token:v1";

export type TokenEncryptionErrorCode =
  | "INVALID_KEY"
  | "INVALID_PLAINTEXT"
  | "INVALID_ENVELOPE"
  | "AUTHENTICATION_FAILED";

export class TokenEncryptionError extends Error {
  readonly code: TokenEncryptionErrorCode;

  constructor(code: TokenEncryptionErrorCode, options?: ErrorOptions) {
    const messages: Record<TokenEncryptionErrorCode, string> = {
      INVALID_KEY: "Token encryption key is invalid.",
      INVALID_PLAINTEXT: "Meta token plaintext is invalid.",
      INVALID_ENVELOPE: "Encrypted Meta token envelope is invalid.",
      AUTHENTICATION_FAILED:
        "Encrypted Meta token could not be authenticated.",
    };
    super(messages[code], options);
    this.name = "TokenEncryptionError";
    this.code = code;
  }
}

export interface TokenEncryptionOptions {
  /** A 64-character hex key or exactly 32 raw bytes. */
  key?: string | Uint8Array;
  /**
   * Optional non-secret owner/deployment identifier bound as authenticated
   * data. The identical binding is required for decryption.
   */
  binding?: string;
}

function resolveKey(keyInput?: string | Uint8Array): Buffer {
  const key =
    keyInput ??
    getSecurityServerEnv().tokenEncryptionKey;

  if (typeof key === "string") {
    if (!/^[a-fA-F0-9]{64}$/.test(key)) {
      throw new TokenEncryptionError("INVALID_KEY");
    }
    return Buffer.from(key, "hex");
  }

  const buffer = Buffer.from(key);
  if (buffer.length !== 32) {
    throw new TokenEncryptionError("INVALID_KEY");
  }
  return buffer;
}

function aadForBinding(binding: string | undefined): Buffer {
  if (binding !== undefined && (binding.length === 0 || binding.length > 256)) {
    throw new TokenEncryptionError("INVALID_ENVELOPE");
  }
  return Buffer.from(`${BASE_AAD}:${binding ?? ""}`, "utf8");
}

function encode(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string): Buffer {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new TokenEncryptionError("INVALID_ENVELOPE");
  }
  const decoded = Buffer.from(value, "base64url");
  // Reject alternate/non-canonical encodings whose unused trailing bits could
  // decode to the same bytes. The envelope then has one stable representation.
  if (encode(decoded) !== value) {
    throw new TokenEncryptionError("INVALID_ENVELOPE");
  }
  return decoded;
}

export function encryptMetaToken(
  plaintext: string,
  options: TokenEncryptionOptions = {},
): string {
  if (!plaintext || Buffer.byteLength(plaintext, "utf8") > 32_768) {
    throw new TokenEncryptionError("INVALID_PLAINTEXT");
  }

  const key = resolveKey(options.key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  cipher.setAAD(aadForBinding(options.binding));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [ENVELOPE_VERSION, encode(iv), encode(ciphertext), encode(authTag)].join(
    ".",
  );
}

export function decryptMetaToken(
  envelope: string,
  options: TokenEncryptionOptions = {},
): string {
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION) {
    throw new TokenEncryptionError("INVALID_ENVELOPE");
  }

  const iv = decode(parts[1]);
  const ciphertext = decode(parts[2]);
  const authTag = decode(parts[3]);
  if (
    iv.length !== IV_BYTES ||
    authTag.length !== AUTH_TAG_BYTES ||
    ciphertext.length === 0
  ) {
    throw new TokenEncryptionError("INVALID_ENVELOPE");
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      resolveKey(options.key),
      iv,
      { authTagLength: AUTH_TAG_BYTES },
    );
    decipher.setAAD(aadForBinding(options.binding));
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch (cause) {
    if (cause instanceof TokenEncryptionError) {
      throw cause;
    }
    throw new TokenEncryptionError("AUTHENTICATION_FAILED", { cause });
  }
}
