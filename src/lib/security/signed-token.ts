import {
  createHmac,
  timingSafeEqual,
  type BinaryLike,
} from "node:crypto";
import { getSecurityServerEnv } from "./env";

const HEADER = Object.freeze({
  alg: "HS256",
  typ: "MCGT",
  v: 1,
});
const ENCODED_HEADER = Buffer.from(JSON.stringify(HEADER)).toString(
  "base64url",
);

export type SignedTokenErrorCode =
  | "MALFORMED"
  | "INVALID_SIGNATURE"
  | "INVALID_CLAIMS"
  | "EXPIRED"
  | "NOT_YET_VALID";

export class SignedTokenError extends Error {
  readonly code: SignedTokenErrorCode;

  constructor(code: SignedTokenErrorCode) {
    const messages: Record<SignedTokenErrorCode, string> = {
      MALFORMED: "Signed token is malformed.",
      INVALID_SIGNATURE: "Signed token signature is invalid.",
      INVALID_CLAIMS: "Signed token claims are invalid.",
      EXPIRED: "Signed token has expired.",
      NOT_YET_VALID: "Signed token is not yet valid.",
    };
    super(messages[code]);
    this.name = "SignedTokenError";
    this.code = code;
  }
}

export interface TemporalClaims {
  iat: number;
  exp: number;
}

export interface SignTokenOptions {
  secret?: string | Uint8Array;
  context: string;
}

export interface VerifyTokenOptions extends SignTokenOptions {
  nowSeconds?: number;
  clockToleranceSeconds?: number;
}

function resolveSecret(secretInput?: string | Uint8Array): Buffer {
  const secret =
    secretInput ??
    getSecurityServerEnv().sessionSecret;
  const buffer =
    typeof secret === "string"
      ? Buffer.from(secret, "utf8")
      : Buffer.from(secret);
  if (buffer.length < 32) {
    throw new SignedTokenError("INVALID_CLAIMS");
  }
  return buffer;
}

function signingKey(secret: Buffer, context: string): Buffer {
  if (!/^[a-z0-9:_-]{1,80}$/.test(context)) {
    throw new SignedTokenError("INVALID_CLAIMS");
  }
  return createHmac("sha256", secret)
    .update(`meta-creative-growth-tracker:${context}:signing-key:v1`)
    .digest();
}

function signature(
  input: BinaryLike,
  secret: string | Uint8Array | undefined,
  context: string,
): Buffer {
  return createHmac("sha256", signingKey(resolveSecret(secret), context))
    .update(input)
    .digest();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function signStructuredToken<T extends TemporalClaims>(
  claims: T,
  options: SignTokenOptions,
): string {
  const encodedPayload = Buffer.from(JSON.stringify(claims)).toString(
    "base64url",
  );
  const signingInput = `${ENCODED_HEADER}.${encodedPayload}`;
  const encodedSignature = signature(
    signingInput,
    options.secret,
    options.context,
  ).toString("base64url");
  return `${signingInput}.${encodedSignature}`;
}

export function verifyStructuredToken<T extends TemporalClaims>(
  token: string,
  options: VerifyTokenOptions,
): T {
  if (
    token.length === 0 ||
    token.length > 4_096 ||
    !/^[A-Za-z0-9_.-]+$/.test(token)
  ) {
    throw new SignedTokenError("MALFORMED");
  }

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== ENCODED_HEADER) {
    throw new SignedTokenError("MALFORMED");
  }

  let providedSignature: Buffer;
  let claims: unknown;
  try {
    providedSignature = Buffer.from(parts[2], "base64url");
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new SignedTokenError("MALFORMED");
  }

  const expectedSignature = signature(
    `${parts[0]}.${parts[1]}`,
    options.secret,
    options.context,
  );
  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    throw new SignedTokenError("INVALID_SIGNATURE");
  }

  if (
    !isRecord(claims) ||
    typeof claims.iat !== "number" ||
    !Number.isInteger(claims.iat) ||
    typeof claims.exp !== "number" ||
    !Number.isInteger(claims.exp) ||
    claims.exp <= claims.iat
  ) {
    throw new SignedTokenError("INVALID_CLAIMS");
  }

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const tolerance = Math.min(
    Math.max(options.clockToleranceSeconds ?? 30, 0),
    300,
  );
  if (claims.iat > now + tolerance) {
    throw new SignedTokenError("NOT_YET_VALID");
  }
  if (claims.exp <= now - tolerance) {
    throw new SignedTokenError("EXPIRED");
  }

  return claims as T;
}
