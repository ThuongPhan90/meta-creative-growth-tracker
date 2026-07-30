import { NextRequest } from "next/server";

import { getCreativeFamilyRowsForReport } from "@/lib/app-data";
import {
  canonicalDetailId,
  creativeFamilyContract,
  DetailApiError,
  detailErrorResponse,
  detailSuccess,
  requireOwnerDetailSnapshot,
} from "@/lib/detail-api";
import { resolveReportContext } from "@/lib/reporting";

export const dynamic = "force-dynamic";

function validDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = canonicalDetailId(
      "creative-family",
      (await params).id,
    );
    if (!id) {
      throw new DetailApiError(
        400,
        "INVALID_CREATIVE_FAMILY_ID",
        "Creative Family ID không hợp lệ.",
      );
    }

    const { repository, snapshot } =
      await requireOwnerDetailSnapshot(request);
    const rawFrom = request.nextUrl.searchParams.get("from");
    const rawTo = request.nextUrl.searchParams.get("to");
    const from = validDate(rawFrom);
    const to = validDate(rawTo);
    if (
      (rawFrom !== null || rawTo !== null) &&
      (!from || !to || from > to)
    ) {
      throw new DetailApiError(
        400,
        "INVALID_DATE_RANGE",
        "Khoảng ngày phải có đủ from/to theo định dạng YYYY-MM-DD.",
      );
    }

    const context = resolveReportContext({
      query: {
        from: from ?? undefined,
        to: to ?? undefined,
        account:
          request.nextUrl.searchParams.get("account") ?? undefined,
      },
      timeZone: snapshot.settings.timezone,
      lookbackDays: snapshot.settings.lookbackDays,
    });
    const rows = await getCreativeFamilyRowsForReport({
      snapshot,
      repository,
      creativeFamilyId: id,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      currency:
        request.nextUrl.searchParams.get("currency")?.trim() ||
        undefined,
      accountMetaId: context.account || undefined,
      campaignMetaId:
        request.nextUrl.searchParams.get("campaign")?.trim() ||
        undefined,
    });
    const detail = creativeFamilyContract(
      id,
      rows ?? [],
      snapshot.freshness,
    );
    if (!detail) {
      throw new DetailApiError(
        404,
        "CREATIVE_FAMILY_NOT_FOUND",
        "Không tìm thấy Creative Family trong dữ liệu của owner hiện tại.",
      );
    }

    return detailSuccess({
      ...detail,
      result_truncated: false,
    });
  } catch (error) {
    return detailErrorResponse(error);
  }
}
