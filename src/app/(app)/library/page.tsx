import { CreativeLibraryV2 } from "@/components/creative-library-v2";
import {
  buildApplicationResultMetrics,
  getApplicationSnapshot,
  getCanonicalResultsForReport,
  getCreativeRowsForReport,
  resolveApplicationReportContext,
} from "@/lib/app-data";
import { formatFreshnessFields } from "@/lib/presentation/freshness-presentation";
import { buildReportingBarModel } from "@/lib/presentation/reporting-bar";

export const dynamic = "force-dynamic";

export default async function LibraryPage({
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

  return (
    <CreativeLibraryV2
      creatives={report.creatives}
      truncated={report.truncated}
      connected={
        snapshot.demoMode ||
        (snapshot.authenticated &&
          snapshot.connection?.status === "connected")
      }
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
}
