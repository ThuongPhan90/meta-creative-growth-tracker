import { NextRequest, NextResponse } from "next/server";

import {
  detailErrorResponse,
  requireOwnerDetailSnapshot,
} from "@/lib/detail-api";
import {
  createBackendFallbackWarning,
  createReportingResponse,
  reportingSyncStatus,
  resolveReportingRequest,
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
      scopedCurrencies.size === 1 ? [...scopedCurrencies][0] : undefined;
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
    const { context } = reporting;
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
    const businesses = snapshot.assets.filter(
      (asset) => asset.kind === "Business" && asset.isCurrent !== false,
    );
    const adAccounts = snapshot.assets.filter(
      (asset) =>
        asset.kind === "Ad Account" && asset.isCurrent !== false,
    );
    const selectedAccountCount = context.adAccountIds.filter((id) =>
      adAccounts.some((asset) => asset.id === id),
    ).length;
    const selectedBusinessCount = context.businessIds.filter((id) =>
      businesses.some((asset) => asset.id === id),
    ).length;
    return response(
      createReportingResponse(
        {
          availableScope: {
            businesses: businesses.map((asset) => ({
              id: asset.id,
              name: asset.name,
            })),
            adAccounts: adAccounts.map((asset) => ({
              id: asset.id,
              name: asset.name,
              businessName: asset.parentName,
              currency: asset.currency ?? null,
              timezone: asset.timezone ?? null,
            })),
            selectionMode:
              request.nextUrl.searchParams.has("business_ids") ||
              request.nextUrl.searchParams.has("account_ids")
                ? "explicit"
                : scope?.confirmedAt
                  ? "persisted"
                  : "all_accessible",
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
            businesses: {
              covered: selectedBusinessCount,
              total: context.businessIds.length,
              ratio:
                context.businessIds.length > 0
                  ? selectedBusinessCount /
                    context.businessIds.length
                  : 0,
              basis: "accessible_businesses_in_effective_scope",
            },
            adAccounts: {
              covered: selectedAccountCount,
              total: context.adAccountIds.length,
              ratio:
                context.adAccountIds.length > 0
                  ? selectedAccountCount /
                    context.adAccountIds.length
                  : 0,
              basis: "accessible_ad_accounts_in_effective_scope",
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
