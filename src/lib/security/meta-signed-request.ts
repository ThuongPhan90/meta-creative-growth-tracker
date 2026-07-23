import { createHmac, timingSafeEqual } from "node:crypto";

export class MetaSignedRequestError extends Error {
  constructor() {
    super("Meta signed_request is invalid.");
    this.name = "MetaSignedRequestError";
  }
}

export type MetaSignedRequestPayload = {
  algorithm?: string;
  user_id: string;
  issued_at: number;
  [key: string]: unknown;
};

export type VerifyMetaSignedRequestOptions = {
  nowSeconds?: number;
  maxAgeSeconds?: number;
  maxFutureSkewSeconds?: number;
};

export function createMetaDataDeletionConfirmation(
  payload: Pick<MetaSignedRequestPayload, "user_id" | "issued_at">,
  appSecret: string,
) {
  if (
    !appSecret ||
    !payload.user_id.trim() ||
    !Number.isInteger(payload.issued_at)
  ) {
    throw new MetaSignedRequestError();
  }
  return createHmac("sha256", appSecret)
    .update(`data-deletion:${payload.user_id}:${payload.issued_at}`)
    .digest("hex")
    .slice(0, 24);
}

function decodeJson(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    throw new MetaSignedRequestError();
  }
}

export function verifyMetaSignedRequest(
  signedRequest: string,
  appSecret: string,
  options: VerifyMetaSignedRequestOptions = {},
): MetaSignedRequestPayload {
  if (!appSecret || !signedRequest) throw new MetaSignedRequestError();
  const [signatureSegment, payloadSegment, extra] = signedRequest.split(".");
  if (!signatureSegment || !payloadSegment || extra !== undefined) {
    throw new MetaSignedRequestError();
  }

  let suppliedSignature: Buffer;
  try {
    suppliedSignature = Buffer.from(signatureSegment, "base64url");
  } catch {
    throw new MetaSignedRequestError();
  }
  const expectedSignature = createHmac("sha256", appSecret)
    .update(payloadSegment, "ascii")
    .digest();
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    throw new MetaSignedRequestError();
  }

  const payload = decodeJson(payloadSegment);
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload) ||
    typeof (payload as { user_id?: unknown }).user_id !== "string" ||
    !(payload as { user_id: string }).user_id.trim() ||
    !Number.isInteger((payload as { issued_at?: unknown }).issued_at) ||
    ("algorithm" in payload &&
      String((payload as { algorithm?: unknown }).algorithm).toUpperCase() !==
        "HMAC-SHA256")
  ) {
    throw new MetaSignedRequestError();
  }

  const issuedAt = (payload as { issued_at: number }).issued_at;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const maxAge = options.maxAgeSeconds ?? 24 * 60 * 60;
  const maxFutureSkew = options.maxFutureSkewSeconds ?? 5 * 60;
  if (
    !Number.isInteger(now) ||
    !Number.isInteger(maxAge) ||
    !Number.isInteger(maxFutureSkew) ||
    maxAge < 60 ||
    maxFutureSkew < 0 ||
    issuedAt < now - maxAge ||
    issuedAt > now + maxFutureSkew
  ) {
    throw new MetaSignedRequestError();
  }

  return payload as MetaSignedRequestPayload;
}
