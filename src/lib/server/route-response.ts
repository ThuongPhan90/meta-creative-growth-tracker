import "server-only";

import { NextResponse } from "next/server";
import {
  RequestSecurityError,
  safeSecurityMessage,
} from "./request-security";

export function routeErrorResponse(error: unknown) {
  if (error instanceof RequestSecurityError) {
    return NextResponse.json(
      { ok: false, error: safeSecurityMessage(error), code: error.code },
      { status: error.status },
    );
  }

  console.error("[route-error]", error);
  return NextResponse.json(
    {
      ok: false,
      error: "Yêu cầu chưa hoàn tất. Kiểm tra cấu hình và thử lại.",
      code: "INTERNAL_ERROR",
    },
    { status: 500 },
  );
}
