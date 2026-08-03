import { CreativePerformanceV2 } from "@/components/creative-performance-v2";
import { V3SurfacePage } from "@/components/ui-v3/surface-page";
import {
  buildApplicationResultMetrics,
  getApplicationSnapshot,
  getCanonicalResultsForReport,
  getCreativeRowsForReport,
  resolveApplicationReportContext,
} from "@/lib/app-data";
import { formatFreshnessFields } from "@/lib/presentation/freshness-presentation";
import { buildReportingBarModel } from "@/lib/presentation/reporting-bar";
import { isUiV3 } from "@/lib/presentation/ui-version";

export const dynamic = "force-dynamic";

export default async function CreativesPage({
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
  const accounts = snapshot.assets
    .filter((asset) => asset.kind === "Ad Account")
    .map((asset) => ({ id: asset.id, name: asset.name }));
  const connected =
    snapshot.demoMode ||
    (snapshot.authenticated &&
      snapshot.connection?.status === "connected");
  const [report, canonicalResults] = await Promise.all([
    getCreativeRowsForReport({
      snapshot,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      accountMetaIds: context.adAccountIds,
      campaignMetaId: Array.isArray(query.campaign)
        ? query.campaign[0]
        : query.campaign,
      currency: context.currency || null,
      attributionWindow: context.attributionSettingKey,
      actionReportTime: context.actionReportTime,
      syncVersion: context.syncVersion,
      reportContext: context,
    }),
    getCanonicalResultsForReport({ snapshot, context }),
  ]);

  const content = (
    <CreativePerformanceV2
      creatives={report.creatives}
      delivery={report.delivery}
      connected={connected}
      query={query}
      dateFrom={context.dateFrom}
      dateTo={context.dateTo}
      account={context.account}
      accounts={accounts}
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
      resultMetrics={buildApplicationResultMetrics({
        context,
        delivery: report.delivery,
        definitions: canonicalResults.definitions,
        periodReach: canonicalResults.periodReach,
        ...(canonicalResults.state === "demo_legacy_bridge"
          ? {}
          : { canonicalResults: canonicalResults.values }),
      })}
    />
  );

  return isUiV3() ? (
    <V3SurfacePage surface="creatives">{content}</V3SurfacePage>
  ) : (
    content
  );
}
