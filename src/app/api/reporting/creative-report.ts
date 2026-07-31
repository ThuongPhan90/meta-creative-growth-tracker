import { NextRequest, NextResponse } from "next/server";

import { getCreativeRowsForReport } from "@/lib/app-data";
import { requireOwnerDetailSnapshot } from "@/lib/detail-api";
import {
  buildCreativeCollection,
  buildCreativeCollectionCoverage,
  buildCreativeCollectionWarnings,
} from "@/lib/reporting/creative-collection-contract";
import { reportingSyncStatus } from "@/lib/reporting/reporting-request";
import { resolveSnapshotReportingRequest } from "@/lib/reporting/snapshot-reporting-request";

export async function loadCreativeReportingCollection(
  request: NextRequest,
) {
  const { snapshot } = await requireOwnerDetailSnapshot(request);
  const reporting = resolveSnapshotReportingRequest({
    searchParams: request.nextUrl.searchParams,
    snapshot,
  });
  const context = reporting.context;
  const campaignMetaId =
    request.nextUrl.searchParams.get("campaign")?.trim() ||
    undefined;
  const report = await getCreativeRowsForReport({
    snapshot,
    dateFrom: context.dateFrom,
    dateTo: context.dateTo,
    accountMetaIds: context.adAccountIds,
    campaignMetaId,
    currency: context.currency ?? null,
    attributionWindow: context.attributionSettingKey,
    actionReportTime: context.actionReportTime,
    syncVersion: context.syncVersion,
    reportContext: context,
  });
  const creatives = buildCreativeCollection(
    report.creatives,
    context,
  );
  const coverage = buildCreativeCollectionCoverage(
    creatives,
    context,
  );
  const warnings = [
    ...reporting.warnings,
    ...buildCreativeCollectionWarnings({
      coverage,
      truncated: report.truncated,
    }),
  ];

  return {
    snapshot,
    context,
    report,
    creatives,
    meta: {
      context,
      dataThrough:
        snapshot.freshness.dataThroughAt?.slice(0, 10) ?? null,
      lastSuccessfulSyncAt: snapshot.freshness.lastSyncedAt,
      syncStatus: reportingSyncStatus({
        lastSuccessfulSyncAt: snapshot.freshness.lastSyncedAt,
        syncStatus: snapshot.freshness.syncStatus,
      }),
      coverage,
      warnings,
    },
  };
}

export function secureReportingJson(value: unknown) {
  const response = NextResponse.json(value);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}
