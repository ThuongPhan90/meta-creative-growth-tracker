import { NextRequest } from "next/server";

import {
  detailErrorResponse,
  requireOwnerDetailSnapshot,
} from "@/lib/detail-api";
import { getLiveDeliveryForReport } from "@/lib/app-data";
import { createReportingResponse } from "@/lib/reporting/reporting-response";

import {
  dataHealthCoverageContract,
  ownerReportingMetadata,
  secureCollectionResponse,
  stableDataHealthIssues,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { snapshot } =
      await requireOwnerDetailSnapshot(request);
    const baseMetadata = ownerReportingMetadata({
      snapshot,
      searchParams: request.nextUrl.searchParams,
    });
    const liveDelivery = await getLiveDeliveryForReport({
      snapshot,
      context: baseMetadata.context,
    });
    const metadata = ownerReportingMetadata({
      snapshot,
      searchParams: request.nextUrl.searchParams,
      liveDelivery,
    });
    const issues = stableDataHealthIssues(snapshot);
    const issueCounts = {
      critical: 0,
      error: 0,
      warning: 0,
      info: 0,
    };
    for (const issue of issues) {
      issueCounts[issue.severity] += 1;
    }
    const latestRun = snapshot.syncRuns[0] ?? null;
    const attentionLevel =
      issueCounts.critical > 0 ||
      issueCounts.error > 0 ||
      metadata.syncStatus === "failed"
        ? "error"
        : issueCounts.warning > 0 ||
            metadata.syncStatus === "partial" ||
            metadata.syncStatus ===
              "completed_with_warnings" ||
            metadata.syncStatus === "never"
          ? "warning"
          : "healthy";

    return secureCollectionResponse(
      createReportingResponse(
        {
          attentionLevel,
          issueCounts: {
            ...issueCounts,
            total: issues.length,
          },
          coverage: dataHealthCoverageContract(snapshot, liveDelivery),
          latestRun: latestRun
            ? {
                syncRunId: latestRun.id,
                status: latestRun.status,
                startedAt: latestRun.startedAtIso ?? null,
                finishedAt: latestRun.finishedAtIso ?? null,
                warningEntryCount: latestRun.warnings.length,
                summary: latestRun.summary,
              }
            : null,
        },
        metadata,
      ),
    );
  } catch (error) {
    return detailErrorResponse(error);
  }
}
