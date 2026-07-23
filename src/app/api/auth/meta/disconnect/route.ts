import { NextRequest, NextResponse } from "next/server";

import { createTrackerRepository } from "@/lib/db";
import { revokeMetaAuthorization } from "@/lib/meta";
import {
  decryptMetaToken,
  getSecurityServerEnv,
  OWNER_SESSION_COOKIE,
} from "@/lib/security";
import {
  assertOwnerSessionBinding,
  assertSameOrigin,
  requireOwnerSession,
  routeErrorResponse,
} from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const session = requireOwnerSession(request);
    const repository = await createTrackerRepository();
    const connection = await repository.getConnectionSecret();
    assertOwnerSessionBinding(session, connection?.connectionId);
    let authorizationRevoked = false;
    if (connection) {
      try {
        const security = getSecurityServerEnv();
        const accessToken = decryptMetaToken(
          connection.encryptedAccessToken,
          {
            key: security.tokenEncryptionKey,
            binding: connection.metaUserId,
          },
        );
        await revokeMetaAuthorization({
          accessToken,
          version: process.env.META_GRAPH_VERSION ?? "v25.0",
          signal: AbortSignal.timeout(8_000),
        });
        authorizationRevoked = true;
      } catch (error) {
        console.warn(
          "[meta-disconnect] Remote authorization revocation failed; local data will still be deleted.",
          error instanceof Error ? error.name : "UnknownError",
        );
      }
    }
    const result = await repository.deleteAllOwnerData();
    const response = NextResponse.json({
      ok: true,
      message: authorizationRevoked
        ? "Đã thu hồi quyền ứng dụng Meta và xóa toàn bộ dữ liệu khỏi deployment."
        : "Đã xóa toàn bộ dữ liệu khỏi deployment. Hãy gỡ ứng dụng trong Meta Business Integrations nếu quyền chưa được thu hồi.",
      deleted: result.connectionsDeleted,
      authorizationRevoked,
    });
    response.cookies.set(OWNER_SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return routeErrorResponse(error);
  }
}
