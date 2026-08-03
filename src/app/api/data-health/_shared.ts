import { NextResponse } from "next/server";

import type { ApplicationSnapshot } from "@/lib/app-data";
import type { DeliveryReadyAccountCoverage } from "@/lib/presentation/data-health-coverage";
import {
  buildDataHealthIssuesFromRuns,
  dataHealthRunEvidence,
} from "@/lib/data-contract";
import { buildDataHealthCoverage } from "@/lib/presentation/data-health-coverage";
import { reportingSyncStatus } from "@/lib/reporting/reporting-request";
import type {
  ReportingCoverage,
  ReportingWarning,
} from "@/lib/reporting/reporting-response";
import { resolveSnapshotReportingRequest } from "@/lib/reporting/snapshot-reporting-request";
import type {
  DataHealthIssue,
  SyncRunView,
} from "@/types/view-models";

export function stableDataHealthIssues(
  snapshot: ApplicationSnapshot,
) {
  return buildDataHealthIssuesFromRuns(snapshot.syncRuns);
}

export function publicIssueContract(issue: DataHealthIssue) {
  return {
    issueId: issue.issueId,
    severity: issue.severity,
    userMessage: issue.userMessage,
    occurrenceCount: issue.occurrenceCount,
    occurrenceBasis: "sync_warning_entries",
    affectedGroupCount: issue.affectedGroupCount,
    impact: issue.impact,
    affectedEntities: issue.affectedEntities,
    firstOccurredAt: issue.firstOccurredAt,
    lastOccurredAt: issue.lastOccurredAt,
    detailHref: `/api/data-health/issues/${issue.issueId}`,
  };
}

export function dataHealthCoverageContract(
  snapshot: ApplicationSnapshot,
  liveDelivery?: DeliveryReadyAccountCoverage,
) {
  return buildDataHealthCoverage(
    snapshot.creatives,
    snapshot.dashboard.events,
    liveDelivery,
  ).map((dimension) => ({
    key: dimension.key,
    label: dimension.label,
    covered: dimension.covered,
    total: dimension.total,
    missing: Math.max(
      0,
      dimension.total - dimension.covered,
    ),
    ratio: dimension.ratio,
    basis:
      dimension.key === "event"
        ? "objective_result_mapping_cells"
        : dimension.key === "delivery_ready_account"
          ? "delivery_eligible_ad_accounts"
        : "synchronized_creative_families",
  }));
}

export function ownerReportingMetadata({
  snapshot,
  searchParams,
  liveDelivery,
}: {
  snapshot: ApplicationSnapshot;
  searchParams: URLSearchParams;
  liveDelivery?: DeliveryReadyAccountCoverage;
}) {
  const reporting = resolveSnapshotReportingRequest({
    snapshot,
    searchParams,
  });
  const dimensions = dataHealthCoverageContract(snapshot, liveDelivery);
  const coverage: ReportingCoverage = Object.fromEntries(
    dimensions.map((dimension) => [
      dimension.key,
      {
        covered: dimension.covered,
        total: dimension.total,
        ratio: dimension.total > 0 ? dimension.ratio : null,
        basis: dimension.basis,
      },
    ]),
  );
  const warnings: ReportingWarning[] = [...reporting.warnings];
  const gaps = dimensions.filter(
    (dimension) =>
      (dimension.total > 0 && dimension.covered < dimension.total) ||
      (dimension.key === "delivery_ready_account" &&
        dimension.ratio === null),
  );
  if (gaps.length) {
    warnings.push({
      code: "DATA_HEALTH_COVERAGE_GAP",
      message:
        "Một hoặc nhiều chiều dữ liệu chưa đạt coverage đầy đủ trong phạm vi báo cáo.",
      severity: "warning",
      source: "coverage",
      details: {
        dimensions: gaps.map((dimension) => ({
          key: dimension.key,
          covered: dimension.covered,
          total: dimension.total,
        })),
      },
    });
  }

  return {
    context: reporting.context,
    dataThrough:
      snapshot.freshness.dataThroughAt?.slice(0, 10) ?? null,
    lastSuccessfulSyncAt: snapshot.freshness.lastSyncedAt,
    syncStatus: reportingSyncStatus({
      lastSuccessfulSyncAt: snapshot.freshness.lastSyncedAt,
      syncStatus: snapshot.freshness.syncStatus,
    }),
    coverage,
    warnings,
  };
}

export function secureCollectionResponse(value: unknown) {
  const response = NextResponse.json(value);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

export function publicSyncRunContract(run: SyncRunView) {
  const evidence = dataHealthRunEvidence(run);
  const technicalDetail =
    run.technicalSummary || run.warnings.length
      ? {
          summary: run.technicalSummary ?? null,
          warnings: run.warnings.map((warning) => ({
            code: warning.code,
            resource: warning.resource,
            message: warning.message,
          })),
        }
      : null;
  return {
    syncRunId: run.id,
    kind: run.kind,
    status: run.status,
    startedAt: run.startedAtIso ?? null,
    finishedAt: run.finishedAtIso ?? null,
    durationSeconds: run.durationSeconds ?? null,
    recordCount: run.recordCount ?? null,
    summary: run.summary,
    evidence: {
      warningEntryCount: evidence.warningEntryCount,
      reportedRowCount: evidence.reportedRowCount,
      reportedRowCountBasis:
        "sync_run_aggregate_not_allocated_to_issue_codes",
    },
    technicalDetail,
  };
}
