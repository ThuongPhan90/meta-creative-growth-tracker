import { CampaignsV2 } from "@/components/campaigns-v2";
import {
  createTrackerRepository,
  type CampaignInventoryPage,
} from "@/lib/db";
import { demoCampaignInventoryPage } from "@/lib/demo-campaigns";
import { getApplicationSnapshot } from "@/lib/app-data";
import {
  isOperationalMetaAssetAccount,
  shouldIncludeInactiveMetaAdAccounts,
} from "@/lib/meta";
import { resolveReportContext } from "@/lib/reporting";
import { formatFreshnessLabel } from "@/lib/presentation/formatters";

export const dynamic = "force-dynamic";

const EMPTY_PAGE: CampaignInventoryPage = {
  items: [],
  total: 0,
  limit: 50,
  offset: 0,
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function validPage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(parsed)
    ? Math.min(Math.max(parsed, 1), 100_000)
    : 1;
}

export default async function CampaignsPage({
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
  const liveConnected =
    snapshot.authenticated &&
    snapshot.connection?.status === "connected";
  const connected = snapshot.demoMode || liveConnected;
  const page = validPage(first(query.page));
  const showInactive = shouldIncludeInactiveMetaAdAccounts(
    snapshot.assets,
    context.account,
    first(query.showInactive) === "1",
  );
  const data =
    snapshot.demoMode
      ? demoCampaignInventoryPage
      : liveConnected && snapshot.connection
      ? await (
          await createTrackerRepository()
        ).listCampaignInventory({
          connectionId: snapshot.connection.connectionId,
          dateFrom: context.dateFrom,
          dateTo: context.dateTo,
          currency: context.currency || undefined,
          accountMetaId: context.account || undefined,
          status: first(query.status)?.trim().slice(0, 64) || undefined,
          search: first(query.q)?.trim().slice(0, 200) || undefined,
          includeInactiveAccounts: showInactive,
          limit: 50,
          offset: (page - 1) * 50,
        })
      : EMPTY_PAGE;
  const accounts = snapshot.assets
    .filter((asset) => asset.kind === "Ad Account")
    .filter(
      (asset) =>
        showInactive ||
        isOperationalMetaAssetAccount(asset) ||
        asset.id === context.account,
    )
    .map((asset) => ({ id: asset.id, name: asset.name }));

  return (
    <CampaignsV2
      data={data}
      query={query}
      connected={connected}
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
