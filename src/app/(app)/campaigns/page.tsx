import { CampaignsView } from "@/components/campaigns-view";
import {
  createTrackerRepository,
  type CampaignInventoryPage,
} from "@/lib/db";
import { getApplicationSnapshot } from "@/lib/app-data";

export const dynamic = "force-dynamic";

const EMPTY_PAGE: CampaignInventoryPage = {
  items: [],
  total: 0,
  limit: 50,
  offset: 0,
};

function validPage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(parsed)
    ? Math.min(Math.max(parsed, 1), 100_000)
    : 1;
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    account?: string;
    status?: string;
    showInactive?: string;
    page?: string;
  }>;
}) {
  const [snapshot, query] = await Promise.all([
    getApplicationSnapshot(),
    searchParams,
  ]);
  const connected =
    snapshot.authenticated &&
    snapshot.connection?.status === "connected";
  const pageNumber = validPage(query.page);
  const filters = {
    query: query.q?.trim().slice(0, 200) ?? "",
    account: query.account?.trim().slice(0, 128) ?? "",
    status: query.status?.trim().slice(0, 64) ?? "",
    showInactive: query.showInactive === "1",
    page: pageNumber,
  };
  const data =
    connected && snapshot.connection
      ? await (
          await createTrackerRepository()
        ).listCampaignInventory({
          connectionId: snapshot.connection.connectionId,
          accountMetaId: filters.account || undefined,
          status: filters.status || undefined,
          search: filters.query || undefined,
          includeInactiveAccounts: filters.showInactive,
          limit: 50,
          offset: (pageNumber - 1) * 50,
        })
      : EMPTY_PAGE;
  const accounts = snapshot.assets
    .filter((asset) => asset.kind === "Ad Account")
    .filter(
      (asset) =>
        filters.showInactive ||
        asset.status === "ACTIVE" ||
        asset.id === filters.account,
    )
    .map((asset) => ({
      id: asset.id,
      name: asset.name,
      active: asset.status === "ACTIVE",
    }));

  return (
    <CampaignsView
      data={data}
      accounts={accounts}
      filters={filters}
      connected={connected}
    />
  );
}
