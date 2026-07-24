import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createTrackerRepository } from "@/lib/db";
import { validateActionTypeMapping } from "@/lib/reporting/action-type-mapping";
import {
  assertLiveMode,
  assertOwnerSessionBinding,
  assertSameOrigin,
  requireOwnerSession,
  routeErrorResponse,
} from "@/lib/server";

export const dynamic = "force-dynamic";

const rawActionTypesSchema = z
  .array(z.string().max(256))
  .max(100);

const settingsSchema = z.object({
  timezone: z.enum(["Asia/Ho_Chi_Minh", "UTC", "Asia/Singapore"]),
  lookbackDays: z.union([
    z.literal(7),
    z.literal(14),
    z.literal(30),
    z.literal(90),
  ]),
  minimumInstallThreshold: z.number().int().min(1).max(10_000),
  installActionTypes: rawActionTypesSchema,
  registrationActionTypes: rawActionTypesSchema,
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    assertLiveMode();
    const session = requireOwnerSession(request);
    const input = settingsSchema.parse(await request.json());
    const actionTypeMapping = validateActionTypeMapping({
      installActionTypes: input.installActionTypes,
      registrationActionTypes: input.registrationActionTypes,
    });

    if (!actionTypeMapping.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: actionTypeMapping.error,
          code: actionTypeMapping.code,
        },
        { status: 400 },
      );
    }

    const repository = await createTrackerRepository();
    const connection = await repository.getConnection();
    assertOwnerSessionBinding(session, connection?.connectionId);
    const settings = await repository.updateSettings({
      reportingTimezone: input.timezone,
      syncLookbackDays: input.lookbackDays,
      minimumInstallThreshold: input.minimumInstallThreshold,
      installActionTypes: actionTypeMapping.installActionTypes,
      registrationActionTypes:
        actionTypeMapping.registrationActionTypes,
    });

    return NextResponse.json({
      ok: true,
      message: "Đã lưu cài đặt hiển thị.",
      settings: {
        timezone: settings.reportingTimezone,
        lookbackDays: settings.syncLookbackDays,
        minimumInstallThreshold: settings.minimumInstallThreshold,
        installActionTypes: settings.installActionTypes,
        registrationActionTypes: settings.registrationActionTypes,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const hasActionTypeIssue = error.issues.some((issue) =>
        ["installActionTypes", "registrationActionTypes"].includes(
          String(issue.path[0]),
        ),
      );
      return NextResponse.json(
        {
          ok: false,
          error: hasActionTypeIssue
            ? "Danh sách action type không hợp lệ. Mỗi nhóm phải là danh sách các giá trị văn bản."
            : "Timezone, khoảng dữ liệu hoặc ngưỡng install không hợp lệ.",
          code: hasActionTypeIssue
            ? "INVALID_ACTION_TYPES"
            : "INVALID_SETTINGS",
        },
        { status: 400 },
      );
    }
    return routeErrorResponse(error);
  }
}
