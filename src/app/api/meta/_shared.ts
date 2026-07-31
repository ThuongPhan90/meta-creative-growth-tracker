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
  type ReportingContext,
  type ReportingWarning,
} from "@/lib/reporting";
import type {
  MetaAssetKind,
  MetaAssetRow,
} from "@/types/view-models";

export type MetaCollection =
  | "businesses"
  | "adAccounts"
  | "pages";

const ASSET_KIND: Record<MetaCollection, MetaAssetKind> = {
  businesses: "Business",
  adAccounts: "Ad Account",
  pages: "Page",
};

function secureJson(value: unknown) {
  const result = NextResponse.json(value);
  result.headers.set("Cache-Control", "private, no-store");
  result.headers.set("Vary", "Cookie");
  return result;
}

function effectiveContext({
  context,
  availableBusinessIds,
  availableAccountIds,
  warnings,
}: {
  context: ReportingContext;
  availableBusinessIds: ReadonlySet<string>;
  availableAccountIds: ReadonlySet<string>;
  warnings: ReportingWarning[];
}) {
  const businessIds = context.businessIds.filter((id) =>
    availableBusinessIds.has(id),
  );
  const adAccountIds = context.adAccountIds.filter((id) =>
    availableAccountIds.has(id),
  );
  const unavailableBusinessIds = context.businessIds.filter(
    (id) => !availableBusinessIds.has(id),
  );
  const unavailableAccountIds = context.adAccountIds.filter(
    (id) => !availableAccountIds.has(id),
  );
  if (
    unavailableBusinessIds.length ||
    unavailableAccountIds.length
  ) {
    warnings.push(
      createBackendFallbackWarning({
        message:
          "Một phần scope yêu cầu không thuộc tài sản Meta khả dụng của owner và đã bị loại khỏi response.",
        fallbacks: [
          {
            field: "businessIds",
            requested: context.businessIds,
            applied: businessIds,
            reason: "owner_asset_scope_enforced",
          },
          {
            field: "adAccountIds",
            requested: context.adAccountIds,
            applied: adAccountIds,
            reason: "owner_asset_scope_enforced",
          },
        ],
      }),
    );
  }
  return {
    ...context,
    businessIds,
    adAccountIds,
  };
}

function businessContract(
  asset: MetaAssetRow,
  context: ReportingContext,
  businessAdAccountIds: ReadonlyMap<string, readonly string[]>,
) {
  return {
    businessId: asset.id,
    name: asset.name,
    verificationStatus: asset.verificationStatus ?? null,
    status: asset.status,
    isCurrent: asset.isCurrent !== false,
    lastSeenAt: asset.lastSeenAt ?? null,
    adAccountIds: [
      ...(businessAdAccountIds.get(asset.id) ?? []),
    ],
    selectedForReporting: context.businessIds.includes(asset.id),
  };
}

function adAccountContract(
  asset: MetaAssetRow,
  context: ReportingContext,
  accountBusinessIds: ReadonlyMap<string, readonly string[]>,
) {
  return {
    adAccountId: asset.id,
    name: asset.name,
    businessIds: [
      ...(accountBusinessIds.get(asset.id) ?? []),
    ],
    businessName: asset.parentName,
    status: asset.status,
    isCurrent: asset.isCurrent !== false,
    currency: asset.currency ?? null,
    timezone: asset.timezone ?? null,
    lastSeenAt: asset.lastSeenAt ?? null,
    selectedForReporting: context.adAccountIds.includes(asset.id),
  };
}

function pageContract(asset: MetaAssetRow) {
  return {
    pageId: asset.id,
    name: asset.name,
    category: asset.category ?? null,
    discoveryStatus: "discovered",
    activityStatus: "not_provided_by_meta",
    isCurrent: asset.isCurrent !== false,
    lastSeenAt: asset.lastSeenAt ?? null,
  };
}

function matchesText(asset: MetaAssetRow, query: string) {
  if (!query) return true;
  const haystack = [
    asset.id,
    asset.name,
    asset.parentName,
    asset.category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("vi");
  return haystack.includes(query);
}

export async function metaCollectionResponse(
  request: NextRequest,
  collection: MetaCollection,
) {
  try {
    const { snapshot } =
      await requireOwnerDetailSnapshot(request);
    const scope = snapshot.reportingScope;
    const latestSyncVersion =
      snapshot.freshness.syncVersion ??
      snapshot.syncRuns.find((run) =>
        ["success", "partial"].includes(run.status),
      )?.id ??
      "never";
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
    const warnings: ReportingWarning[] = [...reporting.warnings];
    const availableBusinessIds = new Set(
      (scope?.available.businesses ?? [])
        .map((business) => business.id),
    );
    const availableAccountIds = new Set(
      (scope?.available.adAccounts ?? [])
        .map((account) => account.id),
    );
    if (availableBusinessIds.size === 0) {
      for (const asset of snapshot.assets) {
        if (
          asset.kind === "Business" &&
          asset.isCurrent !== false
        ) {
          availableBusinessIds.add(asset.id);
        }
      }
    }
    if (availableAccountIds.size === 0) {
      for (const asset of snapshot.assets) {
        if (
          asset.kind === "Ad Account" &&
          asset.isCurrent !== false
        ) {
          availableAccountIds.add(asset.id);
        }
      }
    }
    const context = effectiveContext({
      context: reporting.context,
      availableBusinessIds,
      availableAccountIds,
      warnings,
    });
    if (
      scope &&
      (scope.unavailableSelected.businessIds.length ||
        scope.unavailableSelected.adAccountIds.length)
    ) {
      warnings.push(
        createBackendFallbackWarning({
          message:
            "Một phần persisted reporting scope không còn khả dụng và đã bị loại khỏi response.",
          fallbacks: [
            {
              field: "businessIds",
              requested:
                scope.unavailableSelected.businessIds,
              applied: context.businessIds,
              reason: "saved_scope_no_longer_accessible",
            },
            {
              field: "adAccountIds",
              requested:
                scope.unavailableSelected.adAccountIds,
              applied: context.adAccountIds,
              reason: "saved_scope_no_longer_accessible",
            },
          ],
        }),
      );
    }

    const accountBusinessIds = new Map(
      (scope?.available.adAccounts ?? []).map((account) => [
        account.id,
        account.businessIds,
      ]),
    );
    const businessAdAccountIds = new Map(
      (scope?.available.businesses ?? []).map((business) => [
        business.id,
        business.adAccountIds,
      ]),
    );
    const includeInactive =
      request.nextUrl.searchParams.get("include_inactive") ===
        "1" ||
      request.nextUrl.searchParams.get("includeInactive") ===
        "1";
    const selectedOnly =
      request.nextUrl.searchParams.get("selected_only") === "1";
    const query =
      request.nextUrl.searchParams
        .get("q")
        ?.trim()
        .slice(0, 200)
        .toLocaleLowerCase("vi") ?? "";
    const status =
      request.nextUrl.searchParams
        .get("status")
        ?.trim()
        .slice(0, 64)
        .toUpperCase() ?? "";
    const category =
      request.nextUrl.searchParams
        .get("category")
        ?.trim()
        .slice(0, 160)
        .toLocaleLowerCase("vi") ?? "";
    const hasExplicitBusinessFilter =
      request.nextUrl.searchParams.has("business_ids");
    const hasExplicitAccountFilter =
      request.nextUrl.searchParams.has("account_ids") ||
      request.nextUrl.searchParams.has("account");
    const hasExplicitCurrencyFilter =
      request.nextUrl.searchParams.has("currency");
    const kind = ASSET_KIND[collection];
    const accessible = snapshot.assets.filter(
      (asset) =>
        asset.kind === kind &&
        (includeInactive || asset.isCurrent !== false),
    );
    const filtered = accessible.filter((asset) => {
      if (!matchesText(asset, query)) return false;
      if (
        status &&
        asset.status.trim().toUpperCase() !== status
      ) {
        return false;
      }
      if (
        collection === "businesses" &&
        (selectedOnly || hasExplicitBusinessFilter) &&
        !context.businessIds.includes(asset.id)
      ) {
        return false;
      }
      if (collection === "adAccounts") {
        if (
          (selectedOnly || hasExplicitAccountFilter) &&
          !context.adAccountIds.includes(asset.id)
        ) {
          return false;
        }
        if (
          hasExplicitBusinessFilter &&
          !(
            accountBusinessIds.get(asset.id) ?? []
          ).some((id) => context.businessIds.includes(id))
        ) {
          return false;
        }
        if (
          hasExplicitCurrencyFilter &&
          context.currency &&
          asset.currency?.trim().toUpperCase() !==
            context.currency
        ) {
          return false;
        }
      }
      if (
        collection === "pages" &&
        category &&
        asset.category?.trim().toLocaleLowerCase("vi") !==
          category
      ) {
        return false;
      }
      return true;
    });
    const selectedCount =
      collection === "businesses"
        ? accessible.filter((asset) =>
            context.businessIds.includes(asset.id),
          ).length
        : collection === "adAccounts"
          ? accessible.filter((asset) =>
              context.adAccountIds.includes(asset.id),
            ).length
          : 0;
    const data =
      collection === "businesses"
        ? {
            businesses: filtered.map((asset) =>
              businessContract(
                asset,
                context,
                businessAdAccountIds,
              ),
            ),
          }
        : collection === "adAccounts"
          ? {
              adAccounts: filtered.map((asset) =>
                adAccountContract(
                  asset,
                  context,
                  accountBusinessIds,
                ),
              ),
            }
          : {
              pages: filtered.map(pageContract),
            };

    return secureJson(
      createReportingResponse(
        {
          ...data,
          filters: {
            q: query || null,
            status: status || null,
            category:
              collection === "pages"
                ? category || null
                : null,
            includeInactive,
            selectedOnly,
          },
          inventory: {
            returned: filtered.length,
            accessible: accessible.length,
          },
        },
        {
          context,
          dataThrough:
            snapshot.freshness.dataThroughAt?.slice(0, 10) ??
            null,
          lastSuccessfulSyncAt:
            snapshot.freshness.lastSyncedAt,
          syncStatus: reportingSyncStatus({
            lastSuccessfulSyncAt:
              snapshot.freshness.lastSyncedAt,
            syncStatus: snapshot.freshness.syncStatus,
          }),
          coverage: {
            assets: {
              covered: filtered.length,
              total: accessible.length,
              ratio: accessible.length
                ? filtered.length / accessible.length
                : 0,
              basis: "current_owner_access_after_filters",
            },
            reportingScope: {
              covered: selectedCount,
              total:
                collection === "pages"
                  ? 0
                  : collection === "businesses"
                    ? context.businessIds.length
                    : context.adAccountIds.length,
              ratio:
                collection === "pages"
                  ? null
                  : (
                        collection === "businesses"
                          ? context.businessIds.length
                          : context.adAccountIds.length
                      ) > 0
                    ? selectedCount /
                      (collection === "businesses"
                        ? context.businessIds.length
                        : context.adAccountIds.length)
                    : 0,
              basis:
                collection === "pages"
                  ? "pages_not_part_of_reporting_scope"
                  : "effective_persisted_or_explicit_scope",
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
