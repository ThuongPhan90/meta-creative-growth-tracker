import { NextRequest, NextResponse } from "next/server";

import { POST as legacyManualSync } from "../route";
import {
  detailErrorResponse,
  requireOwnerDetailSnapshot,
} from "@/lib/detail-api";
import {
  createReportingResponse,
  reportingSyncStatus,
  type ReportingWarning,
} from "@/lib/reporting";
import { resolveSnapshotReportingRequest } from "@/lib/reporting/snapshot-reporting-request";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type LegacySyncSuccess = {
  ok: true;
  message?: string;
  code?: string;
  run?: {
    id: string;
    kind: string;
    status: string;
    warningCount: number;
  };
};

function secureJson(
  value: unknown,
  status: number,
) {
  const response = NextResponse.json(value, { status });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

export async function POST(request: NextRequest) {
  const legacyResponse = await legacyManualSync(request);
  if (!legacyResponse.ok) return legacyResponse;

  try {
    const body =
      (await legacyResponse.json()) as LegacySyncSuccess;
    const { snapshot } =
      await requireOwnerDetailSnapshot(request);
    const reporting = resolveSnapshotReportingRequest({
      searchParams: request.nextUrl.searchParams,
      snapshot,
    });
    const warnings: ReportingWarning[] = [
      ...reporting.warnings,
    ];
    if ((body.run?.warningCount ?? 0) > 0) {
      warnings.push({
        code: "MANUAL_SYNC_COMPLETED_WITH_WARNINGS",
        message:
          "Manual sync hoàn tất nhưng có cảnh báo cần kiểm tra.",
        severity: "warning",
        source: "sync",
        details: {
          syncRunId: body.run?.id,
          warningCount: body.run?.warningCount,
        },
      });
    } else if (body.code === "SYNC_ALREADY_RUNNING") {
      warnings.push({
        code: "SYNC_ALREADY_RUNNING",
        message:
          "Một lần đồng bộ khác đang chạy; không tạo thêm sync run.",
        severity: "info",
        source: "sync",
      });
    }

    return secureJson(
      createReportingResponse(
        {
          ...(body.message
            ? { message: body.message }
            : {}),
          ...(body.code ? { code: body.code } : {}),
          ...(body.run ? { run: body.run } : {}),
        },
        {
          context: reporting.context,
          dataThrough:
            snapshot.freshness.dataThroughAt?.slice(0, 10) ??
            null,
          lastSuccessfulSyncAt:
            snapshot.freshness.lastSyncedAt,
          syncStatus: reportingSyncStatus({
            lastSuccessfulSyncAt:
              snapshot.freshness.lastSyncedAt,
            syncStatus: snapshot.freshness.syncStatus,
          }),
          coverage: {
            syncRun: {
              covered: body.run ? 1 : 0,
              total: 1,
              ratio: body.run ? 1 : 0,
              basis: "manual_sync_run_returned",
            },
            adAccounts: {
              covered:
                reporting.context.adAccountIds.length,
              total:
                reporting.context.adAccountIds.length,
              ratio:
                reporting.context.adAccountIds.length > 0
                  ? 1
                  : null,
              basis: "effective_ad_account_scope",
            },
          },
          warnings,
        },
      ),
      legacyResponse.status,
    );
  } catch (error) {
    return detailErrorResponse(error);
  }
}
