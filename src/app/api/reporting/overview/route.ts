import { NextRequest, NextResponse } from "next/server";

import {
  buildApplicationResultMetrics,
  getCanonicalResultsForReport,
  getDeliveryForReport,
  getLiveDeliveryForReport,
} from "@/lib/app-data";
import {
  detailErrorResponse,
  requireOwnerDetailSnapshot,
} from "@/lib/detail-api";
import {
  createBackendFallbackWarning,
  createReportingResponse,
  reportingSyncStatus,
  resolveReportingRequest,
  summarizeDelivery,
} from "@/lib/reporting";

export const dynamic = "force-dynamic";

function response(value: unknown) {
  const result = NextResponse.json(value);
  result.headers.set("Cache-Control", "private, no-store");
  result.headers.set("Vary", "Cookie");
  return result;
}

export async function GET(request: NextRequest) {
  try {
    const { snapshot } = await requireOwnerDetailSnapshot(request);
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
    const context = { ...reporting.context };
    const warnings = [...reporting.warnings];
    if (
      scope &&
      (scope.unavailableSelected.businessIds.length ||
        scope.unavailableSelected.adAccountIds.length)
    ) {
      warnings.push(
        createBackendFallbackWarning({
          message:
            "Một phần phạm vi đã lưu không còn khả dụng và đã bị loại khỏi báo cáo.",
          fallbacks: [
            {
              field: "adAccountIds",
              requested: scope.unavailableSelected.adAccountIds,
              applied: context.adAccountIds,
              reason: "saved_scope_no_longer_accessible",
            },
          ],
        }),
      );
    }

    const [delivery, canonicalResults, liveDelivery] = await Promise.all([
      getDeliveryForReport({
        snapshot,
        dateFrom: context.dateFrom,
        dateTo: context.dateTo,
        accountMetaIds: context.adAccountIds,
        currency: context.currency ?? null,
        attributionWindow: context.attributionSettingKey,
        actionReportTime: context.actionReportTime,
        syncVersion: context.syncVersion,
        reportContext: context,
      }),
      getCanonicalResultsForReport({ snapshot, context }),
      getLiveDeliveryForReport({ snapshot, context }),
    ]);
    if (canonicalResults.warning) {
      warnings.push(
        createBackendFallbackWarning({
          message: canonicalResults.warning,
          fallbacks: [
            {
              field: "syncVersion",
              requested: context.syncVersion,
              applied: context.syncVersion,
              reason: "normalized_result_snapshot_unavailable",
            },
          ],
        }),
      );
    }
    const resultMetrics = buildApplicationResultMetrics({
      context,
      delivery,
      definitions: canonicalResults.definitions,
      periodReach: canonicalResults.periodReach,
      ...(canonicalResults.state === "demo_legacy_bridge"
        ? {}
        : { canonicalResults: canonicalResults.values }),
    });
    const summary = summarizeDelivery(delivery);

    return response(
      createReportingResponse(
        {
          delivery: summary,
          liveDelivery,
          resultMetrics,
          metricSemantics: {
            spend: "canonical_ad_delivery",
            results:
              canonicalResults.state === "demo_legacy_bridge"
                ? "demo_legacy_bridge"
                : "normalized_meta_attributed_result_facts",
            reach:
              canonicalResults.periodReach === null
                ? `unavailable:${canonicalResults.periodReachUnavailableReason ?? "exact_snapshot_unavailable"}`
                : "meta_reported_period_reach",
          },
        },
        {
          context,
          dataThrough:
            snapshot.freshness.dataThroughAt?.slice(0, 10) ?? null,
          lastSuccessfulSyncAt: snapshot.freshness.lastSyncedAt,
          syncStatus: reportingSyncStatus({
            lastSuccessfulSyncAt: snapshot.freshness.lastSyncedAt,
            syncStatus: snapshot.freshness.syncStatus,
          }),
          coverage: {
            adAccounts: {
              covered: context.adAccountIds.length,
              total: context.adAccountIds.length,
              ratio: context.adAccountIds.length ? 1 : 0,
              basis: "effective_ad_account_scope",
            },
          },
          warnings,
        },
      ),
    );
  } catch (error) {
    return detailErrorResponse(error);
  }
}
