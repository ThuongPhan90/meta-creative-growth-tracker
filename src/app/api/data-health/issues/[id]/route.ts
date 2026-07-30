import { NextRequest } from "next/server";

import {
  canonicalDetailId,
  dataHealthIssueContract,
  DetailApiError,
  detailErrorResponse,
  detailSuccess,
  requireOwnerDetailSnapshot,
} from "@/lib/detail-api";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = canonicalDetailId(
      "data-health-issue",
      (await params).id,
    );
    if (!id) {
      throw new DetailApiError(
        400,
        "INVALID_DATA_HEALTH_ISSUE_ID",
        "Data Health issue ID không hợp lệ.",
      );
    }

    const { snapshot } = await requireOwnerDetailSnapshot(request);
    const detail = dataHealthIssueContract(
      id,
      snapshot.syncRuns,
      snapshot.freshness,
    );
    if (!detail) {
      throw new DetailApiError(
        404,
        "DATA_HEALTH_ISSUE_NOT_FOUND",
        "Không tìm thấy nhóm cảnh báo trong lịch sử đồng bộ hiện tại.",
      );
    }

    return detailSuccess(detail);
  } catch (error) {
    return detailErrorResponse(error);
  }
}
