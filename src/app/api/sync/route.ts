import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  createTrackerRepository,
  SyncAlreadyRunningError,
  type SyncKind,
} from "@/lib/db";
import { getSecurityServerEnv } from "@/lib/security";
import {
  assertLiveMode,
  assertOwnerSessionBinding,
  assertSameOrigin,
  requireOwnerSession,
  routeErrorResponse,
} from "@/lib/server";
import { runStoredMetaSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const allowedKinds = new Set<SyncKind>([
  "full",
  "assets",
  "insights",
  "incremental",
]);

async function requestedKind(request: NextRequest): Promise<SyncKind> {
  const queryKind = request.nextUrl.searchParams.get("kind");
  if (queryKind && allowedKinds.has(queryKind as SyncKind)) {
    return queryKind as SyncKind;
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await request.json().catch(() => null)) as {
      kind?: string;
    } | null;
    if (payload?.kind && allowedKinds.has(payload.kind as SyncKind)) {
      return payload.kind as SyncKind;
    }
  }
  return "incremental";
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    assertLiveMode();
    const session = requireOwnerSession(request);
    const kind = await requestedKind(request);
    const repository = await createTrackerRepository();
    const connection = await repository.getConnection();
    if (!connection) {
      return NextResponse.json(
        {
          ok: false,
          error: "Chưa có Meta connection.",
          code: "META_NOT_CONNECTED",
        },
        { status: 409 },
      );
    }
    assertOwnerSessionBinding(session, connection.connectionId);

    const security = getSecurityServerEnv();
    const result = await runStoredMetaSync({
      repository,
      connectionId: connection.connectionId,
      syncKind: kind,
      triggerSource: kind === "full" ? "setup" : "manual",
      requestKey:
        request.headers.get("x-idempotency-key") ??
        `manual:${kind}:${randomUUID()}`,
      adapterFactory: {
        decryption: {
          key: security.tokenEncryptionKey,
          binding: connection.metaUserId,
        },
      },
    });

    if (
      kind === "full" &&
      result.run.status === "succeeded"
    ) {
      await repository.updateSettings({
        lastInitialSyncAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      ok: true,
      message:
        result.run.status === "partial"
          ? "Đồng bộ hoàn tất một phần; mở Sức khỏe dữ liệu để xem cảnh báo."
          : "Đồng bộ Meta đã hoàn tất.",
      run: {
        id: result.run.syncRunId,
        kind: result.run.syncKind,
        status: result.run.status,
        warningCount: result.warnings.length,
      },
    });
  } catch (error) {
    if (error instanceof SyncAlreadyRunningError) {
      return NextResponse.json(
        {
          ok: true,
          message: "Một lần đồng bộ khác đang chạy.",
          code: "SYNC_ALREADY_RUNNING",
        },
        { status: 202 },
      );
    }
    return routeErrorResponse(error);
  }
}
