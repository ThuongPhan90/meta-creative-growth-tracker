import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  detailErrorResponse,
  requireOwnerDetailContext,
} from "@/lib/detail-api";
import {
  buildCanonicalReportingScope,
  readReportingScopeOverride,
  validateReportingScopeSelection,
} from "@/lib/reporting";
import { assertLiveMode, assertSameOrigin } from "@/lib/server";

export const dynamic = "force-dynamic";

const scopeMemberSchema = z
  .string()
  .trim()
  .min(1)
  .max(160);

const reportingScopeSchema = z
  .object({
    businessIds: z.array(scopeMemberSchema).max(250),
    adAccountIds: z.array(scopeMemberSchema).max(250),
  })
  .strict();

function response(value: unknown, status = 200) {
  const result = NextResponse.json(value, { status });
  result.headers.set("Cache-Control", "private, no-store");
  result.headers.set("Vary", "Cookie");
  return result;
}

export async function GET(request: NextRequest) {
  try {
    const { repository, connection } =
      await requireOwnerDetailContext(request);
    const [inventory, persisted] = await Promise.all([
      repository.listReportingScopeInventory(connection.connectionId),
      repository.getReportingScope(connection.connectionId),
    ]);
    const scope = buildCanonicalReportingScope({
      inventory,
      persisted,
      override: readReportingScopeOverride(
        request.nextUrl.searchParams,
      ),
    });

    return response({ ok: true, scope });
  } catch (error) {
    return detailErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    assertLiveMode();
    const input = reportingScopeSchema.parse(await request.json());
    const { repository, connection } =
      await requireOwnerDetailContext(request);
    const inventory = await repository.listReportingScopeInventory(
      connection.connectionId,
    );
    const validation = validateReportingScopeSelection({
      inventory,
      businessIds: input.businessIds,
      adAccountIds: input.adAccountIds,
    });
    if (!validation.ok) {
      return response(
        {
          ok: false,
          code: "INVALID_REPORTING_SCOPE",
          error:
            "Phạm vi chứa Business hoặc Ad Account không còn khả dụng cho kết nối hiện tại.",
          invalidBusinessIds: validation.invalidBusinessIds,
          invalidAdAccountIds: validation.invalidAdAccountIds,
        },
        400,
      );
    }

    const persisted = await repository.saveReportingScope({
      connectionId: connection.connectionId,
      businessIds: validation.businessIds,
      adAccountIds: validation.adAccountIds,
    });
    const scope = buildCanonicalReportingScope({
      inventory,
      persisted,
    });

    return response({
      ok: true,
      message: "Đã lưu phạm vi báo cáo.",
      scope,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return response(
        {
          ok: false,
          code: "INVALID_REPORTING_SCOPE",
          error:
            "Phạm vi báo cáo phải là danh sách Business và Ad Account hợp lệ.",
        },
        400,
      );
    }
    return detailErrorResponse(error);
  }
}
