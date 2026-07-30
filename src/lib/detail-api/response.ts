import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { getApplicationSnapshot } from "@/lib/app-data";
import {
  createTrackerRepository,
  type MetaConnectionRecord,
  type TrackerRepository,
} from "@/lib/db";
import {
  assertOwnerSessionBinding,
  requireOwnerSession,
  routeErrorResponse,
} from "@/lib/server";

export class DetailApiError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DetailApiError";
  }
}

function secureResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

export function detailSuccess(data: unknown) {
  return secureResponse(NextResponse.json({ ok: true, data }));
}

export function detailErrorResponse(error: unknown) {
  if (error instanceof DetailApiError) {
    return secureResponse(
      NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: error.status },
      ),
    );
  }
  return secureResponse(routeErrorResponse(error));
}

export async function requireOwnerDetailContext(
  request: NextRequest,
): Promise<{
  repository: TrackerRepository;
  connection: MetaConnectionRecord;
}> {
  const session = requireOwnerSession(request);
  const repository = await createTrackerRepository();
  const connection = await repository.getConnection();
  if (!connection) {
    throw new DetailApiError(
      409,
      "META_NOT_CONNECTED",
      "Chưa có kết nối Meta cho owner hiện tại.",
    );
  }
  assertOwnerSessionBinding(session, connection.connectionId);
  return { repository, connection };
}

export async function requireOwnerDetailSnapshot(request: NextRequest) {
  const context = await requireOwnerDetailContext(request);
  const snapshot = await getApplicationSnapshot();
  if (
    !snapshot.authenticated ||
    snapshot.connection?.connectionId !== context.connection.connectionId
  ) {
    throw new DetailApiError(
      409,
      "OWNER_CONTEXT_UNAVAILABLE",
      "Không thể tải dữ liệu cho phiên owner hiện tại.",
    );
  }
  return { ...context, snapshot };
}
