import type { ApplicationSnapshot } from "@/lib/app-data";

import {
  createBackendFallbackWarning,
  type ReportingWarning,
} from "./reporting-response";
import {
  resolveReportingRequest,
} from "./reporting-request";

type SearchParamsLike = Pick<
  URLSearchParams,
  "get" | "getAll" | "has"
>;

/**
 * Resolves an API request against the same persisted owner scope and pinned
 * sync version used by the reporting pages.
 */
export function resolveSnapshotReportingRequest({
  searchParams,
  snapshot,
}: {
  searchParams: SearchParamsLike;
  snapshot: ApplicationSnapshot;
}) {
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
    searchParams,
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
        searchParams.has("currency") || scopedCurrencies.size === 1
          ? "single"
          : "split",
      ...(defaultScopeCurrency
        ? { currency: defaultScopeCurrency }
        : {}),
      syncVersion: latestSyncVersion,
    },
  });
  const warnings: ReportingWarning[] = [...reporting.warnings];

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
            field: "businessIds",
            requested: scope.unavailableSelected.businessIds,
            applied: reporting.context.businessIds,
            reason: "saved_scope_no_longer_accessible",
          },
          {
            field: "adAccountIds",
            requested: scope.unavailableSelected.adAccountIds,
            applied: reporting.context.adAccountIds,
            reason: "saved_scope_no_longer_accessible",
          },
        ],
      }),
    );
  }

  return {
    ...reporting,
    warnings,
  };
}
