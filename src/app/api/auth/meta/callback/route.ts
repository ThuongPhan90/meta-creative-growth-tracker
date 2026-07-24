import { NextRequest, NextResponse } from "next/server";

import {
  exchangeForLongLivedMetaToken,
  exchangeMetaAuthorizationCode,
  MetaGraphClient,
  missingMetaOAuthScopes,
} from "@/lib/meta";
import { createTrackerRepository } from "@/lib/db";
import {
  createOwnerSession,
  encryptMetaToken,
  getMetaServerEnv,
  getSecurityServerEnv,
  META_OAUTH_NONCE_COOKIE,
  OWNER_SESSION_COOKIE,
  OWNER_SESSION_COOKIE_OPTIONS,
  verifyMetaOAuthState,
} from "@/lib/security";
import { ensureDatabaseReady, isDemoMode } from "@/lib/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const META_REQUEST_TIMEOUT_MS = 15_000;

type MetaIdentity = {
  id: string;
  name?: string;
};

type MetaPermission = {
  permission: string;
  status: "granted" | "declined" | "expired" | string;
};

function connectRedirect(
  appUrl: string,
  code: string,
  message: string,
) {
  const url = new URL("/connect", appUrl);
  url.searchParams.set("error", code);
  url.searchParams.set("message", message);
  return NextResponse.redirect(url, {
    status: 303,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function clearNonce(response: NextResponse) {
  response.cookies.set(META_OAUTH_NONCE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function GET(request: NextRequest) {
  let appUrl = process.env.APP_URL ?? request.nextUrl.origin;

  try {
    if (isDemoMode()) {
      const response = connectRedirect(
        appUrl,
        "DEMO_MODE_ACTIVE",
        "Deployment đang ở Demo mode. Đặt DEMO_MODE=false và redeploy trước khi kết nối Meta.",
      );
      clearNonce(response);
      return response;
    }
    const meta = getMetaServerEnv();
    const security = getSecurityServerEnv();
    appUrl = meta.appUrl;

    const metaError = request.nextUrl.searchParams.get("error");
    if (metaError) {
      const response = connectRedirect(
        appUrl,
        "META_OAUTH_CANCELLED",
        "Meta OAuth bị hủy hoặc không cấp đủ quyền.",
      );
      clearNonce(response);
      return response;
    }

    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const nonce = request.cookies.get(META_OAUTH_NONCE_COOKIE)?.value;
    if (!code || !state || !nonce) {
      const response = connectRedirect(
        appUrl,
        "META_OAUTH_INVALID_CALLBACK",
        "OAuth callback thiếu code, state hoặc nonce.",
      );
      clearNonce(response);
      return response;
    }

    const stateClaims = verifyMetaOAuthState(state, {
      secret: security.sessionSecret,
      expectedNonce: nonce,
    });
    const redirectUri = `${meta.appUrl}/api/auth/meta/callback`;
    const shortLived = await exchangeMetaAuthorizationCode({
      appId: meta.metaAppId,
      appSecret: meta.metaAppSecret,
      version: meta.metaGraphVersion,
      code,
      redirectUri,
      signal: AbortSignal.timeout(META_REQUEST_TIMEOUT_MS),
    });
    const longLived = await exchangeForLongLivedMetaToken({
      appId: meta.metaAppId,
      appSecret: meta.metaAppSecret,
      version: meta.metaGraphVersion,
      shortLivedAccessToken: shortLived.accessToken,
      signal: AbortSignal.timeout(META_REQUEST_TIMEOUT_MS),
    });

    const graph = new MetaGraphClient({
      accessToken: longLived.accessToken,
      appSecret: meta.metaAppSecret,
      version: meta.metaGraphVersion,
    });
    const identity = await graph.request<MetaIdentity>(
      "me",
      {
        fields: "id,name",
      },
      {
        signal: AbortSignal.timeout(META_REQUEST_TIMEOUT_MS),
      },
    );
    if (!identity.id) {
      throw new Error("Meta did not return an owner identity.");
    }

    const permissions = await graph.getAll<MetaPermission>(
      "me/permissions",
      {
        limit: 100,
      },
      {
        maxItems: 500,
        maxPages: 5,
        signal: AbortSignal.timeout(META_REQUEST_TIMEOUT_MS),
      },
    );
    const grantedScopes = permissions
      .filter((item) => item.status === "granted")
      .map((item) => item.permission);
    const declinedScopes = permissions
      .filter((item) => item.status !== "granted")
      .map((item) => item.permission);
    const missingScopes = missingMetaOAuthScopes(grantedScopes);
    if (missingScopes.length > 0) {
      const response = connectRedirect(
        appUrl,
        "META_PERMISSIONS_REQUIRED",
        `Meta chưa cấp đủ quyền chỉ đọc bắt buộc: ${missingScopes.join(", ")}.`,
      );
      clearNonce(response);
      return response;
    }

    await ensureDatabaseReady();
    const repository = await createTrackerRepository();

    const expiresAt =
      longLived.expiresInSeconds === null
        ? null
        : new Date(
            Date.now() + longLived.expiresInSeconds * 1_000,
          ).toISOString();
    const connection = await repository.claimOrRefreshConnection({
      metaUserId: identity.id,
      metaUserName: identity.name ?? null,
      encryptedAccessToken: encryptMetaToken(longLived.accessToken, {
        binding: identity.id,
        key: security.tokenEncryptionKey,
      }),
      grantedScopes,
      declinedScopes,
      tokenExpiresAt: expiresAt,
      status: "connected",
    });
    if (!connection) {
      const response = connectRedirect(
        appUrl,
        "OWNER_MISMATCH",
        "Deployment này đã khóa với một Meta owner khác.",
      );
      clearNonce(response);
      return response;
    }

    const returnUrl = new URL(stateClaims.returnTo, appUrl);
    const response = NextResponse.redirect(returnUrl, {
      status: 303,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
    response.cookies.set(
      OWNER_SESSION_COOKIE,
      createOwnerSession(connection.connectionId, {
        secret: security.sessionSecret,
      }),
      OWNER_SESSION_COOKIE_OPTIONS,
    );
    clearNonce(response);
    return response;
  } catch (error) {
    console.error("[meta-oauth-callback]", error);
    const response = connectRedirect(
      appUrl,
      "META_OAUTH_FAILED",
      "Không thể hoàn tất Meta OAuth. Kiểm tra cấu hình rồi thử lại.",
    );
    clearNonce(response);
    return response;
  }
}
