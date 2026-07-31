import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  detailErrorResponse,
  requireOwnerDetailSnapshot,
} from "@/lib/detail-api";
import {
  createReportingResponse,
  hydrateResultDefinitions,
  reportingSyncStatus,
  validateResultMappings,
} from "@/lib/reporting";
import { resolveSnapshotReportingRequest } from "@/lib/reporting/snapshot-reporting-request";
import { assertLiveMode, assertSameOrigin } from "@/lib/server";

export const dynamic = "force-dynamic";

const resultMappingSchema = z
  .object({
    canonicalResultKey: z.string().trim().min(1).max(160),
    rawActionType: z.string().trim().min(1).max(128),
    metricSource: z.enum(["action", "action_value"]),
    priority: z.number().int().min(0).max(10_000),
    enabled: z.boolean().default(true),
  })
  .strict();

const resultMappingsSchema = z
  .object({
    mappings: z.array(resultMappingSchema).min(1).max(500),
  })
  .strict();

function response(value: unknown, status = 200) {
  const result = NextResponse.json(value, { status });
  result.headers.set("Cache-Control", "private, no-store");
  result.headers.set("Vary", "Cookie");
  return result;
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    assertLiveMode();
    const { repository, connection, snapshot } =
      await requireOwnerDetailSnapshot(request);
    const reporting = resolveSnapshotReportingRequest({
      searchParams: request.nextUrl.searchParams,
      snapshot,
    });
    const input = resultMappingsSchema.parse(await request.json());
    const definitions = await repository.listResultDefinitions();
    const validation = validateResultMappings({
      definitions,
      mappings: input.mappings,
    });
    if (!validation.ok) {
      return response(
        {
          ok: false,
          code: validation.code,
          error: validation.error,
        },
        400,
      );
    }

    const mappings = await repository.saveResultMappings({
      connectionId: connection.connectionId,
      mappings: validation.mappings,
    });
    const hydratedDefinitions = hydrateResultDefinitions({
      definitions,
      mappings,
    });
    const enabledDefinitions = hydratedDefinitions.filter(
      (definition) => definition.enabled,
    );
    const mappedKeys = new Set(
      mappings
        .filter((mapping) => mapping.enabled)
        .map((mapping) => mapping.canonicalResultKey),
    );
    const mappedDefinitions = enabledDefinitions.filter(
      (definition) =>
        mappedKeys.has(definition.canonicalKey),
    ).length;

    return response(
      createReportingResponse(
        {
          message:
            "Đã lưu Result Mapping cho báo cáo chỉ đọc.",
          resultDefinitions: hydratedDefinitions,
          resultMappings: mappings,
          metaWritePerformed: false,
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
            resultDefinitions: {
              covered: enabledDefinitions.length,
              total: hydratedDefinitions.length,
              ratio:
                hydratedDefinitions.length > 0
                  ? enabledDefinitions.length /
                    hydratedDefinitions.length
                  : null,
              basis: "enabled_result_definitions",
            },
            resultMappings: {
              covered: mappedDefinitions,
              total: enabledDefinitions.length,
              ratio:
                enabledDefinitions.length > 0
                  ? mappedDefinitions /
                    enabledDefinitions.length
                  : null,
              basis:
                "enabled_definitions_with_saved_raw_mapping",
            },
          },
          warnings: reporting.warnings,
        },
      ),
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return response(
        {
          ok: false,
          code: "INVALID_RESULT_MAPPING",
          error:
            "Danh sách Result Mapping không hợp lệ.",
        },
        400,
      );
    }
    return detailErrorResponse(error);
  }
}
