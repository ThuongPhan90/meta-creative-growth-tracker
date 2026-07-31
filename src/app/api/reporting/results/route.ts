import { NextRequest, NextResponse } from "next/server";

import { GET as legacyResultDefinitions } from "../../result-definitions/route";
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

type ResultRegistryBody = {
  data: {
    resultDefinitions?: Array<{
      canonicalKey?: string;
      enabled?: boolean;
    }>;
    resultMappings?: Array<{
      canonicalResultKey?: string;
      enabled?: boolean;
    }>;
    [key: string]: unknown;
  };
  warnings?: Array<{
    code?: string;
    message?: string;
    severity?: ReportingWarning["severity"];
  }>;
  meta?: {
    warnings?: Array<{
      code?: string;
      message?: string;
      severity?: ReportingWarning["severity"];
    }>;
  };
};

function secure(value: unknown) {
  const response = NextResponse.json(value);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

function registryWarnings(
  warnings: ResultRegistryBody["warnings"],
): ReportingWarning[] {
  return (warnings ?? []).map((warning) => ({
    code: warning.code ?? "RESULT_REGISTRY_WARNING",
    message:
      warning.message ??
      "Result Registry đang dùng dữ liệu dự phòng chỉ đọc.",
    severity: warning.severity ?? "warning",
    source: "reporting",
  }));
}

export async function GET(request: NextRequest) {
  try {
    const { snapshot } = await requireOwnerDetailSnapshot(request);
    const reporting = resolveSnapshotReportingRequest({
      searchParams: request.nextUrl.searchParams,
      snapshot,
    });
    const legacyResponse = await legacyResultDefinitions(request);
    if (!legacyResponse.ok) return legacyResponse;

    const body = (await legacyResponse.json()) as ResultRegistryBody;
    const definitions = body.data.resultDefinitions ?? [];
    const mappings = body.data.resultMappings ?? [];
    const enabledDefinitions = definitions.filter(
      (definition) => definition.enabled !== false,
    );
    const mappedKeys = new Set(
      mappings
        .filter((mapping) => mapping.enabled !== false)
        .map((mapping) => mapping.canonicalResultKey)
        .filter((key): key is string => Boolean(key)),
    );
    const mappedDefinitions = enabledDefinitions.filter(
      (definition) =>
        Boolean(
          definition.canonicalKey &&
            mappedKeys.has(definition.canonicalKey),
        ),
    ).length;

    return secure(
      createReportingResponse(body.data, {
        context: reporting.context,
        dataThrough:
          snapshot.freshness.dataThroughAt?.slice(0, 10) ?? null,
        lastSuccessfulSyncAt: snapshot.freshness.lastSyncedAt,
        syncStatus: reportingSyncStatus({
          lastSuccessfulSyncAt: snapshot.freshness.lastSyncedAt,
          syncStatus: snapshot.freshness.syncStatus,
        }),
        coverage: {
          resultDefinitions: {
            covered: enabledDefinitions.length,
            total: definitions.length,
            ratio:
              definitions.length > 0
                ? enabledDefinitions.length / definitions.length
                : null,
            basis: "enabled Result Definitions in the effective registry",
          },
          resultMappings: {
            covered: mappedDefinitions,
            total: enabledDefinitions.length,
            ratio:
              enabledDefinitions.length > 0
                ? mappedDefinitions / enabledDefinitions.length
                : null,
            basis: "enabled definitions with at least one raw mapping",
          },
        },
        warnings: [
          ...reporting.warnings,
          ...registryWarnings(
            body.meta?.warnings ?? body.warnings,
          ),
        ],
      }),
    );
  } catch (error) {
    return detailErrorResponse(error);
  }
}
