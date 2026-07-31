import { NextRequest } from "next/server";

import {
  detailErrorResponse,
  requireOwnerDetailSnapshot,
} from "@/lib/detail-api";
import { createReportingResponse } from "@/lib/reporting/reporting-response";
import type { DataHealthSeverity } from "@/types/view-models";

import {
  ownerReportingMetadata,
  publicIssueContract,
  secureCollectionResponse,
  stableDataHealthIssues,
} from "../_shared";

export const dynamic = "force-dynamic";

const SEVERITIES = new Set<DataHealthSeverity>([
  "critical",
  "error",
  "warning",
  "info",
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
    const requestedSeverity =
      request.nextUrl.searchParams.get("severity");
    const severity =
      requestedSeverity &&
      SEVERITIES.has(requestedSeverity as DataHealthSeverity)
        ? (requestedSeverity as DataHealthSeverity)
        : null;
    const limit = integerParameter(
      request.nextUrl.searchParams.get("limit"),
      50,
      1,
      100,
    );
    const page = integerParameter(
      request.nextUrl.searchParams.get("page"),
      1,
      1,
      10_000,
    );
    const filtered = stableDataHealthIssues(snapshot).filter(
      (issue) => !severity || issue.severity === severity,
    );
    const offset = (page - 1) * limit;
    const issues = filtered
      .slice(offset, offset + limit)
      .map(publicIssueContract);

    return secureCollectionResponse(
      createReportingResponse(
        {
          issues,
          pagination: {
            page,
            limit,
            offset,
            total: filtered.length,
          },
          filters: {
            severity,
          },
          technicalDetail: {
            rawCodesAvailableAt:
              "/api/data-health/issues/:issueId",
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
