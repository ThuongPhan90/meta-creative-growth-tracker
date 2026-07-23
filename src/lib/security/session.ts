import { randomUUID } from "node:crypto";
import {
  SignedTokenError,
  signStructuredToken,
  verifyStructuredToken,
  type SignTokenOptions,
} from "./signed-token";

const SESSION_SIGNING_CONTEXT = "owner-session";
const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export const OWNER_SESSION_COOKIE = "mcgt_owner_session";

export interface OwnerSessionClaims {
  kind: "owner_session";
  sub: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface CreateOwnerSessionOptions {
  secret?: string | Uint8Array;
  nowSeconds?: number;
  ttlSeconds?: number;
  sessionId?: string;
}

export interface VerifyOwnerSessionOptions {
  secret?: string | Uint8Array;
  nowSeconds?: number;
  clockToleranceSeconds?: number;
}

function validIdentifier(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 128 &&
    /^[A-Za-z0-9._:@-]+$/.test(value)
  );
}

export function createOwnerSession(
  ownerId: string,
  options: CreateOwnerSessionOptions = {},
): string {
  if (!validIdentifier(ownerId)) {
    throw new SignedTokenError("INVALID_CLAIMS");
  }

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const ttl = options.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  const sessionId = options.sessionId ?? randomUUID();
  if (
    !Number.isInteger(now) ||
    !Number.isInteger(ttl) ||
    ttl < 60 ||
    ttl > MAX_SESSION_TTL_SECONDS ||
    !validIdentifier(sessionId)
  ) {
    throw new SignedTokenError("INVALID_CLAIMS");
  }

  return signStructuredToken<OwnerSessionClaims>(
    {
      kind: "owner_session",
      sub: ownerId,
      iat: now,
      exp: now + ttl,
      jti: sessionId,
    },
    {
      secret: options.secret,
      context: SESSION_SIGNING_CONTEXT,
    },
  );
}

export function verifyOwnerSession(
  token: string,
  options: VerifyOwnerSessionOptions = {},
): OwnerSessionClaims {
  const claims = verifyStructuredToken<OwnerSessionClaims>(token, {
    secret: options.secret,
    context: SESSION_SIGNING_CONTEXT,
    nowSeconds: options.nowSeconds,
    clockToleranceSeconds: options.clockToleranceSeconds,
  });

  if (
    claims.kind !== "owner_session" ||
    !validIdentifier(claims.sub) ||
    !validIdentifier(claims.jti) ||
    claims.exp - claims.iat > MAX_SESSION_TTL_SECONDS
  ) {
    throw new SignedTokenError("INVALID_CLAIMS");
  }
  return claims;
}

export const OWNER_SESSION_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: DEFAULT_SESSION_TTL_SECONDS,
});

export type OwnerSessionSigningOptions = SignTokenOptions;
