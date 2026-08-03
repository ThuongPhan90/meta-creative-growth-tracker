import { CampaignsV2 } from "@/components/campaigns-v2";
import { AdsInventoryV2 } from "@/components/ads-inventory-v2";
import { V3SurfacePage } from "@/components/ui-v3/surface-page";
import {
  createTrackerRepository,
  type AdInventoryItem,
  type AdInventoryPage,
  type CanonicalCampaignResultTotals,
  type CampaignInventoryItem,
  type CampaignInventoryPage,
  type TrackerRepository,
} from "@/lib/db";
import { computeResultMappingVersion } from "@/lib/db/result-mapping-version";
import {
  demoAdInventoryPage,
  demoCampaignInventoryPage,
} from "@/lib/demo-campaigns";
import {
  buildApplicationResultMetrics,
  getApplicationSnapshot,
  getCanonicalResultsForReport,
  getDeliveryForReport,
  resolveApplicationReportContext,
} from "@/lib/app-data";
import {
  isOperationalMetaAssetAccount,
} from "@/lib/meta";
import { formatFreshnessFields } from "@/lib/presentation/freshness-presentation";
import { buildReportingBarModel } from "@/lib/presentation/reporting-bar";
import { isUiV3 } from "@/lib/presentation/ui-version";
import {
  DEFAULT_OBJECTIVE_REGISTRY,
  objectiveDatabaseKeys,
  resolveObjective,
  type ReportingContext,
  type ResultDefinition,
} from "@/lib/reporting";
import { legacyDeliveryResultValue } from "@/lib/reporting/legacy-result-bridge";
import { parseCampaignsRouteFilters } from "@/lib/presentation/campaign-navigation";

export const dynamic = "force-dynamic";

const EMPTY_PAGE: CampaignInventoryPage = {
  items: [],
  total: 0,
  limit: 50,
  offset: 0,
};

const EMPTY_AD_PAGE: AdInventoryPage = {
  items: [],
  total: 0,
  limit: 50,
  offset: 0,
};

function canonicalMetricSource(
  definition: ResultDefinition,
): "action" | "action_value" {
  return definition.unit === "currency"
    ? "action_value"
    : "action";
}

function campaignResultKey({
  accountId,
  campaignId,
  currency,
  objectiveKey,
  canonicalResultKey,
  metricSource,
}: {
  accountId: string;
  campaignId: string;
  currency: string;
  objectiveKey: string;
  canonicalResultKey: string;
  metricSource: "action" | "action_value";
}) {
  return [
    accountId,
    campaignId,
    currency.toUpperCase(),
    objectiveKey,
    canonicalResultKey,
    metricSource,
  ].join("\u0000");
}

function withCanonicalCampaignResults({
  page,
  totals,
  definitions,
  context,
  legacyBridge = false,
}: {
  page: CampaignInventoryPage;
  totals: CanonicalCampaignResultTotals | null;
  definitions: readonly ResultDefinition[];
  context: ReportingContext;
  legacyBridge?: boolean;
}): CampaignInventoryPage {
  const enabledDefinitions = definitions.filter(
    (definition) => definition.enabled,
  );
  const resultTotals = new Map<string, number>();
  if (totals?.available) {
    for (const result of totals.results) {
      const definition = enabledDefinitions.find(
        (item) =>
          item.canonicalKey === result.canonicalResultKey,
      );
      if (
        !definition ||
        canonicalMetricSource(definition) !==
          result.metricSource ||
        (context.objectiveKey !== "all" &&
          context.objectiveKey !== result.objectiveKey)
      ) {
        continue;
      }
      const key = campaignResultKey({
        accountId: result.adAccountMetaId,
        campaignId: result.campaignMetaId,
        currency: result.currency,
        objectiveKey: result.objectiveKey,
        canonicalResultKey: result.canonicalResultKey,
        metricSource: result.metricSource,
      });
      resultTotals.set(
        key,
        (resultTotals.get(key) ?? 0) + result.value,
      );
    }
  }

  const items = page.items.map((campaign) => {
    const objectiveKey = resolveObjective(
      campaign.objective,
    ).key;
    const applicableDefinitions = enabledDefinitions.filter(
      (definition) =>
        definition.objectiveKeys.includes(objectiveKey) &&
        (context.objectiveKey === "all" ||
          context.objectiveKey === objectiveKey),
    );
    return {
      ...campaign,
      performance: campaign.performance.map((performance) => {
        const resultValues = Object.fromEntries(
          applicableDefinitions.map((definition) => {
            const metricSource =
              canonicalMetricSource(definition);
            let value =
              resultTotals.get(
              campaignResultKey({
                accountId: campaign.metaAdAccountId,
                campaignId: campaign.metaCampaignId,
                currency: performance.currency,
                objectiveKey,
                canonicalResultKey:
                  definition.canonicalKey,
                metricSource,
              }),
              ) ?? null;
            const deliveryValue = legacyDeliveryResultValue(
              {
                spend: performance.spend,
                impressions: performance.impressions,
                linkClicks: 0,
                installs: performance.installs,
                registrations: performance.registrations,
              },
              definition.canonicalKey,
            );
            if (definition.canonicalKey === "impressions") {
              value = deliveryValue;
            } else if (
              legacyBridge &&
              (definition.canonicalKey === "install" ||
                definition.canonicalKey === "complete_registration")
            ) {
              value = deliveryValue;
            }
            return [
              definition.canonicalKey,
              value,
            ];
          }),
        );
        return {
          ...performance,
          resultValues,
        };
      }),
    } satisfies CampaignInventoryItem;
  });

  return { ...page, items };
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function validPage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(parsed)
    ? Math.min(Math.max(parsed, 1), 100_000)
    : 1;
}

function normalizedCampaignStatus(value: string | undefined) {
  const normalized = value?.trim().slice(0, 64).toUpperCase();
  return normalized || undefined;
}

function demoAdsForScope({
  accountIds,
  status,
  delivery,
  search,
  page,
}: {
  accountIds: readonly string[];
  status: "all" | "active" | "paused";
  delivery: "all" | "latest" | "missing";
  search: string | null;
  page: number;
}): AdInventoryPage {
  const normalizedSearch = search?.trim().toLocaleLowerCase("vi") ?? "";
  const matchesSearch = (ad: AdInventoryItem) =>
    !normalizedSearch ||
    [
      ad.name,
      ad.metaAdId,
      ad.campaignName,
      ad.metaCampaignId,
      ad.adSetName,
      ad.metaAdSetId,
      ad.adAccountName,
      ad.metaAdAccountId,
    ].some((value) => value.toLocaleLowerCase("vi").includes(normalizedSearch));
  const matchesStatus = (ad: AdInventoryItem) => {
    const effectiveStatus = (ad.effectiveStatus ?? ad.status ?? "").toUpperCase();
    if (status === "active") {
      return ad.isActive && effectiveStatus === "ACTIVE";
    }
    if (status === "paused") return effectiveStatus.includes("PAUSED");
    return true;
  };
  const matchesDelivery = (ad: AdInventoryItem) =>
    delivery === "all" ||
    (delivery === "latest" && ad.deliveryState === "delivering") ||
    (delivery === "missing" && ad.deliveryState === "missing");
  const items = demoAdInventoryPage.items.filter(
    (ad) =>
      accountIds.includes(ad.metaAdAccountId) &&
      matchesStatus(ad) &&
      matchesDelivery(ad) &&
      matchesSearch(ad),
  );
  const offset = (page - 1) * 50;
  return {
    items: items.slice(offset, offset + 50),
    total: items.length,
    limit: 50,
    offset,
  };
}

async function listCampaignsForScope({
  repository,
  connectionId,
  accountIds,
  dateFrom,
  dateTo,
  currency,
  attributionWindow,
  actionReportTime,
  syncVersion,
  objectiveRawKeys,
  status,
  search,
  includeInactiveAccounts,
  page,
}: {
  repository: TrackerRepository;
  connectionId: string;
  accountIds: readonly string[];
  dateFrom: string;
  dateTo: string;
  currency?: string;
  attributionWindow?: string;
  actionReportTime?: "impression" | "conversion" | "mixed";
  syncVersion?: string;
  objectiveRawKeys?: readonly string[];
  status?: string;
  search?: string;
  includeInactiveAccounts: boolean;
  page: number;
}): Promise<CampaignInventoryPage> {
  if (accountIds.length === 0) return EMPTY_PAGE;
  const offset = (page - 1) * 50;
  if (accountIds.length === 1) {
    return repository.listCampaignInventory({
      connectionId,
      dateFrom,
      dateTo,
      currency,
      attributionWindow,
      actionReportTime,
      syncVersion,
      objectiveRawKeys:
        objectiveRawKeys?.length ? objectiveRawKeys : undefined,
      accountMetaId: accountIds[0],
      status,
      search,
      includeInactiveAccounts,
      limit: 50,
      offset,
    });
  }

  const pages: CampaignInventoryPage[] = [];
  for (let index = 0; index < accountIds.length; index += 8) {
    pages.push(
      ...(await Promise.all(
        accountIds.slice(index, index + 8).map((accountMetaId) =>
          repository.listCampaignInventory({
            connectionId,
            dateFrom,
            dateTo,
            currency,
            attributionWindow,
            actionReportTime,
            syncVersion,
            objectiveRawKeys:
              objectiveRawKeys?.length ? objectiveRawKeys : undefined,
            accountMetaId,
            status,
            search,
            includeInactiveAccounts,
            limit: 200,
            offset: 0,
          }),
        ),
      )),
    );
  }
  const items = pages
    .flatMap((result) => result.items)
    .sort(
      (left, right) =>
        Number(
          right.isActive &&
            (right.effectiveStatus ?? right.status) === "ACTIVE",
        ) -
          Number(
            left.isActive &&
              (left.effectiveStatus ?? left.status) === "ACTIVE",
          ) ||
        Number(right.isActive) - Number(left.isActive) ||
        right.lastSeenAt.localeCompare(left.lastSeenAt) ||
        left.name.localeCompare(right.name, "vi"),
    );

  return {
    items: items.slice(offset, offset + 50),
    total: pages.reduce((sum, result) => sum + result.total, 0),
    limit: 50,
    offset,
  };
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
  const context = resolveApplicationReportContext(snapshot, query);
  const routeFilters = parseCampaignsRouteFilters(query);
  const liveConnected =
    snapshot.authenticated &&
    snapshot.connection?.status === "connected";
  const connected = snapshot.demoMode || liveConnected;
  const page = validPage(first(query.page));
  const showInactive = first(query.showInactive) === "1";
  const repository =
    liveConnected && snapshot.connection
      ? await createTrackerRepository()
      : null;
  const accounts = snapshot.assets
    .filter((asset) => asset.kind === "Ad Account")
    .filter(
      (asset) =>
        showInactive ||
        isOperationalMetaAssetAccount(asset) ||
        asset.id === context.account,
    )
    .map((asset) => ({ id: asset.id, name: asset.name }));
  const currencyOptions = [
    ...new Set(
      snapshot.assets.flatMap((asset) =>
        asset.kind === "Ad Account" && asset.currency
          ? [asset.currency]
          : [],
      ),
    ),
  ];
  const freshness = formatFreshnessFields(
    snapshot.freshness,
    snapshot.settings.timezone,
  );
  const reportingBar = buildReportingBarModel(
    snapshot.reportingScope,
    context,
    {
      persistScope:
        !snapshot.demoMode &&
        snapshot.authenticated &&
        Boolean(snapshot.connection),
    },
    snapshot.resultDefinitions,
  );

  if (routeFilters.tab === "ads") {
    const adsPage = snapshot.demoMode
      ? demoAdsForScope({
          accountIds: context.adAccountIds,
          status: routeFilters.status,
          delivery: routeFilters.delivery,
          search: routeFilters.q,
          page: routeFilters.page,
        })
      : repository && snapshot.connection
        ? await repository.listAdInventory({
            connectionId: snapshot.connection.connectionId,
            selectedAdAccountMetaIds: context.adAccountIds,
            status: routeFilters.status,
            delivery: routeFilters.delivery,
            search: routeFilters.q ?? undefined,
            limit: 50,
            offset: (routeFilters.page - 1) * 50,
            includeInactiveAccounts: showInactive,
            freshnessThresholdDays: 2,
          })
        : EMPTY_AD_PAGE;

    const content = (
      <AdsInventoryV2
        data={adsPage}
        query={query}
        connected={connected}
        dateFrom={context.dateFrom}
        dateTo={context.dateTo}
        account={context.account}
        accounts={accounts}
        reportingCurrency={context.currency}
        currencyOptions={currencyOptions}
        compare={context.compareMode}
        freshness={freshness}
        reportingBar={reportingBar}
      />
    );

    return isUiV3() ? (
      <V3SurfacePage surface="campaigns">{content}</V3SurfacePage>
    ) : (
      content
    );
  }
  const resultMappingsPromise =
    repository &&
    context.adAccountIds.length > 0 &&
    context.syncVersion &&
    context.syncVersion !== "latest"
      ? repository.listResultMappings().catch(() => null)
      : Promise.resolve(null);
  const [campaignPage, delivery, canonicalResults, resultMappings] =
    await Promise.all([
    snapshot.demoMode
        ? Promise.resolve({
            ...demoCampaignInventoryPage,
            items: demoCampaignInventoryPage.items.filter((campaign) =>
              context.adAccountIds.includes(campaign.metaAdAccountId),
            ),
            total: demoCampaignInventoryPage.items.filter((campaign) =>
              context.adAccountIds.includes(campaign.metaAdAccountId),
            ).length,
          })
      : repository && snapshot.connection
        ? listCampaignsForScope({
            repository,
            connectionId: snapshot.connection.connectionId,
            accountIds: context.adAccountIds,
            dateFrom: context.dateFrom,
            dateTo: context.dateTo,
            currency: context.currency || undefined,
            attributionWindow: context.attributionSettingKey,
            actionReportTime: context.actionReportTime,
            syncVersion: context.syncVersion,
            objectiveRawKeys: objectiveDatabaseKeys(
              context.objectiveKey,
            ),
            status: normalizedCampaignStatus(first(query.status)),
            search: first(query.q)?.trim().slice(0, 200) || undefined,
            includeInactiveAccounts: showInactive,
            page,
          })
        : Promise.resolve(EMPTY_PAGE),
    getDeliveryForReport({
      snapshot,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      accountMetaIds: context.adAccountIds,
      currency: context.currency || null,
      attributionWindow: context.attributionSettingKey,
      actionReportTime: context.actionReportTime,
      syncVersion: context.syncVersion,
      reportContext: context,
    }),
    getCanonicalResultsForReport({
      snapshot,
      context,
      ...(repository ? { repository } : {}),
    }),
    resultMappingsPromise,
  ]);
  let campaignResultTotals: CanonicalCampaignResultTotals | null =
    null;
  const campaignMetaIds = [
    ...new Set(
      campaignPage.items.map(
        (campaign) => campaign.metaCampaignId,
      ),
    ),
  ];
  if (
    repository &&
    snapshot.connection &&
    resultMappings &&
    campaignMetaIds.length > 0
  ) {
    try {
      campaignResultTotals =
        await repository.getCanonicalCampaignResultTotals({
          connectionId: snapshot.connection.connectionId,
          dateFrom: context.dateFrom,
          dateTo: context.dateTo,
          adAccountIds: context.adAccountIds,
          campaignMetaIds,
          ...(context.objectiveKey === "all"
            ? {}
            : { objectiveKeys: [context.objectiveKey] }),
          objectiveMappings: DEFAULT_OBJECTIVE_REGISTRY.map(
            (objective) => ({
              objectiveKey: objective.key,
              rawObjectiveKeys: objective.rawObjectiveKeys,
            }),
          ),
          ...(context.currency
            ? { currency: context.currency }
            : {}),
          attributionWindow: context.attributionSettingKey,
          actionReportTime: context.actionReportTime,
          syncVersion: context.syncVersion,
          resultMappingVersion:
            computeResultMappingVersion(resultMappings),
        });
    } catch {
      campaignResultTotals = null;
    }
  }
  const data = withCanonicalCampaignResults({
    page: campaignPage,
    totals: snapshot.demoMode ? null : campaignResultTotals,
    definitions: canonicalResults.definitions,
    context,
    legacyBridge: snapshot.demoMode,
  });
  const content = (
    <CampaignsV2
      data={data}
      delivery={delivery}
      query={query}
      connected={connected}
      dateFrom={context.dateFrom}
      dateTo={context.dateTo}
      account={context.account}
      accounts={accounts}
      reportingCurrency={context.currency}
      currencyOptions={currencyOptions}
      compare={context.compareMode}
      freshness={freshness}
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
        delivery,
        definitions: canonicalResults.definitions,
        periodReach: canonicalResults.periodReach,
        ...(canonicalResults.state === "demo_legacy_bridge"
          ? {}
          : { canonicalResults: canonicalResults.values }),
      })}
    />
  );

  return isUiV3() ? (
    <V3SurfacePage surface="campaigns">{content}</V3SurfacePage>
  ) : (
    content
  );
}
