import { NextRequest, NextResponse } from "next/server";

import {
  detailErrorResponse,
  requireOwnerDetailSnapshot,
} from "@/lib/detail-api";
import {
  createReportingResponse,
  DEFAULT_OBJECTIVE_REGISTRY,
  reportingSyncStatus,
} from "@/lib/reporting";
import { resolveSnapshotReportingRequest } from "@/lib/reporting/snapshot-reporting-request";

export const dynamic = "force-dynamic";

function secure(value: unknown) {
  const response = NextResponse.json(value);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const { snapshot } = await requireOwnerDetailSnapshot(request);
    const reporting = resolveSnapshotReportingRequest({
      searchParams: request.nextUrl.searchParams,
      snapshot,
    });
    return secure(
      createReportingResponse(
        {
          objectives: DEFAULT_OBJECTIVE_REGISTRY,
          source: "built_in_registry",
        },
        {
          context: reporting.context,
          dataThrough:
            snapshot.freshness.dataThroughAt?.slice(0, 10) ?? null,
          lastSuccessfulSyncAt: snapshot.freshness.lastSyncedAt,
          syncStatus: reportingSyncStatus({
            lastSuccessfulSyncAt: snapshot.freshness.lastSyncedAt,
            syncStatus: snapshot.freshness.syncStatus,
          }),
          coverage: {
            objectiveRegistry: {
              covered: DEFAULT_OBJECTIVE_REGISTRY.length,
              total: DEFAULT_OBJECTIVE_REGISTRY.length,
              ratio: 1,
              basis: "friendly Meta objective registry",
            },
          },
          warnings: reporting.warnings,
        },
      ),
    );
  } catch (error) {
    return detailErrorResponse(error);
  }
}
