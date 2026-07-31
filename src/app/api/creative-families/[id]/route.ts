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
import { resolveReportingRequest } from "@/lib/reporting";

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

    const latestSyncVersion =
      snapshot.freshness.syncVersion ??
      snapshot.syncRuns.find((run) =>
        ["success", "partial"].includes(run.status),
      )?.id ??
      "never";
    const scope = snapshot.reportingScope;
    const scopedCurrencies = new Set(
      (scope?.available.adAccounts ?? [])
        .filter((account) =>
          scope?.selected.adAccountIds.includes(account.id),
        )
        .map((account) => account.currency.trim().toUpperCase())
        .filter((currency) => /^[A-Z]{3}$/.test(currency)),
    );
    const defaultScopeCurrency =
      scopedCurrencies.size === 1
        ? [...scopedCurrencies][0]
        : undefined;
    const reporting = resolveReportingRequest({
      searchParams: request.nextUrl.searchParams,
      timeZone: snapshot.settings.timezone,
      lookbackDays: snapshot.settings.lookbackDays,
      reportingCurrency:
        scopedCurrencies.size > 1
          ? null
          : defaultScopeCurrency ?? snapshot.settings.currency,
      compareDefault: snapshot.settings.compareDefault,
      defaults: {
        businessIds: scope?.selected.businessIds ?? [],
        adAccountIds: scope?.selected.adAccountIds ?? [],
        currencyMode:
          request.nextUrl.searchParams.has("currency") ||
          scopedCurrencies.size === 1
            ? "single"
            : "split",
        ...(defaultScopeCurrency
          ? { currency: defaultScopeCurrency }
          : {}),
        syncVersion: latestSyncVersion,
      },
    });
    const context = reporting.context;
    const rows = await getCreativeFamilyRowsForReport({
      snapshot,
      repository,
      creativeFamilyId: id,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      currency: context.currency || undefined,
      ...(context.adAccountIds.length
        ? { accountMetaIds: context.adAccountIds }
        : {}),
      campaignMetaId:
        request.nextUrl.searchParams.get("campaign")?.trim() ||
        undefined,
      attributionWindow: context.attributionSettingKey,
      actionReportTime: context.actionReportTime,
      syncVersion: context.syncVersion,
      reportContext: context,
    });
    const detail = creativeFamilyContract(
      id,
      rows ?? [],
      snapshot.freshness,
      context,
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
