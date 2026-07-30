import { CreativeLibraryV2 } from "@/components/creative-library-v2";
import {
  getApplicationSnapshot,
  getCreativeRowsForReport,
} from "@/lib/app-data";
import { resolveReportContext } from "@/lib/reporting";
import { formatFreshnessLabel } from "@/lib/presentation/formatters";

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
  const context = resolveReportContext({
    query: {
      from: Array.isArray(query.from) ? query.from[0] : query.from,
      to: Array.isArray(query.to) ? query.to[0] : query.to,
      account: Array.isArray(query.account)
        ? query.account[0]
        : query.account,
      currency: Array.isArray(query.currency)
        ? query.currency[0]
        : query.currency,
      compare: Array.isArray(query.compare)
        ? query.compare[0]
        : query.compare,
    },
    timeZone: snapshot.settings.timezone,
    lookbackDays: snapshot.settings.lookbackDays,
    reportingCurrency: snapshot.settings.currency,
    compareDefault: snapshot.settings.compareDefault,
  });
  const accounts = snapshot.assets
    .filter((asset) => asset.kind === "Ad Account")
    .map((asset) => ({ id: asset.id, name: asset.name }));
  const report = await getCreativeRowsForReport({
    snapshot,
    dateFrom: context.dateFrom,
    dateTo: context.dateTo,
    accountMetaId: context.account || undefined,
    campaignMetaId: Array.isArray(query.campaign)
      ? query.campaign[0]
      : query.campaign,
    currency: context.currency || null,
  });

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
      compare={context.compare}
      freshness={formatFreshnessLabel(
        snapshot.freshness,
        snapshot.settings.timezone,
      )}
    />
  );
}
