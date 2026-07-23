import "server-only";

import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

import {
  OWNER_SESSION_COOKIE,
  verifyOwnerSession,
  type OwnerSessionClaims,
} from "@/lib/security";

export class RequestSecurityError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 409,
    readonly code:
      | "BAD_ORIGIN"
      | "DEMO_MODE_ACTIVE"
      | "LEGAL_CONFIGURATION_REQUIRED"
      | "INVALID_OWNER_SECRET"
      | "OWNER_SESSION_REQUIRED"
      | "INVALID_CRON_SECRET",
  ) {
    super(code);
    this.name = "RequestSecurityError";
  }
}

function secretEquals(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false;
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

export function assertSameOrigin(request: NextRequest) {
  const configuredOrigin = process.env.APP_URL;
  const requestOrigin = request.headers.get("origin");
  if (!configuredOrigin || !requestOrigin) {
    throw new RequestSecurityError(403, "BAD_ORIGIN");
  }

  let expected: string;
  let actual: string;
  try {
    expected = new URL(configuredOrigin).origin;
    actual = new URL(requestOrigin).origin;
  } catch {
    throw new RequestSecurityError(403, "BAD_ORIGIN");
  }

  if (expected !== actual) {
    throw new RequestSecurityError(403, "BAD_ORIGIN");
  }
}

export function assertLiveMode() {
  if (process.env.DEMO_MODE?.trim().toLowerCase() !== "false") {
    throw new RequestSecurityError(409, "DEMO_MODE_ACTIVE");
  }
}

export function assertLegalConfiguration() {
  const entity = process.env.LEGAL_ENTITY_NAME?.trim();
  const email = process.env.PRIVACY_CONTACT_EMAIL?.trim();
  if (
    !entity ||
    entity.length < 2 ||
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new RequestSecurityError(409, "LEGAL_CONFIGURATION_REQUIRED");
  }
}

export function assertOwnerSetupSecret(candidate: string | undefined) {
  const expected = process.env.OWNER_SETUP_SECRET;
  if (
    !expected ||
    Buffer.byteLength(expected, "utf8") < 32 ||
    !secretEquals(candidate, expected)
  ) {
    throw new RequestSecurityError(401, "INVALID_OWNER_SECRET");
  }
}

export function readOwnerSession(request: NextRequest) {
  const token = request.cookies.get(OWNER_SESSION_COOKIE)?.value;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!token || !sessionSecret) return null;

  try {
    return verifyOwnerSession(token, { secret: sessionSecret });
  } catch {
    return null;
  }
}

export function requireOwnerSession(request: NextRequest) {
  const session = readOwnerSession(request);
  if (!session) {
    throw new RequestSecurityError(401, "OWNER_SESSION_REQUIRED");
  }
  return session;
}

export function assertOwnerSessionBinding(
  session: OwnerSessionClaims,
  connectionId: string | null | undefined,
) {
  if (!connectionId || session.sub !== connectionId) {
    throw new RequestSecurityError(401, "OWNER_SESSION_REQUIRED");
  }
}

export function assertCronAuthorization(request: NextRequest) {
  const header = request.headers.get("authorization");
  const candidate = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const expected = process.env.CRON_SECRET;
  if (
    !expected ||
    Buffer.byteLength(expected, "utf8") < 32 ||
    !secretEquals(candidate, expected)
  ) {
    throw new RequestSecurityError(401, "INVALID_CRON_SECRET");
  }
}

export function safeSecurityMessage(error: RequestSecurityError) {
  switch (error.code) {
    case "BAD_ORIGIN":
      return "Yêu cầu không đến từ deployment đã cấu hình.";
    case "DEMO_MODE_ACTIVE":
      return "Deployment đang ở Demo mode. Đặt DEMO_MODE=false và redeploy để dùng Meta Live.";
    case "LEGAL_CONFIGURATION_REQUIRED":
      return "Hãy cấu hình LEGAL_ENTITY_NAME và PRIVACY_CONTACT_EMAIL trước khi kết nối Meta.";
    case "INVALID_OWNER_SECRET":
      return "Mã thiết lập owner không hợp lệ.";
    case "OWNER_SESSION_REQUIRED":
      return "Phiên owner đã hết hạn. Hãy xác thực lại.";
    case "INVALID_CRON_SECRET":
      return "Cron authorization không hợp lệ.";
  }
}
