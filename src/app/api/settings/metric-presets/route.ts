import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createTrackerRepository,
  SettingsUpdateConflictError,
} from "@/lib/db";
import { validateMetricDisplayPresets } from "@/lib/reporting";
import {
  assertLiveMode,
  assertOwnerSessionBinding,
  assertSameOrigin,
  requireOwnerSession,
  routeErrorResponse,
} from "@/lib/server";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  metricDisplayPresets: z.unknown(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});

function response(value: unknown, status = 200) {
  const result = NextResponse.json(value, { status });
  result.headers.set("Cache-Control", "private, no-store");
  result.headers.set("Vary", "Cookie");
  return result;
}

async function ownerRepository(request: NextRequest) {
  assertLiveMode();
  const session = requireOwnerSession(request);
  const repository = await createTrackerRepository();
  const connection = await repository.getConnection();
  assertOwnerSessionBinding(session, connection?.connectionId);
  return repository;
}

export async function GET(request: NextRequest) {
  try {
    const repository = await ownerRepository(request);
    const settings = await repository.getSettings();
    return response({
      ok: true,
      metricDisplayPresets: settings.metricDisplayPresets,
      updatedAt: settings.updatedAt,
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const input = updateSchema.parse(await request.json());
    const repository = await ownerRepository(request);
    const definitions = await repository.listResultDefinitions();
    const presets = validateMetricDisplayPresets(input.metricDisplayPresets, {
      resultDefinitions: definitions,
    });
    if (!presets.ok) {
      return response(
        {
          ok: false,
          code: presets.code,
          error: presets.message,
        },
        400,
      );
    }
    const settings = await repository.updateSettings({
      metricDisplayPresets: presets.value,
      expectedUpdatedAt: input.expectedUpdatedAt,
    });
    return response({
      ok: true,
      metricDisplayPresets: settings.metricDisplayPresets,
      updatedAt: settings.updatedAt,
    });
  } catch (error) {
    if (error instanceof SettingsUpdateConflictError) {
      return response(
        {
          ok: false,
          code: "SETTINGS_CONFLICT",
          error:
            "Cài đặt đã được thay đổi ở một phiên khác. Hãy tải lại trước khi lưu.",
        },
        409,
      );
    }
    if (error instanceof z.ZodError) {
      return response(
        {
          ok: false,
          code: "INVALID_METRIC_PRESET",
          error: "Dữ liệu metric preset hoặc phiên bản cài đặt không hợp lệ.",
        },
        400,
      );
    }
    return routeErrorResponse(error);
  }
}
