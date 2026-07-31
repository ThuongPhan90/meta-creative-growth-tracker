import { NextRequest, NextResponse } from "next/server";

import {
  GET as legacyGetScope,
  POST as legacyPostScope,
} from "../reporting/scope/route";
import {
  detailErrorResponse,
  requireOwnerDetailSnapshot,
} from "@/lib/detail-api";
import {
  createReportingResponse,
  reportingSyncStatus,
  type CanonicalReportingScope,
  type ReportingWarning,
} from "@/lib/reporting";
import { resolveSnapshotReportingRequest } from "@/lib/reporting/snapshot-reporting-request";

export const dynamic = "force-dynamic";

type LegacyScopeSuccess = {
  ok: true;
  message?: string;
  scope: CanonicalReportingScope;
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

function selectionCoverage(
  selected: readonly string[],
  unavailable: readonly string[],
  basis: string,
) {
  const total = selected.length + unavailable.length;
  return {
    covered: selected.length,
    total,
    ratio: total > 0 ? selected.length / total : null,
    basis,
  };
}

async function canonicalScopeResponse({
  request,
  legacyResponse,
}: {
  request: NextRequest;
  legacyResponse: Response;
}) {
  if (!legacyResponse.ok) return legacyResponse;

  try {
    const body =
      (await legacyResponse.json()) as LegacyScopeSuccess;
    const { snapshot } =
      await requireOwnerDetailSnapshot(request);
    const reporting = resolveSnapshotReportingRequest({
      searchParams: request.nextUrl.searchParams,
      snapshot,
    });
    const scope = body.scope;
    const context = {
      ...reporting.context,
      businessIds: [...scope.selected.businessIds],
      adAccountIds: [...scope.selected.adAccountIds],
    };
    const warnings: ReportingWarning[] = [
      ...reporting.warnings,
    ];
    if (
      scope.unavailableSelected.businessIds.length > 0 ||
      scope.unavailableSelected.adAccountIds.length > 0
    ) {
      warnings.push({
        code: "REPORTING_SCOPE_MEMBERS_UNAVAILABLE",
        message:
          "Một phần phạm vi yêu cầu không còn khả dụng cho kết nối owner hiện tại.",
        severity: "warning",
        source: "coverage",
        details: {
          businessIds:
            scope.unavailableSelected.businessIds,
          adAccountIds:
            scope.unavailableSelected.adAccountIds,
        },
      });
    }

    return secureJson(
      createReportingResponse(
        {
          scope,
          ...(body.message ? { message: body.message } : {}),
        },
        {
          context,
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
            businesses: selectionCoverage(
              scope.selected.businessIds,
              scope.unavailableSelected.businessIds,
              "selected_businesses_available_to_owner",
            ),
            adAccounts: selectionCoverage(
              scope.selected.adAccountIds,
              scope.unavailableSelected.adAccountIds,
              "selected_ad_accounts_available_to_owner",
            ),
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

export async function GET(request: NextRequest) {
  return canonicalScopeResponse({
    request,
    legacyResponse: await legacyGetScope(request),
  });
}

export async function POST(request: NextRequest) {
  return canonicalScopeResponse({
    request,
    legacyResponse: await legacyPostScope(request),
  });
}
