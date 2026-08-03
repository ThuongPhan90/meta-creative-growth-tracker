import { NextRequest } from "next/server";

import {
  detailErrorResponse,
  requireOwnerDetailOperationalSnapshot,
} from "@/lib/detail-api";
import {
  getDataHealthCreativeReferenceSnapshot,
  getLiveDeliveryForReport,
} from "@/lib/app-data";
import { createReportingResponse } from "@/lib/reporting/reporting-response";
import { resolveSnapshotReportingRequest } from "@/lib/reporting/snapshot-reporting-request";

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
      await requireOwnerDetailOperationalSnapshot(request);
    const context = resolveSnapshotReportingRequest({
      snapshot,
      searchParams: request.nextUrl.searchParams,
    }).context;
    const [creativeReferences, liveDelivery] = await Promise.all([
      getDataHealthCreativeReferenceSnapshot(snapshot),
      getLiveDeliveryForReport({
        snapshot,
        context,
      }),
    ]);
    const metadata = ownerReportingMetadata({
      snapshot,
      searchParams: request.nextUrl.searchParams,
      liveDelivery,
      creatives: creativeReferences.items,
      creativeReferencesTruncated: creativeReferences.truncated,
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
    const hasCoverageWarning = metadata.warnings.some(
      (warning) => warning.source === "coverage",
    );
    const attentionLevel =
      issueCounts.critical > 0 ||
      issueCounts.error > 0 ||
      metadata.syncStatus === "failed"
        ? "error"
        : issueCounts.warning > 0 ||
            hasCoverageWarning ||
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
          coverage: dataHealthCoverageContract(
            snapshot,
            creativeReferences.items,
            creativeReferences.truncated,
            liveDelivery,
          ),
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
