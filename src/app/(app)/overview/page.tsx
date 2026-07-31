import {
  CreativeDrawerContent,
  groupCreativeFamiliesForView,
} from "@/components/creative-performance-v2";
import { OverviewV2 } from "@/components/overview-v2";
import { EntityDrawer } from "@/components/ui/entity-drawer";
import {
  getApplicationSnapshot,
  buildApplicationResultMetrics,
  getCanonicalResultsForReport,
  getCreativeRowsForReport,
  getDeliveryForReport,
  getOverviewTrendForReport,
  resolveApplicationReportContext,
} from "@/lib/app-data";
import { addReportDays } from "@/lib/reporting";
import { formatFreshnessFields } from "@/lib/presentation/freshness-presentation";
import { buildReportingBarModel } from "@/lib/presentation/reporting-bar";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function withoutDrawer(
  query: Record<string, string | string[] | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    const value = first(raw);
    if (value && key !== "selected" && key !== "tab") {
      params.set(key, value);
    }
  }
  return `/overview${params.size ? `?${params.toString()}` : ""}`;
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  const [snapshot, query] = await Promise.all([
    getApplicationSnapshot(),
    searchParams,
  ]);
  const context = resolveApplicationReportContext(snapshot, query);
  const reportFilters = {
    snapshot,
    dateFrom: context.dateFrom,
    dateTo: context.dateTo,
    accountMetaIds: context.adAccountIds,
    campaignMetaId: first(query.campaign),
    currency: context.currency || null,
    attributionWindow: context.attributionSettingKey,
    actionReportTime: context.actionReportTime,
    syncVersion: context.syncVersion,
    reportContext: context,
  };
  const periodDays =
    Math.round(
      (new Date(`${context.dateTo}T00:00:00.000Z`).getTime() -
        new Date(`${context.dateFrom}T00:00:00.000Z`).getTime()) /
        86_400_000,
    ) + 1;
  const previousDateTo = addReportDays(context.dateFrom, -1);
  const previousDateFrom = addReportDays(
    previousDateTo,
    -(periodDays - 1),
  );
  const [report, trend, previousDelivery, canonicalResults] =
    await Promise.all([
    getCreativeRowsForReport(reportFilters),
    getOverviewTrendForReport(reportFilters),
    context.compare === "previous_period"
      ? getDeliveryForReport({
          ...reportFilters,
          dateFrom: previousDateFrom,
          dateTo: previousDateTo,
        })
      : Promise.resolve([]),
    getCanonicalResultsForReport({ snapshot, context }),
  ]);
  const previousCanonicalResults =
    context.compare === "previous_period"
      ? await getCanonicalResultsForReport({
          snapshot,
          context: {
            ...context,
            dateFrom: previousDateFrom,
            dateTo: previousDateTo,
          },
        })
      : null;
  const families = groupCreativeFamiliesForView(report.creatives);
  const selectedId = first(query.selected);
  const selected = selectedId
    ? families.find((family) => family.id === selectedId)
    : undefined;
  const connected =
    snapshot.demoMode ||
    (snapshot.authenticated &&
      snapshot.connection?.status === "connected");
  const resultMetrics = buildApplicationResultMetrics({
    context,
    delivery: report.delivery,
    definitions: canonicalResults.definitions,
    periodReach: canonicalResults.periodReach,
    ...(canonicalResults.state === "demo_legacy_bridge"
      ? {}
      : { canonicalResults: canonicalResults.values }),
  });
  const previousResultMetrics = previousDelivery.length
    ? buildApplicationResultMetrics({
        context,
        delivery: previousDelivery,
        definitions:
          previousCanonicalResults?.definitions ??
          canonicalResults.definitions,
        periodReach:
          previousCanonicalResults?.periodReach ?? null,
        ...(previousCanonicalResults?.state ===
        "demo_legacy_bridge"
          ? {}
          : {
              canonicalResults:
                previousCanonicalResults?.values ?? [],
            }),
      })
    : undefined;

  return (
    <OverviewV2
      dashboard={snapshot.dashboard}
      creatives={report.creatives}
      delivery={report.delivery}
      trend={trend}
      connected={connected}
      query={query}
      dateFrom={context.dateFrom}
      dateTo={context.dateTo}
      account={context.account}
      reportingCurrency={context.currency}
      currencyOptions={[
        ...new Set(
          snapshot.assets.flatMap((asset) =>
            asset.kind === "Ad Account" && asset.currency
              ? [asset.currency]
              : [],
          ),
        ),
      ]}
      compare={context.compareMode}
      accounts={snapshot.assets
        .filter((asset) => asset.kind === "Ad Account")
        .map((asset) => ({ id: asset.id, name: asset.name }))}
      freshness={formatFreshnessFields(
        snapshot.freshness,
        snapshot.settings.timezone,
      )}
      reportingBar={buildReportingBarModel(
        snapshot.reportingScope,
        context,
        {
          persistScope:
            !snapshot.demoMode &&
            snapshot.authenticated &&
            Boolean(snapshot.connection),
        },
        canonicalResults.definitions,
      )}
      resultMetrics={resultMetrics}
      previousResultMetrics={previousResultMetrics}
      selectedDrawer={
        selected ? (
          <EntityDrawer
            title={`Chi tiết ${selected.name}`}
            closeHref={withoutDrawer(query)}
            restoreFocusId={selected.id}
            width="wide"
          >
            <CreativeDrawerContent
              family={selected}
              query={query}
              resultMetrics={resultMetrics}
              originPathname="/overview"
            />
          </EntityDrawer>
        ) : null
      }
    />
  );
}
