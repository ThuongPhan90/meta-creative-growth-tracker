import {
  CreativeTrackerView,
  type TrackerFilters,
} from "@/components/creative-tracker-view";
import { getApplicationSnapshot } from "@/lib/app-data";
import {
  createTrackerRepository,
  type CreativeTrackerPage,
} from "@/lib/db";

export const dynamic = "force-dynamic";

const EMPTY_PAGE: CreativeTrackerPage = {
  items: [],
  total: 0,
  limit: 50,
  offset: 0,
};

function localDate(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function validDate(value: string | undefined, fallback: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : fallback;
}

function validPage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(parsed)
    ? Math.min(Math.max(parsed, 1), 100_000)
    : 1;
}

export default async function TrackerPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    q?: string;
    account?: string;
    campaign?: string;
    format?: string;
    showInactive?: string;
    page?: string;
  }>;
}) {
  const [snapshot, query] = await Promise.all([
    getApplicationSnapshot(),
    searchParams,
  ]);
  const dateToDefault = localDate(snapshot.settings.timezone);
  const dateFromDefault = addDays(
    dateToDefault,
    -(snapshot.settings.lookbackDays - 1),
  );
  let dateFrom = validDate(query.from, dateFromDefault);
  let dateTo = validDate(query.to, dateToDefault);
  if (dateFrom > dateTo) [dateFrom, dateTo] = [dateTo, dateFrom];
  const earliest = addDays(dateTo, -364);
  if (dateFrom < earliest) dateFrom = earliest;

  const format =
    query.format === "video" ||
    query.format === "image" ||
    query.format === "unallocated"
      ? query.format
      : "";
  const pageNumber = validPage(query.page);
  const filters: TrackerFilters = {
    dateFrom,
    dateTo,
    query: query.q?.trim().slice(0, 200) ?? "",
    account: query.account?.trim().slice(0, 128) ?? "",
    campaign: query.campaign?.trim().slice(0, 128) ?? "",
    format,
    showInactive: query.showInactive === "1",
    dateRangeChanged:
      dateFrom !== dateFromDefault || dateTo !== dateToDefault,
    page: pageNumber,
  };
  const connected =
    snapshot.authenticated &&
    snapshot.connection?.status === "connected";
  const data =
    connected && snapshot.connection
      ? await (
          await createTrackerRepository()
        ).listCreativeTracker({
          connectionId: snapshot.connection.connectionId,
          dateFrom,
          dateTo,
          accountMetaId: filters.account || undefined,
          campaignMetaId: filters.campaign || undefined,
          assetType: format || undefined,
          search: filters.query || undefined,
          currency: snapshot.settings.currency ?? undefined,
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
    <CreativeTrackerView
      data={data}
      accounts={accounts}
      filters={filters}
      connected={connected}
      minimumInstalls={snapshot.settings.minimumInstallThreshold}
    />
  );
}
