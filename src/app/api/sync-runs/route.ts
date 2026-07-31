import { NextRequest } from "next/server";

import {
  detailErrorResponse,
  requireOwnerDetailSnapshot,
} from "@/lib/detail-api";
import { createReportingResponse } from "@/lib/reporting/reporting-response";
import type { SyncRunView } from "@/types/view-models";

import {
  ownerReportingMetadata,
  publicSyncRunContract,
  secureCollectionResponse,
} from "../data-health/_shared";

export const dynamic = "force-dynamic";

const STATUSES = new Set<SyncRunView["status"]>([
  "running",
  "success",
  "partial",
  "failed",
  "cancelled",
]);

function integerParameter(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed)
    ? Math.min(Math.max(parsed, minimum), maximum)
    : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const { snapshot } =
      await requireOwnerDetailSnapshot(request);
    const requestedStatus =
      request.nextUrl.searchParams.get("status");
    const status =
      requestedStatus &&
      STATUSES.has(requestedStatus as SyncRunView["status"])
        ? (requestedStatus as SyncRunView["status"])
        : null;
    const limit = integerParameter(
      request.nextUrl.searchParams.get("limit"),
      20,
      1,
      100,
    );
    const page = integerParameter(
      request.nextUrl.searchParams.get("page"),
      1,
      1,
      10_000,
    );
    const filtered = snapshot.syncRuns.filter(
      (run) => !status || run.status === status,
    );
    const offset = (page - 1) * limit;

    return secureCollectionResponse(
      createReportingResponse(
        {
          syncRuns: filtered
            .slice(offset, offset + limit)
            .map(publicSyncRunContract),
          pagination: {
            page,
            limit,
            offset,
            totalLoaded: filtered.length,
            sourceWindowTruncated:
              snapshot.syncRuns.length >= 20,
          },
          filters: {
            status,
          },
        },
        ownerReportingMetadata({
          snapshot,
          searchParams: request.nextUrl.searchParams,
        }),
      ),
    );
  } catch (error) {
    return detailErrorResponse(error);
  }
}
