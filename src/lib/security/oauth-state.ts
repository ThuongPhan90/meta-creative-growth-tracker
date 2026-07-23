import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  SignedTokenError,
  signStructuredToken,
  verifyStructuredToken,
} from "./signed-token";

const OAUTH_STATE_SIGNING_CONTEXT = "meta-oauth-state";
const OAUTH_STATE_NONCE_CONTEXT = "meta-creative-growth-tracker:oauth-nonce:v1";
const DEFAULT_OAUTH_STATE_TTL_SECONDS = 10 * 60;
const MAX_OAUTH_STATE_TTL_SECONDS = 20 * 60;

export const META_OAUTH_NONCE_COOKIE = "mcgt_meta_oauth_nonce";

export interface MetaOAuthStateClaims {
  kind: "meta_oauth_state";
  nonceHash: string;
  returnTo: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface CreateMetaOAuthStateInput {
  nonce: string;
  returnTo?: string;
}

export interface CreateMetaOAuthStateOptions {
  secret?: string | Uint8Array;
  nowSeconds?: number;
  ttlSeconds?: number;
  stateId?: string;
}

export interface VerifyMetaOAuthStateOptions {
  secret?: string | Uint8Array;
  nowSeconds?: number;
  clockToleranceSeconds?: number;
  expectedNonce: string;
}

function hashNonce(nonce: string): Buffer {
  return createHash("sha256")
    .update(OAUTH_STATE_NONCE_CONTEXT)
    .update("\0")
    .update(nonce)
    .digest();
}

function isValidNonce(nonce: string): boolean {
  return (
    nonce.length >= 32 &&
    nonce.length <= 256 &&
    /^[A-Za-z0-9_-]+$/.test(nonce)
  );
}

function normalizeReturnTo(value: string | undefined): string {
  const returnTo = value ?? "/";
  if (
    !returnTo.startsWith("/") ||
    returnTo.startsWith("//") ||
    returnTo.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(returnTo)
  ) {
    throw new SignedTokenError("INVALID_CLAIMS");
  }

  const parsed = new URL(returnTo, "https://local.invalid");
  if (parsed.origin !== "https://local.invalid") {
    throw new SignedTokenError("INVALID_CLAIMS");
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function generateMetaOAuthNonce(): string {
  return randomBytes(32).toString("base64url");
}

export function createMetaOAuthState(
  input: CreateMetaOAuthStateInput,
  options: CreateMetaOAuthStateOptions = {},
): string {
  if (!isValidNonce(input.nonce)) {
    throw new SignedTokenError("INVALID_CLAIMS");
  }

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const ttl = options.ttlSeconds ?? DEFAULT_OAUTH_STATE_TTL_SECONDS;
  const stateId = options.stateId ?? randomUUID();
  if (
    !Number.isInteger(now) ||
    !Number.isInteger(ttl) ||
    ttl < 60 ||
    ttl > MAX_OAUTH_STATE_TTL_SECONDS ||
    stateId.length < 1 ||
    stateId.length > 128
  ) {
    throw new SignedTokenError("INVALID_CLAIMS");
  }

  return signStructuredToken<MetaOAuthStateClaims>(
    {
      kind: "meta_oauth_state",
      nonceHash: hashNonce(input.nonce).toString("base64url"),
      returnTo: normalizeReturnTo(input.returnTo),
      iat: now,
      exp: now + ttl,
      jti: stateId,
    },
    {
      secret: options.secret,
      context: OAUTH_STATE_SIGNING_CONTEXT,
    },
  );
}

export function verifyMetaOAuthState(
  state: string,
  options: VerifyMetaOAuthStateOptions,
): MetaOAuthStateClaims {
  if (!isValidNonce(options.expectedNonce)) {
    throw new SignedTokenError("INVALID_CLAIMS");
  }

  const claims = verifyStructuredToken<MetaOAuthStateClaims>(state, {
    secret: options.secret,
    context: OAUTH_STATE_SIGNING_CONTEXT,
    nowSeconds: options.nowSeconds,
    clockToleranceSeconds: options.clockToleranceSeconds,
  });
  if (
    claims.kind !== "meta_oauth_state" ||
    typeof claims.nonceHash !== "string" ||
    typeof claims.returnTo !== "string" ||
    typeof claims.jti !== "string" ||
    claims.jti.length < 1 ||
    claims.jti.length > 128 ||
    claims.exp - claims.iat > MAX_OAUTH_STATE_TTL_SECONDS
  ) {
    throw new SignedTokenError("INVALID_CLAIMS");
  }

  const expectedHash = hashNonce(options.expectedNonce);
  let providedHash: Buffer;
  try {
    providedHash = Buffer.from(claims.nonceHash, "base64url");
  } catch {
    throw new SignedTokenError("INVALID_CLAIMS");
  }
  if (
    providedHash.length !== expectedHash.length ||
    !timingSafeEqual(providedHash, expectedHash)
  ) {
    throw new SignedTokenError("INVALID_SIGNATURE");
  }

  normalizeReturnTo(claims.returnTo);
  return claims;
}

export const META_OAUTH_NONCE_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: DEFAULT_OAUTH_STATE_TTL_SECONDS,
});
