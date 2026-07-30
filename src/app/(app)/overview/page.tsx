import {
  CreativeDrawerContent,
  groupCreativeFamiliesForView,
} from "@/components/creative-performance-v2";
import { OverviewV2 } from "@/components/overview-v2";
import { EntityDrawer } from "@/components/ui/entity-drawer";
import {
  getApplicationSnapshot,
  getCreativeRowsForReport,
  getOverviewTrendForReport,
} from "@/lib/app-data";
import { addReportDays, resolveReportContext } from "@/lib/reporting";
import { formatFreshnessLabel } from "@/lib/presentation/formatters";

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
  const context = resolveReportContext({
    query: {
      from: first(query.from),
      to: first(query.to),
      account: first(query.account),
      currency: first(query.currency),
      compare: first(query.compare),
    },
    timeZone: snapshot.settings.timezone,
    lookbackDays: snapshot.settings.lookbackDays,
    reportingCurrency: snapshot.settings.currency,
    compareDefault: snapshot.settings.compareDefault,
  });
  const reportFilters = {
    snapshot,
    dateFrom: context.dateFrom,
    dateTo: context.dateTo,
    accountMetaId: context.account || undefined,
    campaignMetaId: first(query.campaign),
    currency: context.currency || null,
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
  const [report, trend, previousReport] = await Promise.all([
    getCreativeRowsForReport(reportFilters),
    getOverviewTrendForReport(reportFilters),
    context.compare === "previous_period"
      ? getCreativeRowsForReport({
          ...reportFilters,
          dateFrom: previousDateFrom,
          dateTo: previousDateTo,
        })
      : Promise.resolve({ creatives: [], truncated: false }),
  ]);
  const families = groupCreativeFamiliesForView(report.creatives);
  const selectedId = first(query.selected);
  const selected = selectedId
    ? families.find((family) => family.id === selectedId)
    : undefined;
  const connected =
    snapshot.demoMode ||
    (snapshot.authenticated &&
      snapshot.connection?.status === "connected");

  return (
    <OverviewV2
      dashboard={snapshot.dashboard}
      creatives={report.creatives}
      previousCreatives={previousReport.creatives}
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
      compare={context.compare}
      accounts={snapshot.assets
        .filter((asset) => asset.kind === "Ad Account")
        .map((asset) => ({ id: asset.id, name: asset.name }))}
      freshness={formatFreshnessLabel(
        snapshot.freshness,
        snapshot.settings.timezone,
      )}
      selectedDrawer={
        selected ? (
          <EntityDrawer
            title={`Chi tiết ${selected.name}`}
            closeHref={withoutDrawer(query)}
            restoreFocusId={selected.id}
            width="wide"
          >
            <CreativeDrawerContent family={selected} query={query} />
          </EntityDrawer>
        ) : null
      }
    />
  );
}
