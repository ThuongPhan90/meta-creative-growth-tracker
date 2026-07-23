import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createTrackerRepository } from "@/lib/db";
import {
  assertLiveMode,
  assertOwnerSessionBinding,
  assertSameOrigin,
  requireOwnerSession,
  routeErrorResponse,
} from "@/lib/server";

export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  timezone: z.enum(["Asia/Ho_Chi_Minh", "UTC", "Asia/Singapore"]),
  lookbackDays: z.union([
    z.literal(7),
    z.literal(14),
    z.literal(30),
    z.literal(90),
  ]),
  minimumInstallThreshold: z.number().int().min(1).max(10_000),
  installActionTypes: z
    .array(z.string().regex(/^[a-z0-9._]+$/).max(128))
    .min(1)
    .max(25),
  registrationActionTypes: z
    .array(z.string().regex(/^[a-z0-9._]+$/).max(128))
    .min(1)
    .max(25),
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    assertLiveMode();
    const session = requireOwnerSession(request);
    const input = settingsSchema.parse(await request.json());
    const repository = await createTrackerRepository();
    const connection = await repository.getConnection();
    assertOwnerSessionBinding(session, connection?.connectionId);
    const settings = await repository.updateSettings({
      reportingTimezone: input.timezone,
      syncLookbackDays: input.lookbackDays,
      minimumInstallThreshold: input.minimumInstallThreshold,
      installActionTypes: [...new Set(input.installActionTypes)],
      registrationActionTypes: [
        ...new Set(input.registrationActionTypes),
      ],
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
      return NextResponse.json(
        {
          ok: false,
          error: "Timezone hoặc khoảng dữ liệu không hợp lệ.",
          code: "INVALID_SETTINGS",
        },
        { status: 400 },
      );
    }
    return routeErrorResponse(error);
  }
}
