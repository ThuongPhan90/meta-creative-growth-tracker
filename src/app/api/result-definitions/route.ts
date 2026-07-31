import { NextRequest, NextResponse } from "next/server";

import {
  detailErrorResponse,
  requireOwnerDetailSnapshot,
} from "@/lib/detail-api";
import {
  createReportingResponse,
  DEFAULT_RESULT_DEFINITIONS,
  hydrateResultDefinitions,
  reportingSyncStatus,
  resolveObjective,
  type ReportingWarning,
} from "@/lib/reporting";
import { resolveSnapshotReportingRequest } from "@/lib/reporting/snapshot-reporting-request";

export const dynamic = "force-dynamic";

function secureJson(value: unknown) {
  const response = NextResponse.json(value);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

function objectiveDefinitions<T extends { objectiveKeys: string[] }>(
  definitions: readonly T[],
  objectiveKey: string | null,
) {
  return definitions.filter(
    (definition) =>
      !objectiveKey ||
      definition.objectiveKeys.includes(objectiveKey),
  );
}

function registryCoverage({
  definitions,
  mappings,
}: {
  definitions: ReadonlyArray<{
    canonicalKey: string;
    enabled?: boolean;
  }>;
  mappings: ReadonlyArray<{
    canonicalResultKey: string;
    enabled?: boolean;
  }>;
}) {
  const enabledDefinitions = definitions.filter(
    (definition) => definition.enabled !== false,
  );
  const mappedKeys = new Set(
    mappings
      .filter((mapping) => mapping.enabled !== false)
      .map((mapping) => mapping.canonicalResultKey),
  );
  const mappedDefinitions = enabledDefinitions.filter(
    (definition) => mappedKeys.has(definition.canonicalKey),
  ).length;

  return {
    resultDefinitions: {
      covered: enabledDefinitions.length,
      total: definitions.length,
      ratio:
        definitions.length > 0
          ? enabledDefinitions.length / definitions.length
          : null,
      basis: "enabled_result_definitions",
    },
    resultMappings: {
      covered: mappedDefinitions,
      total: enabledDefinitions.length,
      ratio:
        enabledDefinitions.length > 0
          ? mappedDefinitions / enabledDefinitions.length
          : null,
      basis: "enabled_definitions_with_raw_mapping",
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const { repository, connection, snapshot } =
      await requireOwnerDetailSnapshot(request);
    const reporting = resolveSnapshotReportingRequest({
      searchParams: request.nextUrl.searchParams,
      snapshot,
    });
    const requestedObjective =
      request.nextUrl.searchParams.get("objective");
    const objectiveKey = requestedObjective
      ? resolveObjective(requestedObjective).key
      : reporting.context.objectiveKey === "all"
        ? null
        : reporting.context.objectiveKey;
    const effectiveContext =
      objectiveKey &&
      objectiveKey !== reporting.context.objectiveKey
        ? {
            ...reporting.context,
            objectiveKey,
          }
        : reporting.context;
    const warnings: ReportingWarning[] = [
      ...reporting.warnings,
    ];
    let data: {
      resultDefinitions: Array<
        (typeof DEFAULT_RESULT_DEFINITIONS)[number]
      >;
      resultMappings: Awaited<
        ReturnType<typeof repository.listResultMappings>
      >;
      campaignOverrides: Awaited<
        ReturnType<
          typeof repository.listCampaignResultOverrides
        >
      >;
      objectiveKey: string | null;
      source: "database" | "built_in_defaults";
    };

    try {
      const [storedDefinitions, resultMappings, campaignOverrides] =
        await Promise.all([
          repository.listResultDefinitions(),
          repository.listResultMappings(),
          repository.listCampaignResultOverrides(
            connection.connectionId,
          ),
        ]);
      if (storedDefinitions.length === 0) {
        throw new Error("Result registry has no definitions.");
      }
      const definitions = hydrateResultDefinitions({
        definitions: storedDefinitions,
        mappings: resultMappings,
      }).filter((definition) => definition.enabled);
      data = {
        resultDefinitions: objectiveDefinitions(
          definitions,
          objectiveKey,
        ),
        resultMappings,
        campaignOverrides,
        objectiveKey,
        source: "database",
      };
    } catch (error) {
      console.error("[result-registry-fallback]", error);
      const definitions = DEFAULT_RESULT_DEFINITIONS.filter(
        (definition) => definition.enabled,
      ).map((definition) => ({
        ...definition,
        objectiveKeys: [...definition.objectiveKeys],
        rawActionTypes: [...definition.rawActionTypes],
        rawValueActionTypes: [
          ...(definition.rawValueActionTypes ?? []),
        ],
      }));
      data = {
        resultDefinitions: objectiveDefinitions(
          definitions,
          objectiveKey,
        ),
        resultMappings: [],
        campaignOverrides: [],
        objectiveKey,
        source: "built_in_defaults",
      };
      warnings.push({
        code: "RESULT_REGISTRY_FALLBACK",
        severity: "warning",
        source: "reporting",
        message:
          "Không thể tải Result Registry đã lưu; hệ thống đang dùng định nghĩa mặc định chỉ đọc.",
      });
    }

    return secureJson(
      createReportingResponse(data, {
        context: effectiveContext,
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
        coverage: registryCoverage({
          definitions: data.resultDefinitions,
          mappings: data.resultMappings,
        }),
        warnings,
      }),
    );
  } catch (error) {
    return detailErrorResponse(error);
  }
}
