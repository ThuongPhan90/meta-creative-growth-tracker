import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  createTrackerRepository,
  SyncAlreadyRunningError,
} from "@/lib/db";
import { evaluateMetaConnectionLifecycle } from "@/lib/meta";
import { getSecurityServerEnv } from "@/lib/security";
import {
  assertCronAuthorization,
  isDemoMode,
  routeErrorResponse,
} from "@/lib/server";
import { runStoredMetaSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    if (isDemoMode()) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        message: "Demo mode đang bật; cron không gọi Meta.",
      });
    }
    assertCronAuthorization(request);
    const repository = await createTrackerRepository();
    const connection = await repository.getConnection();
    if (!connection) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        message: "Chưa có Meta connection.",
      });
    }
    if (evaluateMetaConnectionLifecycle(connection) === "needs_reauth") {
      if (connection.status !== "needs_reauth") {
        await repository.updateConnectionHealth({
          connectionId: connection.connectionId,
          status: "needs_reauth",
          errorCode: "META_REAUTH_REQUIRED",
          errorMessage:
            "The stored Meta access deadline has expired.",
        });
      }
      return NextResponse.json({
        ok: true,
        skipped: true,
        code: "META_REAUTH_REQUIRED",
        message: "Kết nối Meta đã hết hạn; cron dừng cho đến khi kết nối lại.",
      });
    }

    const security = getSecurityServerEnv();
    const result = await runStoredMetaSync({
      repository,
      connectionId: connection.connectionId,
      syncKind: "incremental",
      triggerSource: "cron",
      // Every delivery attempt gets its own run so a Vercel retry can recover
      // immediately after a timeout/failure. The advisory lock still prevents
      // two attempts from syncing the same connection concurrently.
      requestKey: `cron:incremental:${new Date().toISOString()}:${randomUUID()}`,
      adapterFactory: {
        decryption: {
          key: security.tokenEncryptionKey,
          binding: connection.metaUserId,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      run: {
        id: result.run.syncRunId,
        status: result.run.status,
        warningCount: result.warnings.length,
      },
    });
  } catch (error) {
    if (error instanceof SyncAlreadyRunningError) {
      return NextResponse.json(
        { ok: true, skipped: true, message: "Sync đang chạy." },
        { status: 202 },
      );
    }
    return routeErrorResponse(error);
  }
}
