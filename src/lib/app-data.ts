import "server-only";

import { cache } from "react";

import {
  createTrackerRepository,
  type CreativeLibraryItem,
  type CreativePerformanceItem,
  type CanonicalCreativeFamilyResultTotals,
  type CanonicalResultTrendPoint as DatabaseCanonicalResultTrendPoint,
  type DeliveryPerformanceItem,
  type LiveDeliverySummary,
  type MetaBreakdownMetricRow,
  type MetaConnectionRecord,
  type SyncRunRecord,
  type TrackerRepository,
  type TrackerSettings,
} from "@/lib/db";
import {
  demoAssets,
  demoCreatives,
  demoDashboard,
  demoFreshness,
  demoSyncRuns,
} from "@/lib/demo-data";
import {
  baselineKey,
  enrichCreativeFamiliesWithCanonicalResults,
  buildDynamicResultMetrics,
  computeOsCpiBaselines,
  computeScopedCpiBaselines,
  DEFAULT_OBJECTIVE_REGISTRY,
  DEFAULT_RESULT_DEFINITIONS,
  buildCanonicalReportingScope,
  explainCreativeRating,
  hydrateResultDefinitions,
  isDeliveryNativeResultKey,
  objectiveDatabaseKeys,
  rateCreativeCpi,
  resolveReportingResultMetricSource,
  resolveReportContext,
  scopedBaselineKey,
  summarizeDelivery,
  buildMetaBreakdown,
  unavailableMetaBreakdown,
  withDeliveryBackedResultValues,
  type CanonicalReportingScope,
  type CanonicalResultValue,
  type AccountCreativePerformance,
  type CreativeFamilyFatigueComparison,
  type DynamicResultMetricsModel,
  type MetaBreakdownModel,
  type MetricDisplayPresets,
  type ReportingContext,
  type ResultDefinition,
  type ResolvedReportContext,
  type ReportingScopeInventory,
} from "@/lib/reporting";
import { computeResultMappingVersion } from "@/lib/db/result-mapping-version";
import {
  bridgeLegacyTrendPoints,
  withCanonicalCreativeResultValues,
} from "@/lib/reporting/legacy-result-bridge";
import {
  createCreativeFamilyIdentity,
  createFreshness,
  deriveDataConfidence,
} from "@/lib/data-contract";
import {
  evaluateMetaConnectionLifecycle,
  isOperationalAdAccount,
  metaAdAccountStatusLabel,
} from "@/lib/meta";
import {
  getRuntimeConfiguration,
  readDatabaseHealth,
  readPageOwnerSession,
} from "@/lib/server";
import type {
  CreativePerformanceSummary,
  CreativePlatform,
  CreativeRow,
  DashboardViewModel,
  Freshness,
  MetaAssetRow,
  SetupCheck,
  SyncRunView,
} from "@/types/view-models";

const MAX_VIEW_ROWS = 5_000;
const DEFAULT_INSTALL_ACTION_TYPES = [
  "mobile_app_install",
  "omni_app_install",
  "app_install",
];
const DEFAULT_REGISTRATION_ACTION_TYPES = [
  "complete_registration",
  "omni_complete_registration",
  "mobile_app_complete_registration",
];
type LegacyTrendPoint = {
  date: string;
  currency: string;
  spend: number;
  impressions: number;
  linkClicks: number;
  installs: number;
  registrations: number;
};

function bridgeLegacyTrendPointsForApp({
  points,
  context,
  definitions,
}: {
  points: readonly LegacyTrendPoint[];
  context: ReportingContext | undefined;
  definitions: readonly ResultDefinition[];
}) {
  const canonical = bridgeLegacyTrendPoints({
    points,
    context,
    definitions,
  });

  return canonical.map((point, index) => {
    const legacy = points[index];
    const installs = legacy?.installs ?? 0;
    const registrations = legacy?.registrations ?? 0;
    return {
      ...point,
      installs,
      registrations,
      cpi: installs > 0 ? point.spend / installs : null,
      costPerRegistration:
        registrations > 0 ? point.spend / registrations : null,
    };
  });
}

export type ApplicationSnapshot = {
  demoMode: boolean;
  authenticated: boolean;
  configuredForLive: boolean;
  connection: MetaConnectionRecord | null;
  dashboard: DashboardViewModel;
  assets: MetaAssetRow[];
  creatives: CreativeRow[];
  creativesTruncated: boolean;
  syncRuns: SyncRunView[];
  setupChecks: SetupCheck[];
  freshness: Freshness;
  reportingScope: CanonicalReportingScope | null;
  resultDefinitions: ResultDefinition[];
  settings: {
    timezone: string;
    lookbackDays: number;
    currency: string | null;
    compareDefault: "previous_period" | "none";
    minimumInstallThreshold: number;
    installActionTypes: string[];
    registrationActionTypes: string[];
    metricDisplayPresets: MetricDisplayPresets;
    updatedAt: string | null;
  };
};

const completeSnapshotLoaders = new WeakMap<
  ApplicationSnapshot,
  () => Promise<ApplicationSnapshot>
>();

const EMPTY_FRESHNESS: Freshness = {
  lastSyncedAt: null,
  dataThroughAt: null,
  syncStatus: "warning",
  freshnessSeconds: null,
  syncMode: "manual",
};

function scopeInventoryFromAssets(
  assets: readonly MetaAssetRow[],
): ReportingScopeInventory {
  const businesses = assets.filter((asset) => asset.kind === "Business");
  const businessIdByName = new Map(
    businesses.map((business) => [business.name, business.id]),
  );
  const adAccounts = assets.filter(
    (asset) => asset.kind === "Ad Account",
  );

  return {
    businesses: businesses.map((business) => ({
      id: business.id,
      name: business.name,
      isActive: business.isCurrent !== false,
      adAccountIds: adAccounts
        .filter((account) => account.parentName === business.name)
        .map((account) => account.id),
    })),
    adAccounts: adAccounts.map((account) => ({
      id: account.id,
      name: account.name,
      isActive: account.isCurrent !== false,
      accountStatus: null,
      currency: account.currency ?? "UNKNOWN",
      timezone: account.timezone ?? "UTC",
      businessIds: account.parentName
        ? [businessIdByName.get(account.parentName)].filter(
            (value): value is string => Boolean(value),
          )
        : [],
    })),
  };
}

function defaultAllReportingScope(
  inventory: ReportingScopeInventory,
): CanonicalReportingScope {
  return buildCanonicalReportingScope({
    inventory,
    override: {
      businessIds: inventory.businesses.map((business) => business.id),
      adAccountIds: inventory.adAccounts.map((account) => account.id),
    },
  });
}

type ApplicationSearchParams = Record<
  string,
  string | string[] | undefined
>;

function firstQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function queryIdList(
  value: string | string[] | undefined,
): string[] | undefined {
  if (value === undefined) return undefined;
  return (Array.isArray(value) ? value : [value])
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Resolves every reporting page from the same URL + persisted-scope +
 * snapshot defaults. A multi-currency scope defaults to split mode so money
 * is never silently added or ranked across currencies.
 */
export function resolveApplicationReportContext(
  snapshot: ApplicationSnapshot,
  query: ApplicationSearchParams,
): ResolvedReportContext {
  const persistedBusinessIds =
    snapshot.reportingScope?.selected.businessIds ?? [];
  const persistedAccountIds =
    snapshot.reportingScope?.selected.adAccountIds ?? [];
  const urlAccountIds =
    queryIdList(query.account_ids) ??
    (firstQueryValue(query.account)
      ? [firstQueryValue(query.account)!]
      : undefined);
  const effectiveAccountIds = urlAccountIds ?? persistedAccountIds;
  const selectedCurrencies = new Set(
    (snapshot.reportingScope?.available.adAccounts ?? [])
      .filter((account) => effectiveAccountIds.includes(account.id))
      .map((account) => account.currency.trim().toUpperCase())
      .filter((currency) => /^[A-Z]{3}$/.test(currency)),
  );
  const explicitCurrency = firstQueryValue(query.currency)
    ?.trim()
    .toUpperCase();
  const defaultCurrency =
    selectedCurrencies.size === 1
      ? [...selectedCurrencies][0]
      : null;
  const currencyMode =
    explicitCurrency || selectedCurrencies.size === 1
      ? "single"
      : "split";

  const context = resolveReportContext({
    query: {
      from: query.from,
      to: query.to,
      businessIds: query.business_ids,
      adAccountIds: query.account_ids,
      account: query.account,
      objectiveKey: query.objective,
      primaryResultKey: query.result,
      currency: query.currency,
      compareMode: query.compare,
      attributionSettingKey: query.attribution,
      actionReportTime: query.action_report_time,
      syncVersion: query.sync_version,
    },
    timeZone: snapshot.settings.timezone,
    lookbackDays: snapshot.settings.lookbackDays,
    reportingCurrency: explicitCurrency ?? defaultCurrency,
    compareDefault: snapshot.settings.compareDefault,
    resultDefinitions: snapshot.resultDefinitions,
    defaults: {
      businessIds: persistedBusinessIds,
      adAccountIds: persistedAccountIds,
      objectiveKey: "all",
      currencyMode,
      ...(explicitCurrency ?? defaultCurrency
        ? { currency: explicitCurrency ?? defaultCurrency! }
        : {}),
      attributionSettingKey: "account_default",
      actionReportTime: "mixed",
      syncVersion: snapshot.freshness.syncVersion ?? "latest",
    },
  });
  return context;
}

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

function formatTimestamp(
  value: string | null,
  timeZone = "Asia/Ho_Chi_Minh",
) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

function platformFromOs(
  operatingSystem: CreativePerformanceItem["operatingSystem"],
): CreativePlatform {
  if (operatingSystem === "ANDROID") return "Android";
  if (operatingSystem === "IOS") return "iOS";
  return "Unknown";
}

function canonicalOs(
  operatingSystem: CreativePerformanceItem["operatingSystem"],
) {
  if (operatingSystem === "ANDROID") return "android" as const;
  if (operatingSystem === "IOS") return "ios" as const;
  return "unknown" as const;
}

function canonicalFormat(
  assetType: CreativePerformanceItem["assetType"],
) {
  if (assetType === "video") return "video" as const;
  if (assetType === "image") return "image" as const;
  return "unknown" as const;
}

function safeThumbnail(value: string | null) {
  if (!value) return "/creative-placeholder.svg";
  if (value.startsWith("/")) return value;

  try {
    const url = new URL(value);
    const allowed =
      url.protocol === "https:" &&
      (url.hostname === "facebook.com" ||
        url.hostname.endsWith(".facebook.com") ||
        url.hostname === "fbcdn.net" ||
        url.hostname.endsWith(".fbcdn.net") ||
        url.hostname === "fbsbx.com" ||
        url.hostname.endsWith(".fbsbx.com"));
    return allowed ? url.toString() : "/creative-placeholder.svg";
  } catch {
    return "/creative-placeholder.svg";
  }
}

function formatDuration(seconds: number | null) {
  if (seconds === null || seconds < 0) return null;
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  return `${String(minutes).padStart(2, "0")}:${String(
    rounded % 60,
  ).padStart(2, "0")}`;
}

function ratio(width: number | null, height: number | null) {
  if (!width || !height) return null;
  const gcd = (left: number, right: number): number =>
    right === 0 ? left : gcd(right, left % right);
  const divisor = gcd(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

async function loadCreativeLibrary(
  repository: TrackerRepository,
  connectionId: string,
  adAccountMetaIds?: readonly string[],
  campaignMetaIds?: readonly string[],
) {
  const items = await repository.listCreativeLibrary({
    connectionId,
    ...(adAccountMetaIds === undefined
      ? {}
      : { adAccountMetaIds: [...adAccountMetaIds] }),
    ...(campaignMetaIds === undefined
      ? {}
      : { campaignMetaIds: [...campaignMetaIds] }),
    limit: MAX_VIEW_ROWS + 1,
    offset: 0,
  });
  return {
    items: items.slice(0, MAX_VIEW_ROWS),
    truncated: items.length > MAX_VIEW_ROWS,
  };
}

async function loadPerformance(
  repository: TrackerRepository,
  connectionId: string,
  dateFrom: string,
  dateTo: string,
  currency: string | null,
  accountMetaId?: string,
  campaignMetaId?: string,
  attributionWindow?: string,
  actionReportTime?: "impression" | "conversion" | "mixed",
  syncVersion?: string,
  objectiveRawKeys?: readonly string[],
) {
  const items = await repository.listCreativePerformance({
    connectionId,
    dateFrom,
    dateTo,
    currency: currency ?? undefined,
    accountMetaId: accountMetaId || undefined,
    campaignMetaId: campaignMetaId || undefined,
    attributionWindow: attributionWindow || undefined,
    actionReportTime,
    syncVersion: syncVersion || undefined,
    objectiveRawKeys:
      objectiveRawKeys?.length ? objectiveRawKeys : undefined,
    limit: MAX_VIEW_ROWS + 1,
    offset: 0,
  });
  return {
    items: items.slice(0, MAX_VIEW_ROWS),
    truncated: items.length > MAX_VIEW_ROWS,
  };
}

async function mapAccountBatches<T>(
  accountIds: readonly string[],
  mapper: (accountId: string) => Promise<T>,
): Promise<T[]> {
  const values: T[] = [];
  for (let offset = 0; offset < accountIds.length; offset += 8) {
    values.push(
      ...(await Promise.all(
        accountIds.slice(offset, offset + 8).map(mapper),
      )),
    );
  }
  return values;
}

function mergeDeliveryPerformance(
  groups: readonly (readonly DeliveryPerformanceItem[])[],
): DeliveryPerformanceItem[] {
  const merged = new Map<string, DeliveryPerformanceItem>();
  for (const item of groups.flat()) {
    const key = `${item.operatingSystem}\u001f${item.currency}`;
    const current = merged.get(key) ?? {
      ...item,
      spend: 0,
      impressions: 0,
      linkClicks: 0,
      installs: 0,
      registrations: 0,
      video3sViews: 0,
      video100Views: 0,
      metricDays: 0,
    };
    current.spend += item.spend;
    current.impressions += item.impressions;
    current.linkClicks += item.linkClicks;
    current.installs += item.installs;
    current.registrations += item.registrations;
    current.video3sViews += item.video3sViews;
    current.video100Views += item.video100Views;
    current.metricDays = Math.max(current.metricDays, item.metricDays);
    merged.set(key, current);
  }
  return [...merged.values()];
}

function mergeCreativePerformance(
  groups: readonly (readonly CreativePerformanceItem[])[],
): CreativePerformanceItem[] {
  const merged = new Map<string, CreativePerformanceItem>();
  for (const item of groups.flat()) {
    const key = [
      item.creativeAssetId,
      item.operatingSystem,
      item.currency,
    ].join("\u001f");
    const current = merged.get(key) ?? {
      ...item,
      spend: 0,
      impressions: 0,
      dailyReachSum: 0,
      linkClicks: 0,
      installs: 0,
      registrations: 0,
      video3sViews: 0,
      video100Views: 0,
      linkCtr: null,
      cpi: null,
      costPerRegistration: null,
      hookRate: null,
      holdRate: null,
      metricDays: 0,
    };
    current.spend += item.spend;
    current.impressions += item.impressions;
    current.dailyReachSum += item.dailyReachSum;
    current.linkClicks += item.linkClicks;
    current.installs += item.installs;
    current.registrations += item.registrations;
    current.video3sViews += item.video3sViews;
    current.video100Views += item.video100Views;
    current.metricDays = Math.max(current.metricDays, item.metricDays);
    merged.set(key, current);
  }

  return [...merged.values()].map((item) => ({
    ...item,
    linkCtr:
      item.impressions > 0
        ? (item.linkClicks / item.impressions) * 100
        : null,
    cpi: item.installs > 0 ? item.spend / item.installs : null,
    costPerRegistration:
      item.registrations > 0
        ? item.spend / item.registrations
        : null,
    hookRate:
      item.assetType === "video" && item.impressions > 0
        ? (item.video3sViews / item.impressions) * 100
        : null,
    holdRate:
      item.assetType === "video" && item.video3sViews > 0
        ? (item.video100Views / item.video3sViews) * 100
        : null,
  }));
}

function benchmarkDateFrom(dateTo: string, windowDays: number) {
  const end = new Date(`${dateTo}T00:00:00.000Z`);
  end.setUTCDate(
    end.getUTCDate() - Math.max(1, Math.floor(windowDays)) + 1,
  );
  return end.toISOString().slice(0, 10);
}

function splitFatigueComparisonRange(
  dateFrom: string,
  dateTo: string,
) {
  const start = new Date(`${dateFrom}T00:00:00.000Z`);
  const end = new Date(`${dateTo}T00:00:00.000Z`);
  const windowDays =
    Math.floor((end.getTime() - start.getTime()) / 86_400_000) +
    1;
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return null;
  }

  // V5 uses two equal, auditable windows. A selected report needs at least
  // 14 days for 7D-vs-7D, or 56 days for the optional 28D-vs-28D mode.
  // Never split an arbitrary range into unequal halves just to show fatigue.
  const comparisonDays = windowDays >= 56 ? 28 : windowDays >= 14 ? 7 : null;
  if (!comparisonDays) return null;
  const laterStart = new Date(end);
  laterStart.setUTCDate(laterStart.getUTCDate() - comparisonDays + 1);
  const earlierEnd = new Date(laterStart);
  earlierEnd.setUTCDate(earlierEnd.getUTCDate() - 1);
  const earlierStart = new Date(earlierEnd);
  earlierStart.setUTCDate(earlierStart.getUTCDate() - comparisonDays + 1);
  return {
    windowDays: comparisonDays,
    earlier: {
      dateFrom: earlierStart.toISOString().slice(0, 10),
      dateTo: earlierEnd.toISOString().slice(0, 10),
      days: comparisonDays,
    },
    later: {
      dateFrom: laterStart.toISOString().slice(0, 10),
      dateTo,
      days: comparisonDays,
    },
  };
}

function markLiveCanonicalCreativeResultsUnavailable(
  rows: readonly CreativeRow[],
): CreativeRow[] {
  return rows.map((row) => ({
    ...row,
    performance: row.performance
      ? {
          ...row.performance,
          resultValues: {},
          evaluation: null,
        }
      : null,
  }));
}

async function enrichLiveCreativeRowsForReport({
  snapshot,
  repository,
  settings,
  rows,
  libraryItems,
  requestedAccountIds,
  context,
  dateFrom,
  dateTo,
  effectiveCurrency,
  campaignMetaId,
}: {
  snapshot: ApplicationSnapshot;
  repository: TrackerRepository;
  settings: TrackerSettings;
  rows: readonly CreativeRow[];
  libraryItems: readonly CreativeLibraryItem[];
  requestedAccountIds: readonly string[] | undefined;
  context: ReportingContext;
  dateFrom: string;
  dateTo: string;
  effectiveCurrency: string | null;
  campaignMetaId?: string;
}): Promise<CreativeRow[]> {
  const enabledSnapshotDefinitions =
    snapshot.resultDefinitions.filter(
      (definition) => definition.enabled,
    );
  if (
    !snapshot.connection ||
    !requestedAccountIds?.length ||
    context.objectiveKey === "all" ||
    !context.syncVersion ||
    context.syncVersion === "latest"
  ) {
    return withCanonicalCreativeResultValues({
      rows: markLiveCanonicalCreativeResultsUnavailable(rows),
      context,
      definitions: enabledSnapshotDefinitions,
      legacyBridge: false,
    });
  }

  try {
    const [storedDefinitions, mappings] = await Promise.all([
      repository.listResultDefinitions(),
      repository.listResultMappings(),
    ]);
    const enabledDefinitions = hydrateResultDefinitions({
      definitions: storedDefinitions,
      mappings,
    }).filter((definition) => definition.enabled);
    const resultMappingVersion =
      computeResultMappingVersion(mappings);
    const exactCampaignMetaId = campaignMetaId?.trim() || undefined;
    const baseFilters = {
      connectionId: snapshot.connection.connectionId,
      adAccountIds: requestedAccountIds,
      objectiveKeys: [context.objectiveKey],
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
      resultMappingVersion,
    } as const;
    const actualResults =
      await repository.getCanonicalCreativeFamilyResultTotals({
        ...baseFilters,
        dateFrom,
        dateTo,
        ...(exactCampaignMetaId
          ? { campaignMetaIds: [exactCampaignMetaId] }
          : {}),
      });
    const selectedDefinition =
      context.primaryResultKey
        ? enabledDefinitions.find(
            (definition) =>
              definition.canonicalKey ===
                context.primaryResultKey &&
              definition.objectiveKeys.includes(
                context.objectiveKey,
              ),
          )
        : null;
    const needsBenchmark =
      !!selectedDefinition &&
      selectedDefinition.efficiencyMetric !== "none" &&
      context.currencyMode === "single";
    let benchmarkResults: CanonicalCreativeFamilyResultTotals =
      actualResults;
    let benchmarkPerformance: AccountCreativePerformance[] = [];
    if (needsBenchmark) {
      const benchmarkFrom = benchmarkDateFrom(
        dateTo,
        settings.benchmarkWindowDays,
      );
      const [resultBatch, performanceBatches] =
        await Promise.all([
          repository.getCanonicalCreativeFamilyResultTotals({
            ...baseFilters,
            dateFrom: benchmarkFrom,
            dateTo,
          }),
          mapAccountBatches(
            requestedAccountIds,
            async (selectedAccountId) => ({
              adAccountMetaId: selectedAccountId,
              items: (
                await loadPerformance(
                  repository,
                  snapshot.connection!.connectionId,
                  benchmarkFrom,
                  dateTo,
                  effectiveCurrency,
                  selectedAccountId,
                  undefined,
                  context.attributionSettingKey,
                  context.actionReportTime,
                  context.syncVersion,
                  objectiveDatabaseKeys(context.objectiveKey),
                )
              ).items,
            }),
          ),
        ]);
      benchmarkResults = resultBatch;
      benchmarkPerformance = performanceBatches;
    }
    const fatigueRange = needsBenchmark
      ? splitFatigueComparisonRange(dateFrom, dateTo)
      : null;
    let fatigueComparison:
      | CreativeFamilyFatigueComparison
      | undefined;
    if (fatigueRange) {
      const loadFatiguePeriod = async ({
        dateFrom: periodFrom,
        dateTo: periodTo,
        days,
      }: {
        dateFrom: string;
        dateTo: string;
        days: number;
      }) => {
        const [results, performance] = await Promise.all([
          repository.getCanonicalCreativeFamilyResultTotals({
            ...baseFilters,
            dateFrom: periodFrom,
            dateTo: periodTo,
            ...(exactCampaignMetaId
              ? { campaignMetaIds: [exactCampaignMetaId] }
              : {}),
          }),
          mapAccountBatches(
            requestedAccountIds,
            async (selectedAccountId) => ({
              adAccountMetaId: selectedAccountId,
              items: (
                await loadPerformance(
                  repository,
                  snapshot.connection!.connectionId,
                  periodFrom,
                  periodTo,
                  effectiveCurrency,
                  selectedAccountId,
                  exactCampaignMetaId,
                  context.attributionSettingKey,
                  context.actionReportTime,
                  context.syncVersion,
                  objectiveDatabaseKeys(context.objectiveKey),
                )
              ).items,
            }),
          ),
        ]);
        return { results, performance, days };
      };
      const [earlier, later] = await Promise.all([
        loadFatiguePeriod(fatigueRange.earlier),
        loadFatiguePeriod(fatigueRange.later),
      ]);
      fatigueComparison = {
        earlier,
        later,
        windowDays: fatigueRange.windowDays,
      };
    }
    const accountBusinessIds = Object.fromEntries(
      (
        snapshot.reportingScope?.available.adAccounts ?? []
      ).map((account) => [
        account.id,
        account.businessIds,
      ]),
    );
    const accountNames = Object.fromEntries(
      snapshot.assets
        .filter((asset) => asset.kind === "Ad Account")
        .map((asset) => [asset.id, asset.name]),
    );
    const businessNames = Object.fromEntries(
      snapshot.assets
        .filter((asset) => asset.kind === "Business")
        .map((asset) => [asset.id, asset.name]),
    );
    const enriched = enrichCreativeFamiliesWithCanonicalResults({
      rows,
      actualResults,
      benchmarkResults,
      benchmarkPerformance,
      assetFamilyIds: Object.fromEntries(
        libraryItems.map((item) => [
          item.creativeAssetId,
          item.creativeFamilyId ??
            createCreativeFamilyIdentity({
              assetKey: item.assetKey,
              internalStableIdentifier:
                item.creativeAssetId,
            }).creativeFamilyId,
        ]),
      ),
      accountBusinessIds,
      context,
      definitions: enabledDefinitions,
      benchmarkWindowDays: settings.benchmarkWindowDays,
      fatigueComparison,
      labels: {
        accountNames,
        businessNames,
        selectedScope: `${requestedAccountIds.length} Ad Account đã chọn`,
      },
    });
    return withCanonicalCreativeResultValues({
      rows: enriched,
      context,
      definitions: enabledDefinitions,
      legacyBridge: false,
    });
  } catch {
    return withCanonicalCreativeResultValues({
      rows: markLiveCanonicalCreativeResultsUnavailable(rows),
      context,
      definitions: enabledSnapshotDefinitions,
      legacyBridge: false,
    });
  }
}

function canonicalTrendEfficiency({
  definition,
  result,
  spend,
  linkClicks,
}: {
  definition: ResultDefinition;
  result: number;
  spend: number;
  linkClicks: number;
}) {
  if (definition.efficiencyMetric === "cost_per_result") {
    return result > 0 ? spend / result : null;
  }
  if (definition.efficiencyMetric === "rate") {
    return linkClicks > 0 ? (result / linkClicks) * 100 : null;
  }
  if (definition.efficiencyMetric === "roas") {
    return spend > 0 ? result / spend : null;
  }
  return null;
}

function mapCanonicalOverviewTrend({
  rows,
  context,
  definitions,
}: {
  rows: readonly DatabaseCanonicalResultTrendPoint[];
  context: ReportingContext;
  definitions: readonly ResultDefinition[];
}) {
  const definitionsByKey = new Map(
    definitions
      .filter(
        (definition) =>
          definition.enabled &&
          definition.objectiveKeys.includes(context.objectiveKey),
      )
      .map((definition) => [definition.canonicalKey, definition]),
  );
  const grouped = new Map<
    string,
    {
      date: string;
      currency: string;
      spend: number;
      impressions: number;
      linkClicks: number;
      hasDelivery: boolean;
      resultValues: Record<string, number>;
    }
  >();

  for (const row of rows) {
    if (row.objectiveKey !== context.objectiveKey) continue;
    const groupKey = `${row.metricDate}\u001f${row.currency}`;
    const group = grouped.get(groupKey) ?? {
      date: row.metricDate,
      currency: row.currency,
      spend: 0,
      impressions: 0,
      linkClicks: 0,
      hasDelivery: false,
      resultValues: {},
    };
    group.spend = Math.max(group.spend, row.dailySpend);
    if (row.metricSource === "delivery") {
      group.hasDelivery = true;
      if (row.canonicalResultKey === "impressions") {
        group.impressions += row.value;
      }
      if (row.canonicalResultKey === "link_click") {
        group.linkClicks += row.value;
      }
    }

    const definition = definitionsByKey.get(
      row.canonicalResultKey,
    );
    if (
      definition &&
      row.metricSource ===
        resolveReportingResultMetricSource(definition)
    ) {
      group.resultValues[row.canonicalResultKey] =
        (group.resultValues[row.canonicalResultKey] ?? 0) +
        row.value;
    }
    grouped.set(groupKey, group);
  }

  return [...grouped.values()]
    .filter(
      (group) =>
        group.hasDelivery || Object.keys(group.resultValues).length > 0,
    )
    .map((group) => ({
      date: group.date,
      currency: group.currency,
      spend: group.spend,
      impressions: group.impressions,
      linkClicks: group.linkClicks,
      resultValues: group.resultValues,
      efficiencyValues: Object.fromEntries(
        Object.entries(group.resultValues).map(
          ([canonicalKey, result]) => [
            canonicalKey,
            canonicalTrendEfficiency({
              definition: definitionsByKey.get(canonicalKey)!,
              result,
              spend: group.spend,
              linkClicks: group.linkClicks,
            }),
          ],
        ),
      ),
    }))
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.currency.localeCompare(right.currency),
    );
}

export async function getCreativeRowsForReport({
  snapshot,
  dateFrom,
  dateTo,
  accountMetaId,
  accountMetaIds,
  campaignMetaId,
  currency,
  attributionWindow,
  actionReportTime,
  syncVersion,
  reportContext,
}: {
  snapshot: ApplicationSnapshot;
  dateFrom: string;
  dateTo: string;
  accountMetaId?: string;
  accountMetaIds?: readonly string[];
  campaignMetaId?: string;
  currency?: string | null;
  attributionWindow?: string;
  actionReportTime?: "impression" | "conversion" | "mixed";
  syncVersion?: string;
  reportContext?: ReportingContext;
}): Promise<{
  creatives: CreativeRow[];
  truncated: boolean;
  delivery: DeliveryPerformanceItem[];
}> {
  const requestedAccountIds =
    accountMetaIds ??
    (accountMetaId?.trim() ? [accountMetaId.trim()] : undefined);
  const exactCampaignMetaId = campaignMetaId?.trim() || undefined;
  const objectiveRawKeys = reportContext
    ? objectiveDatabaseKeys(reportContext.objectiveKey)
    : [];
  if (snapshot.demoMode) {
    const filtered = snapshot.creatives.filter((creative) => {
      if (
        requestedAccountIds &&
        !requestedAccountIds.some((id) =>
          creative.entityLinks?.adAccountIds.includes(id),
        )
      ) {
        return false;
      }
      if (
        exactCampaignMetaId &&
        !creative.entityLinks?.campaignIds.includes(exactCampaignMetaId)
      ) {
        return false;
      }
      if (currency && creative.performance?.currency !== currency) {
        return false;
      }
      return true;
    });
    const isPreviousDemoPeriod = filtered.some(
      (creative) =>
        creative.performance?.dateFrom &&
        dateTo < creative.performance.dateFrom,
    );
    const periodCreatives = isPreviousDemoPeriod
        ? filtered.map((creative) => {
            if (!creative.performance) return creative;
            const spend = creative.performance.spend * 0.92;
            const installs = Math.round(
              creative.performance.installs * 0.78,
            );
            const registrations = Math.round(
              creative.performance.registrations * 0.72,
            );
            return {
              ...creative,
              performance: {
                ...creative.performance,
                spend,
                installs,
                registrations,
                cpi: installs > 0 ? spend / installs : null,
                costPerRegistration:
                  registrations > 0 ? spend / registrations : null,
                dateFrom,
                dateTo,
              },
            };
          })
        : filtered;
    const creatives = reportContext
      ? withCanonicalCreativeResultValues({
          rows: periodCreatives,
          context: reportContext,
          definitions: DEFAULT_RESULT_DEFINITIONS,
          legacyBridge: true,
        })
      : periodCreatives;
    return {
      creatives,
      truncated: false,
      delivery: demoDeliveryPerformance(creatives),
    };
  }

  if (
    !snapshot.authenticated ||
    !snapshot.connection ||
    snapshot.connection.status !== "connected"
  ) {
    return {
      creatives: snapshot.creatives,
      truncated: snapshot.creativesTruncated,
      delivery: [],
    };
  }
  const repository = await createTrackerRepository();
  const settings = await repository.getSettings();
  const effectiveCurrency =
    currency === undefined ? settings.reportingCurrency : currency;
  const [libraryResult, performanceGroups, deliveryGroups] = await Promise.all([
    loadCreativeLibrary(
      repository,
      snapshot.connection.connectionId,
      requestedAccountIds,
      exactCampaignMetaId ? [exactCampaignMetaId] : undefined,
    ),
    requestedAccountIds
      ? mapAccountBatches(requestedAccountIds, async (selectedAccountId) => {
          const result = await loadPerformance(
              repository,
              snapshot.connection!.connectionId,
              dateFrom,
              dateTo,
              effectiveCurrency,
              selectedAccountId,
              exactCampaignMetaId,
              attributionWindow,
              actionReportTime,
              syncVersion,
              objectiveRawKeys,
            );
          return {
            adAccountMetaId: selectedAccountId,
            ...result,
          };
        },
        )
      : loadPerformance(
          repository,
          snapshot.connection.connectionId,
          dateFrom,
          dateTo,
          effectiveCurrency,
          undefined,
          exactCampaignMetaId,
          attributionWindow,
          actionReportTime,
          syncVersion,
          objectiveRawKeys,
        ).then((result) => [
          { adAccountMetaId: null, ...result },
        ]),
    requestedAccountIds
      ? mapAccountBatches(requestedAccountIds, (selectedAccountId) =>
          repository.getDeliveryPerformance({
            connectionId: snapshot.connection!.connectionId,
            dateFrom,
            dateTo,
            currency: effectiveCurrency ?? undefined,
            accountMetaId: selectedAccountId,
            campaignMetaId: exactCampaignMetaId,
            attributionWindow: attributionWindow || undefined,
            actionReportTime,
            syncVersion: syncVersion || undefined,
            objectiveRawKeys:
              objectiveRawKeys.length ? objectiveRawKeys : undefined,
          }),
        )
      : repository
          .getDeliveryPerformance({
            connectionId: snapshot.connection.connectionId,
            dateFrom,
            dateTo,
            currency: effectiveCurrency ?? undefined,
            campaignMetaId: exactCampaignMetaId,
            attributionWindow: attributionWindow || undefined,
            actionReportTime,
            syncVersion: syncVersion || undefined,
            objectiveRawKeys:
              objectiveRawKeys.length ? objectiveRawKeys : undefined,
          })
          .then((result) => [result]),
  ]);
  const mergedPerformance = mergeCreativePerformance(
    performanceGroups.map((group) => group.items),
  );
  const performanceResult = {
    items: mergedPerformance.slice(0, MAX_VIEW_ROWS),
    truncated:
      mergedPerformance.length > MAX_VIEW_ROWS ||
      performanceGroups.some((group) => group.truncated),
  };
  const delivery = mergeDeliveryPerformance(deliveryGroups);
  const libraryItems = libraryResult.items.filter(
    (item) =>
      (!requestedAccountIds ||
        requestedAccountIds.some((accountId) =>
          item.adAccountIds?.includes(accountId),
        )) &&
      (!exactCampaignMetaId ||
        item.campaignIds?.includes(exactCampaignMetaId)),
  );
  const coverageRatio =
    snapshot.freshness.syncStatus === "healthy"
      ? 1
      : snapshot.freshness.syncStatus === "partial"
        ? 0.8
        : 0;
  const mappedCreatives = mapCreatives(
    libraryItems,
    performanceResult.items,
    delivery,
    settings,
    dateFrom,
    dateTo,
    snapshot.freshness,
    coverageRatio,
    snapshot.freshness.syncStatus === "partial",
  );
  const creatives = reportContext
    ? await enrichLiveCreativeRowsForReport({
        snapshot,
        repository,
        settings,
        rows: mappedCreatives,
        libraryItems,
        requestedAccountIds,
        context: reportContext,
        dateFrom,
        dateTo,
        effectiveCurrency,
        campaignMetaId: exactCampaignMetaId,
      })
    : mappedCreatives;
  return {
    creatives,
    truncated: libraryResult.truncated || performanceResult.truncated,
    delivery,
  };
}

function demoDeliveryPerformance(
  creatives: readonly CreativeRow[],
): DeliveryPerformanceItem[] {
  const rows = new Map<string, DeliveryPerformanceItem>();
  for (const creative of creatives) {
    const performance = creative.performance;
    if (!performance) continue;
    const operatingSystem =
      creative.platform === "Android"
        ? "ANDROID"
        : creative.platform === "iOS"
          ? "IOS"
          : "UNKNOWN";
    const key = `${operatingSystem}|${performance.currency}`;
    const current = rows.get(key) ?? {
      operatingSystem,
      currency: performance.currency,
      spend: 0,
      impressions: 0,
      linkClicks: 0,
      installs: 0,
      registrations: 0,
      video3sViews: 0,
      video100Views: 0,
      metricDays: 0,
    };
    current.spend += performance.spend;
    current.impressions += performance.impressions;
    current.linkClicks +=
      performance.linkCtr === null
        ? 0
        : (performance.linkCtr / 100) * performance.impressions;
    current.installs += performance.installs;
    current.registrations += performance.registrations;
    current.video3sViews +=
      performance.hookRate === null
        ? 0
        : (performance.hookRate / 100) * performance.impressions;
    current.video100Views +=
      performance.holdRate === null
        ? 0
        : (performance.holdRate / 100) *
          Math.max(
            0,
            (performance.hookRate ?? 0) / 100 *
              performance.impressions,
          );
    current.metricDays = Math.max(
      current.metricDays,
      Math.round(
        (new Date(`${performance.dateTo}T00:00:00.000Z`).getTime() -
          new Date(`${performance.dateFrom}T00:00:00.000Z`).getTime()) /
          86_400_000,
      ) + 1,
    );
    rows.set(key, current);
  }
  return [...rows.values()];
}

export async function getDeliveryForReport({
  snapshot,
  dateFrom,
  dateTo,
  accountMetaId,
  accountMetaIds,
  campaignMetaId,
  currency,
  attributionWindow,
  actionReportTime,
  syncVersion,
  reportContext,
}: {
  snapshot: ApplicationSnapshot;
  dateFrom: string;
  dateTo: string;
  accountMetaId?: string;
  accountMetaIds?: readonly string[];
  campaignMetaId?: string;
  currency?: string | null;
  attributionWindow?: string;
  actionReportTime?: "impression" | "conversion" | "mixed";
  syncVersion?: string;
  reportContext?: ReportingContext;
}): Promise<DeliveryPerformanceItem[]> {
  const requestedAccountIds =
    accountMetaIds ??
    (accountMetaId?.trim() ? [accountMetaId.trim()] : undefined);
  const exactCampaignMetaId = campaignMetaId?.trim() || undefined;
  const objectiveRawKeys = reportContext
    ? objectiveDatabaseKeys(reportContext.objectiveKey)
    : [];
  if (snapshot.demoMode) {
    const report = await getCreativeRowsForReport({
      snapshot,
      dateFrom,
      dateTo,
      accountMetaId,
      accountMetaIds,
      campaignMetaId: exactCampaignMetaId,
      currency,
      attributionWindow,
      actionReportTime,
      syncVersion,
      reportContext,
    });
    return report.delivery;
  }
  if (
    !snapshot.authenticated ||
    !snapshot.connection ||
    snapshot.connection.status !== "connected"
  ) {
    return [];
  }

  const repository = await createTrackerRepository();
  const settings = await repository.getSettings();
  const effectiveCurrency =
    currency === undefined ? settings.reportingCurrency : currency;
  const groups = requestedAccountIds
    ? await mapAccountBatches(
        requestedAccountIds,
        (selectedAccountId) =>
          repository.getDeliveryPerformance({
            connectionId: snapshot.connection!.connectionId,
            dateFrom,
            dateTo,
            currency: effectiveCurrency ?? undefined,
            accountMetaId: selectedAccountId,
            campaignMetaId: exactCampaignMetaId,
            attributionWindow: attributionWindow || undefined,
            actionReportTime,
            syncVersion: syncVersion || undefined,
            objectiveRawKeys:
              objectiveRawKeys.length ? objectiveRawKeys : undefined,
          }),
      )
    : [
        await repository.getDeliveryPerformance({
          connectionId: snapshot.connection.connectionId,
          dateFrom,
          dateTo,
          currency: effectiveCurrency ?? undefined,
          campaignMetaId: exactCampaignMetaId,
          attributionWindow: attributionWindow || undefined,
          actionReportTime,
          syncVersion: syncVersion || undefined,
          objectiveRawKeys:
            objectiveRawKeys.length ? objectiveRawKeys : undefined,
        }),
      ];
  return mergeDeliveryPerformance(groups);
}

/**
 * Returns the exact entity-level delivery rows needed by the compact Overview
 * Meta Breakdown. Unlike the legacy demo summary, it never derives an Ad
 * Account, Campaign, Placement or Meta Platform allocation from Creative
 * aggregates. Missing detail therefore remains explicitly unavailable.
 */
export async function getMetaBreakdownForReport({
  snapshot,
  context,
  campaignMetaId,
  repository: suppliedRepository,
}: {
  snapshot: ApplicationSnapshot;
  context: ReportingContext;
  campaignMetaId?: string;
  repository?: Pick<TrackerRepository, "getMetaBreakdownMetrics">;
}): Promise<MetaBreakdownModel> {
  if (context.currencyMode !== "single" || !context.currency) {
    return unavailableMetaBreakdown("split_currency");
  }
  if (
    snapshot.demoMode ||
    !snapshot.authenticated ||
    !snapshot.connection ||
    snapshot.connection.status !== "connected" ||
    context.adAccountIds.length === 0 ||
    !context.syncVersion ||
    context.syncVersion === "latest"
  ) {
    return unavailableMetaBreakdown("detail_unavailable");
  }

  const exactCampaignMetaId = campaignMetaId?.trim();
  try {
    const repository =
      suppliedRepository ?? (await createTrackerRepository());
    const rows: MetaBreakdownMetricRow[] =
      await repository.getMetaBreakdownMetrics({
        connectionId: snapshot.connection.connectionId,
        dateFrom: context.dateFrom,
        dateTo: context.dateTo,
        adAccountMetaIds: context.adAccountIds,
        ...(exactCampaignMetaId
          ? { campaignMetaIds: [exactCampaignMetaId] }
          : {}),
        currency: context.currency,
        attributionWindow: context.attributionSettingKey,
        actionReportTime: context.actionReportTime,
        syncVersion: context.syncVersion,
        objectiveRawKeys: objectiveDatabaseKeys(context.objectiveKey),
        objectiveMappings: DEFAULT_OBJECTIVE_REGISTRY.map((objective) => ({
          objectiveKey: objective.key,
          rawObjectiveKeys: objective.rawObjectiveKeys,
        })),
      });
    return buildMetaBreakdown(rows);
  } catch {
    // A failed detail read is not a zero-delivery distribution.
    return unavailableMetaBreakdown("detail_unavailable");
  }
}

function unavailableLiveDeliverySummary(
  selectedAdAccountMetaIds: readonly string[],
): LiveDeliverySummary {
  const selectedAccountCount = new Set(
    selectedAdAccountMetaIds.map((value) => value.trim()).filter(Boolean),
  ).size;
  const unavailableMetric = {
    value: null,
    state: "unavailable" as const,
    coverage: {
      includedAccounts: 0,
      selectedAccounts: selectedAccountCount,
    },
  };

  return {
    inventoryObservedAt: null,
    reportingSnapshot: {
      syncVersion: null,
      publishedAt: null,
      state: "unavailable",
    },
    latestRun: {
      status: null,
      finishedAt: null,
    },
    state: "unavailable",
    metricDateMin: null,
    metricDateMax: null,
    selectedAccountCount,
    inventoryReadyAccountCount: 0,
    deliveryEligibleAccountCount: 0,
    deliveryReadyAccountCount: 0,
    accounts: [],
    activeCampaigns: unavailableMetric,
    activeAdSets: unavailableMetric,
    activeAds: unavailableMetric,
    activeAdsComparableForDelivery: unavailableMetric,
    activeDeliveringAds: unavailableMetric,
    activeWithoutDelivery: unavailableMetric,
    mappedActiveCreativeFamilies: unavailableMetric,
    mappingCoverage: {
      activeAdsTotal: 0,
      activeAdsWithCreativeFamily: 0,
      percent: null,
    },
  };
}

/**
 * Reads the operational, current-delivery snapshot for the exact final account
 * scope. It deliberately ignores historical report filters such as date,
 * currency, objective and selected report sync version.
 */
export async function getLiveDeliveryForReport({
  snapshot,
  context,
  repository: suppliedRepository,
}: {
  snapshot: ApplicationSnapshot;
  context: ReportingContext;
  repository?: Pick<TrackerRepository, "getLiveDeliverySummary">;
}): Promise<LiveDeliverySummary> {
  const selectedAdAccountMetaIds = context.adAccountIds;
  if (
    snapshot.demoMode ||
    !snapshot.authenticated ||
    !snapshot.connection ||
    snapshot.connection.status !== "connected"
  ) {
    return unavailableLiveDeliverySummary(selectedAdAccountMetaIds);
  }

  try {
    const repository =
      suppliedRepository ?? (await createTrackerRepository());
    return await repository.getLiveDeliverySummary({
      connectionId: snapshot.connection.connectionId,
      selectedAdAccountMetaIds,
      freshnessThresholdDays: 2,
    });
  } catch {
    // Preserve an explicit unavailable state. A failed operational read must
    // never look like a verified zero in the Overview status rail.
    return unavailableLiveDeliverySummary(selectedAdAccountMetaIds);
  }
}

export function buildApplicationResultMetrics({
  context,
  delivery,
  canonicalResults,
  objectiveSpendByObjective,
  definitions = DEFAULT_RESULT_DEFINITIONS,
  periodReach = null,
}: {
  context: ReportingContext;
  delivery: readonly DeliveryPerformanceItem[];
  canonicalResults?: readonly CanonicalResultValue[];
  objectiveSpendByObjective?: Readonly<Record<string, number | null>>;
  definitions?: readonly ResultDefinition[];
  periodReach?: number | null;
}): DynamicResultMetricsModel {
  const deliverySummary = summarizeDelivery(delivery);
  const impressions = delivery.reduce(
    (sum, item) => sum + item.impressions,
    0,
  );
  const linkClicks = delivery.reduce(
    (sum, item) => sum + item.linkClicks,
    0,
  );
  const legacyValues = new Map<string, number | null>([
    ["impressions", impressions],
    ["link_click", linkClicks],
    ["install", deliverySummary.installs],
    ["complete_registration", deliverySummary.registrations],
  ]);
  const rawValues =
    canonicalResults ??
    definitions.flatMap((definition) =>
      definition.objectiveKeys.map((objectiveKey) => {
        const value = legacyValues.get(definition.canonicalKey) ?? null;
        return {
          canonicalKey: definition.canonicalKey,
          objectiveKey,
          value,
          configured: true,
          hasData: value !== null && value > 0,
          ...(context.objectiveKey === objectiveKey &&
          deliverySummary.singleCurrency
            ? { spend: deliverySummary.singleCurrency.spend }
            : {}),
        } satisfies CanonicalResultValue;
      }),
    );
  const values = withDeliveryBackedResultValues({
    values: rawValues,
    objectiveKey: context.objectiveKey,
    impressions,
    reach: periodReach,
    linkClicks,
  });
  const purchaseValue =
    values.find(
      (value) =>
        value.canonicalKey === "purchase_value" &&
        (context.objectiveKey === "all" ||
          value.objectiveKey === context.objectiveKey),
    )?.value ?? null;

  return buildDynamicResultMetrics({
    context,
    definitions,
    canonicalResults: values,
    objectiveSpendByObjective,
    spend: deliverySummary.singleCurrency?.spend ?? 0,
    impressions,
    reach: periodReach,
    clicks: linkClicks,
    value: purchaseValue,
  });
}

export type ApplicationCanonicalResultData = {
  definitions: ResultDefinition[];
  values: CanonicalResultValue[];
  objectiveSpendByObjective: Record<string, number | null>;
  periodReach: number | null;
  periodReachUnavailableReason: string | null;
  state: "demo_legacy_bridge" | "live" | "unavailable";
  warning: string | null;
};

/**
 * Reads normalized, snapshot-pinned Meta result facts for the exact reporting
 * context. Live callers must pass the returned values (including an empty
 * array) to `buildApplicationResultMetrics`; an empty live result set must not
 * fall back to the legacy Install columns.
 */
export async function getCanonicalResultsForReport({
  snapshot,
  context,
  campaignMetaIds,
  repository: suppliedRepository,
}: {
  snapshot: ApplicationSnapshot;
  context: ReportingContext;
  campaignMetaIds?: readonly string[];
  repository?: TrackerRepository;
}): Promise<ApplicationCanonicalResultData> {
  if (snapshot.demoMode) {
    return {
      definitions: [...snapshot.resultDefinitions],
      values: [],
      objectiveSpendByObjective: {},
      periodReach: null,
      periodReachUnavailableReason: "demo_period_reach_not_published",
      state: "demo_legacy_bridge",
      warning: null,
    };
  }
  if (
    !snapshot.authenticated ||
    !snapshot.connection ||
    snapshot.connection.status !== "connected" ||
    context.adAccountIds.length === 0 ||
    !context.syncVersion ||
    context.syncVersion === "latest"
  ) {
    return {
      definitions: [...snapshot.resultDefinitions],
      values: [],
      objectiveSpendByObjective: {},
      periodReach: null,
      periodReachUnavailableReason: "exact_snapshot_unavailable",
      state: "unavailable",
      warning:
        "Kết quả chuẩn hóa chưa khả dụng cho snapshot báo cáo hiện tại.",
    };
  }

  try {
    const repository =
      suppliedRepository ?? (await createTrackerRepository());
    const [storedDefinitions, mappings] = await Promise.all([
      repository.listResultDefinitions(),
      repository.listResultMappings(),
    ]);
    if (storedDefinitions.length === 0) {
      throw new Error("Result registry returned no stored definitions.");
    }
    const enabledDefinitions = hydrateResultDefinitions({
      definitions: storedDefinitions,
      mappings,
    }).filter((definition) => definition.enabled);
    const canonicalFilters = {
      connectionId: snapshot.connection.connectionId,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      adAccountIds: context.adAccountIds,
      ...(campaignMetaIds === undefined ? {} : { campaignMetaIds }),
      ...(context.objectiveKey === "all"
        ? {}
        : { objectiveKeys: [context.objectiveKey] }),
      objectiveMappings: DEFAULT_OBJECTIVE_REGISTRY.map(
        (objective) => ({
          objectiveKey: objective.key,
          rawObjectiveKeys: objective.rawObjectiveKeys,
        }),
      ),
      ...(context.currency ? { currency: context.currency } : {}),
      attributionWindow: context.attributionSettingKey,
      actionReportTime: context.actionReportTime,
      syncVersion: context.syncVersion,
      resultMappingVersion: computeResultMappingVersion(mappings),
    } as const;
    const normalizedCampaignMetaIds = [
      ...new Set(
        (campaignMetaIds ?? [])
          .map((campaignId) => campaignId.trim())
          .filter(Boolean),
      ),
    ];
    const periodReachPromise =
      normalizedCampaignMetaIds.length === 1
        ? repository.getPeriodReach({
            connectionId: canonicalFilters.connectionId,
            dateFrom: canonicalFilters.dateFrom,
            dateTo: canonicalFilters.dateTo,
            adAccountIds: context.adAccountIds,
            campaignIds: normalizedCampaignMetaIds,
            attributionWindow: canonicalFilters.attributionWindow,
            actionReportTime: canonicalFilters.actionReportTime,
            syncVersion: canonicalFilters.syncVersion,
            resultMappingVersion:
              canonicalFilters.resultMappingVersion,
          })
        : normalizedCampaignMetaIds.length > 1
          ? Promise.resolve({
              available: false as const,
              reason: "multi_campaign_overlap_unsafe" as const,
            })
          : context.objectiveKey === "all"
            ? repository.getPeriodReach({
                connectionId: canonicalFilters.connectionId,
                dateFrom: canonicalFilters.dateFrom,
                dateTo: canonicalFilters.dateTo,
                adAccountIds: context.adAccountIds,
                attributionWindow:
                  canonicalFilters.attributionWindow,
                actionReportTime:
                  canonicalFilters.actionReportTime,
                syncVersion: canonicalFilters.syncVersion,
                resultMappingVersion:
                  canonicalFilters.resultMappingVersion,
              })
            : Promise.resolve({
                available: false as const,
                reason:
                  "objective_scope_exact_reach_unavailable" as const,
              });
    const [totals, periodReach] = await Promise.all([
      repository.getCanonicalResultTotals(canonicalFilters),
      periodReachPromise,
    ]);

    if (!totals.available) {
      return {
        definitions: enabledDefinitions,
        values: [],
        objectiveSpendByObjective: {},
        periodReach: null,
        periodReachUnavailableReason: "exact_snapshot_unavailable",
        state: "unavailable",
        warning:
          totals.reason === "reporting_snapshot_stale"
            ? "Snapshot báo cáo đã cũ; cần đồng bộ lại dữ liệu Meta."
            : "Snapshot báo cáo chưa khả dụng; cần đồng bộ dữ liệu Meta.",
      };
    }

    const definitionByKey = new Map(
      enabledDefinitions.map((definition) => [
        definition.canonicalKey,
        definition,
      ]),
    );
    const spendByObjective = new Map<string, number>();
    for (const item of totals.spendByObjective) {
      const current = spendByObjective.get(item.objectiveKey) ?? 0;
      spendByObjective.set(item.objectiveKey, current + item.spend);
    }
    const objectiveSpendByObjective = Object.fromEntries(
      [...spendByObjective.entries()].map(([objectiveKey, spend]) => [
        objectiveKey,
        context.currencyMode === "single" ? spend : null,
      ]),
    );
    const grouped = new Map<
      string,
      {
        canonicalKey: string;
        objectiveKey: string;
        currencies: Set<string>;
        value: number;
      }
    >();
    for (const item of totals.results) {
      const definition = definitionByKey.get(item.canonicalResultKey);
      if (
        definition &&
        item.metricSource !==
          resolveReportingResultMetricSource(definition)
      ) {
        continue;
      }
      if (
        !definition &&
        item.metricSource === "delivery" &&
        isDeliveryNativeResultKey(item.canonicalResultKey)
      ) {
        continue;
      }
      const key = `${item.objectiveKey}\u0000${item.canonicalResultKey}`;
      const current = grouped.get(key) ?? {
        canonicalKey: item.canonicalResultKey,
        objectiveKey: item.objectiveKey,
        currencies: new Set<string>(),
        value: 0,
      };
      current.currencies.add(item.currency);
      current.value += item.value;
      grouped.set(key, current);
    }

    const values: CanonicalResultValue[] = [];
    for (const definition of enabledDefinitions) {
      for (const objectiveKey of definition.objectiveKeys) {
        if (
          context.objectiveKey !== "all" &&
          objectiveKey !== context.objectiveKey
        ) {
          continue;
        }
        const item = grouped.get(
          `${objectiveKey}\u0000${definition.canonicalKey}`,
        );
        const mixedCurrencyValue =
          definition.unit === "currency" &&
          (item?.currencies.size ?? 0) > 1;
        const value =
          item && !mixedCurrencyValue ? item.value : null;
        values.push({
          canonicalKey: definition.canonicalKey,
          objectiveKey,
          value,
          configured: true,
          hasData: value !== null,
          ...(context.currencyMode === "single"
            ? {
                spend:
                  spendByObjective.get(objectiveKey) ?? null,
              }
            : {}),
        });
      }
    }

    // Preserve an auditable unavailable state for facts whose definition was
    // disabled or removed after the snapshot. They must never be silently
    // relabeled under another Result.
    const unknownResultKeys = [...grouped.values()].filter(
      (item) => !definitionByKey.has(item.canonicalKey),
    );
    const warning =
      unknownResultKeys.length > 0
        ? "Một số Result trong snapshot không còn định nghĩa đang bật."
        : null;
    return {
      definitions: enabledDefinitions,
      values,
      objectiveSpendByObjective,
      periodReach: periodReach.available ? periodReach.reach : null,
      periodReachUnavailableReason: periodReach.available
        ? null
        : periodReach.reason,
      state: "live",
      warning,
    };
  } catch (error) {
    console.error("[canonical-results-fallback]", error);
    return {
      definitions: [...snapshot.resultDefinitions],
      values: [],
      objectiveSpendByObjective: {},
      periodReach: null,
      periodReachUnavailableReason: "exact_snapshot_unavailable",
      state: "unavailable",
      warning:
        "Kết quả chuẩn hóa chưa khả dụng; cần đồng bộ lại dữ liệu Meta.",
    };
  }
}

/**
 * Loads one Creative Family by its canonical database ID before any list
 * limit is applied. The optional repository lets owner-authenticated API
 * routes reuse the repository already bound to their verified session.
 */
export async function getCreativeFamilyRowsForReport({
  snapshot,
  creativeFamilyId,
  dateFrom,
  dateTo,
  currency,
  accountMetaId,
  accountMetaIds,
  campaignMetaId,
  attributionWindow,
  actionReportTime,
  syncVersion,
  reportContext,
  repository: suppliedRepository,
}: {
  snapshot: ApplicationSnapshot;
  creativeFamilyId: string;
  dateFrom: string;
  dateTo: string;
  currency?: string;
  accountMetaId?: string;
  accountMetaIds?: readonly string[];
  campaignMetaId?: string;
  attributionWindow?: string;
  actionReportTime?: "impression" | "conversion" | "mixed";
  syncVersion?: string;
  reportContext?: ReportingContext;
  repository?: TrackerRepository;
}): Promise<CreativeRow[] | null> {
  const requestedAccountIds =
    accountMetaIds ??
    (accountMetaId?.trim() ? [accountMetaId.trim()] : undefined);
  const exactCampaignMetaId = campaignMetaId?.trim() || undefined;
  const objectiveRawKeys = reportContext
    ? objectiveDatabaseKeys(reportContext.objectiveKey)
    : [];
  if (requestedAccountIds?.length === 0) return null;
  if (snapshot.demoMode) {
    const rows = snapshot.creatives.filter(
      (row) =>
        row.creativeFamilyId === creativeFamilyId &&
        (!requestedAccountIds ||
          requestedAccountIds.some((accountId) =>
            row.entityLinks?.adAccountIds.includes(accountId),
          )) &&
        (!exactCampaignMetaId ||
          row.entityLinks?.campaignIds.includes(exactCampaignMetaId)),
    );
    if (!rows.length) return null;
    return reportContext
      ? withCanonicalCreativeResultValues({
          rows,
          context: reportContext,
          definitions: DEFAULT_RESULT_DEFINITIONS,
          legacyBridge: true,
        })
      : rows;
  }

  if (
    !snapshot.authenticated ||
    !snapshot.connection ||
    snapshot.connection.status !== "connected"
  ) {
    return null;
  }

  const repository =
    suppliedRepository ?? (await createTrackerRepository());
  const libraryItem = await repository.getCreativeFamilyById(
    snapshot.connection.connectionId,
    creativeFamilyId,
  );
  if (!libraryItem) return null;
  if (
    requestedAccountIds &&
    !requestedAccountIds.some((accountId) =>
      libraryItem.adAccountIds?.includes(accountId),
    )
  ) {
    return null;
  }
  if (
    exactCampaignMetaId &&
    !libraryItem.campaignIds?.includes(exactCampaignMetaId)
  ) {
    return null;
  }

  const settings = await repository.getSettings();
  const reportingCurrency =
    currency?.trim() || settings.reportingCurrency || undefined;
  const [performanceGroups, deliveryGroups] = await Promise.all([
    requestedAccountIds
      ? mapAccountBatches(requestedAccountIds, (selectedAccountId) =>
          repository.listCreativePerformance({
            connectionId: snapshot.connection!.connectionId,
            creativeFamilyId,
            dateFrom,
            dateTo,
            currency: reportingCurrency,
            accountMetaId: selectedAccountId,
            campaignMetaId: exactCampaignMetaId,
            attributionWindow: attributionWindow?.trim() || undefined,
            actionReportTime,
            syncVersion: syncVersion?.trim() || undefined,
            objectiveRawKeys:
              objectiveRawKeys.length ? objectiveRawKeys : undefined,
            limit: 200,
            offset: 0,
          }),
        )
      : repository
          .listCreativePerformance({
            connectionId: snapshot.connection.connectionId,
            creativeFamilyId,
            dateFrom,
            dateTo,
            currency: reportingCurrency,
            campaignMetaId: exactCampaignMetaId,
            attributionWindow: attributionWindow?.trim() || undefined,
            actionReportTime,
            syncVersion: syncVersion?.trim() || undefined,
            objectiveRawKeys:
              objectiveRawKeys.length ? objectiveRawKeys : undefined,
            limit: 200,
            offset: 0,
          })
          .then((items) => [items]),
    requestedAccountIds
      ? mapAccountBatches(requestedAccountIds, (selectedAccountId) =>
          repository.getDeliveryPerformance({
            connectionId: snapshot.connection!.connectionId,
            dateFrom,
            dateTo,
            currency: reportingCurrency,
            accountMetaId: selectedAccountId,
            campaignMetaId: exactCampaignMetaId,
            attributionWindow: attributionWindow?.trim() || undefined,
            actionReportTime,
            syncVersion: syncVersion?.trim() || undefined,
            objectiveRawKeys:
              objectiveRawKeys.length ? objectiveRawKeys : undefined,
          }),
        )
      : repository
          .getDeliveryPerformance({
            connectionId: snapshot.connection.connectionId,
            dateFrom,
            dateTo,
            currency: reportingCurrency,
            campaignMetaId: exactCampaignMetaId,
            attributionWindow: attributionWindow?.trim() || undefined,
            actionReportTime,
            syncVersion: syncVersion?.trim() || undefined,
            objectiveRawKeys:
              objectiveRawKeys.length ? objectiveRawKeys : undefined,
          })
          .then((items) => [items]),
  ]);
  const performance = mergeCreativePerformance(performanceGroups);
  const delivery = mergeDeliveryPerformance(deliveryGroups);
  const coverageRatio =
    snapshot.freshness.syncStatus === "healthy"
      ? 1
      : snapshot.freshness.syncStatus === "partial"
        ? 0.8
        : 0;

  const rows = mapCreatives(
    [libraryItem],
    performance,
    delivery,
    settings,
    dateFrom,
    dateTo,
    snapshot.freshness,
    coverageRatio,
    snapshot.freshness.syncStatus === "partial",
  );
  return reportContext
    ? enrichLiveCreativeRowsForReport({
        snapshot,
        repository,
        settings,
        rows,
        libraryItems: [libraryItem],
        requestedAccountIds,
        context: reportContext,
        dateFrom,
        dateTo,
        effectiveCurrency: reportingCurrency ?? null,
        campaignMetaId: exactCampaignMetaId,
      })
    : rows;
}

export async function getOverviewTrendForReport({
  snapshot,
  dateFrom,
  dateTo,
  accountMetaId,
  accountMetaIds,
  campaignMetaId,
  currency,
  attributionWindow,
  actionReportTime,
  syncVersion,
  reportContext,
}: {
  snapshot: ApplicationSnapshot;
  dateFrom: string;
  dateTo: string;
  accountMetaId?: string;
  accountMetaIds?: readonly string[];
  campaignMetaId?: string;
  currency?: string | null;
  attributionWindow?: string;
  actionReportTime?: "impression" | "conversion" | "mixed";
  syncVersion?: string;
  reportContext?: ReportingContext;
}) {
  const requestedAccountIds =
    accountMetaIds ??
    (accountMetaId?.trim() ? [accountMetaId.trim()] : undefined);
  if (snapshot.demoMode) {
    if (requestedAccountIds?.length === 0) return [];
    const start = new Date(`${dateFrom}T00:00:00.000Z`).getTime();
    const end = new Date(`${dateTo}T00:00:00.000Z`).getTime();
    const spanDays = Math.max(
      1,
      Math.round((end - start) / 86_400_000),
    );
    const offsets = [...new Set([0, 0.2, 0.4, 0.6, 0.8, 1].map(
      (ratio) => Math.round(spanDays * ratio),
    ))];
    const points = offsets.map((offset, index) => {
      const date = new Date(start + offset * 86_400_000)
        .toISOString()
        .slice(0, 10);
      return {
        date,
        currency:
          currency === undefined
            ? snapshot.settings.currency ?? "VND"
            : currency ?? snapshot.settings.currency ?? "VND",
        spend: 6_000_000 + index * 350_000,
        impressions: 120_000 + index * 8_000,
        linkClicks: 2_400 + index * 160,
        installs: 245 + index * 24,
        registrations: 122 + index * 13,
      };
    });
    return bridgeLegacyTrendPointsForApp({
      points,
      context: reportContext,
      definitions: DEFAULT_RESULT_DEFINITIONS,
    });
  }

  if (
    !snapshot.authenticated ||
    !snapshot.connection ||
    snapshot.connection.status !== "connected" ||
    !reportContext
  ) {
    return [];
  }

  const exactAccountIds = [
    ...new Set(
      (requestedAccountIds ?? reportContext.adAccountIds)
        .map((accountId) => accountId.trim())
        .filter(Boolean),
    ),
  ];
  const exactSyncVersion =
    syncVersion?.trim() || reportContext.syncVersion;
  if (
    exactAccountIds.length === 0 ||
    !exactSyncVersion ||
    exactSyncVersion === "latest"
  ) {
    return [];
  }

  const exactCurrency =
    currency === undefined
      ? reportContext.currencyMode === "single"
        ? reportContext.currency
        : undefined
      : currency?.trim() || undefined;
  const exactCampaignMetaId = campaignMetaId?.trim();
  const repository = await createTrackerRepository();
  if (reportContext.objectiveKey === "all") {
    const deliveryTrend = await repository.getDeliveryTrend({
      connectionId: snapshot.connection.connectionId,
      dateFrom,
      dateTo,
      adAccountMetaIds: exactAccountIds,
      includeInactiveAccounts: true,
      ...(exactCampaignMetaId ? { campaignMetaId: exactCampaignMetaId } : {}),
      ...(exactCurrency ? { currency: exactCurrency } : {}),
      attributionWindow:
        attributionWindow?.trim() ||
        reportContext.attributionSettingKey,
      actionReportTime:
        actionReportTime ?? reportContext.actionReportTime,
      syncVersion: exactSyncVersion,
    });

    // Result and Reach remain intentionally unavailable for the cross-objective
    // scope. Delivery facts share a single canonical meaning, so they can be
    // grouped by date and currency without fabricating a Result series.
    return deliveryTrend.map((point) => ({
      date: point.metricDate,
      currency: point.currency,
      spend: point.spend,
      impressions: point.impressions,
      linkClicks: point.linkClicks,
      resultValues: {},
      efficiencyValues: {},
    }));
  }
  const mappings = await repository.listResultMappings();
  const batch = await repository.getCanonicalResultTrend({
    connectionId: snapshot.connection.connectionId,
    dateFrom,
    dateTo,
    adAccountIds: exactAccountIds,
    ...(exactCampaignMetaId
      ? { campaignMetaIds: [exactCampaignMetaId] }
      : {}),
    objectiveKeys: [reportContext.objectiveKey],
    objectiveMappings: DEFAULT_OBJECTIVE_REGISTRY.map(
      (objective) => ({
        objectiveKey: objective.key,
        rawObjectiveKeys: objective.rawObjectiveKeys,
      }),
    ),
    ...(exactCurrency ? { currency: exactCurrency } : {}),
    attributionWindow:
      attributionWindow?.trim() ||
      reportContext.attributionSettingKey,
    actionReportTime:
      actionReportTime ?? reportContext.actionReportTime,
    syncVersion: exactSyncVersion,
    resultMappingVersion: computeResultMappingVersion(mappings),
  });
  if (!batch.available) return [];

  return mapCanonicalOverviewTrend({
    rows: batch.results,
    context: reportContext,
    definitions: snapshot.resultDefinitions,
  });
}

function performanceSummary(
  item: CreativePerformanceItem,
  baseline: number | null,
  benchmarkSampleSize: number,
  minimumInstalls: number,
  dateFrom: string,
  dateTo: string,
  freshness: Freshness,
  coverageRatio: number,
  partial: boolean,
): CreativePerformanceSummary {
  const confidence = deriveDataConfidence({
    coverageRatio,
    sampleSize: item.installs,
    minimumSampleSize: minimumInstalls,
    hasRequiredMapping: true,
    isStale:
      freshness.freshnessSeconds !== null &&
      freshness.freshnessSeconds > 60 * 60 * 48,
    isPartial: partial,
  });
  const ratingExplanation = explainCreativeRating({
    installs: item.installs,
    cpi: item.cpi,
    osBaselineCpi: baseline,
    minimumInstalls,
    os: canonicalOs(item.operatingSystem),
    format: canonicalFormat(item.assetType),
    currency: item.currency,
    windowDays: Math.max(
      1,
      Math.round(
        (new Date(`${dateTo}T00:00:00.000Z`).getTime() -
          new Date(`${dateFrom}T00:00:00.000Z`).getTime()) /
          86_400_000,
      ) + 1,
    ),
    benchmarkSampleSize,
    confidence,
  });
  return {
    currency: item.currency,
    spend: item.spend,
    impressions: item.impressions,
    dailyReachSum: item.dailyReachSum,
    linkCtr: item.linkCtr,
    installs: item.installs,
    registrations: item.registrations,
    cpi: item.cpi,
    costPerRegistration: item.costPerRegistration,
    hookRate: item.hookRate,
    holdRate: item.holdRate,
    osBaselineCpi: baseline,
    rating: rateCreativeCpi({
      installs: item.installs,
      cpi: item.cpi,
      osBaselineCpi: baseline,
      minimumInstalls,
    }),
    dateFrom,
    dateTo,
    freshness,
    confidence,
    ratingExplanation,
  };
}

function mapCreatives(
  library: readonly CreativeLibraryItem[],
  performance: readonly CreativePerformanceItem[],
  deliveryPerformance: readonly DeliveryPerformanceItem[],
  settings: TrackerSettings,
  dateFrom: string,
  dateTo: string,
  freshness: Freshness,
  coverageRatio: number,
  partial: boolean,
) {
  const baselines = computeOsCpiBaselines(deliveryPerformance);
  const scopedBaselines = computeScopedCpiBaselines(
    performance.map((item) => ({
      operatingSystem: item.operatingSystem,
      format: canonicalFormat(item.assetType),
      currency: item.currency,
      spend: item.spend,
      installs: item.installs,
    })),
  );
  const benchmarkSamples = new Map<string, number>();
  for (const item of performance) {
    const key = scopedBaselineKey(
      item.operatingSystem,
      canonicalFormat(item.assetType),
      item.currency,
    );
    benchmarkSamples.set(
      key,
      (benchmarkSamples.get(key) ?? 0) + Math.max(0, item.installs),
    );
  }
  const byAsset = new Map<string, CreativePerformanceItem[]>();
  for (const item of performance) {
    const rows = byAsset.get(item.creativeAssetId) ?? [];
    rows.push(item);
    byAsset.set(item.creativeAssetId, rows);
  }

  return library.flatMap<CreativeRow>((item) => {
    const rows = byAsset.get(item.creativeAssetId) ?? [];
    const common = {
      creativeFamilyId:
        item.creativeFamilyId ??
        createCreativeFamilyIdentity({
          assetKey: item.assetKey,
          internalStableIdentifier: item.creativeAssetId,
        }).creativeFamilyId,
      name: item.name ?? item.assetKey,
      assetKey: item.assetKey,
      aliases: item.creativeCodes,
      format:
        item.assetType === "video"
          ? ("Video" as const)
          : item.assetType === "image"
            ? ("Banner" as const)
            : ("Unknown" as const),
      linkLabel:
        item.activeAdCount > 0
          ? "Đang chạy"
          : item.adCount > 0
            ? "Không chạy"
            : "Chưa liên kết",
      linkCount: item.adCount,
      currentAdCount: item.currentAdCount,
      activeAdCount: item.activeAdCount,
      imageUrl: safeThumbnail(item.thumbnailUrl ?? item.previewUrl),
      duration: formatDuration(item.durationSeconds),
      ratio: ratio(item.width, item.height),
      pageName: item.pageNames[0] ?? null,
      entityLinks: {
        creativeFamilyId:
          item.creativeFamilyId ??
          createCreativeFamilyIdentity({
            assetKey: item.assetKey,
            internalStableIdentifier: item.creativeAssetId,
          }).creativeFamilyId,
        assetId: item.creativeAssetId,
        metaCreativeIds: item.metaCreativeIds ?? [],
        adIds: item.adIds ?? [],
        campaignIds: item.campaignIds ?? [],
        adAccountIds: item.adAccountIds ?? [],
        pageIds: item.pageIds ?? [],
      },
    };

    if (rows.length === 0) {
      return [
        {
          id: `${item.creativeAssetId}:UNKNOWN:none`,
          ...common,
          platform: "Unknown",
          readiness:
            item.activeAdCount > 0
              ? "Chờ phân phối"
              : item.adCount > 0
                ? "Chưa có dữ liệu"
                : "Chưa gắn Ads",
          performanceLabel:
            item.activeAdCount > 0
              ? "Chưa có dữ liệu"
              : item.adCount > 0
                ? "Không có Ads đang chạy"
                : "Mở khóa khi creative được gắn Ads",
          eventMapping: { install: null, registration: null },
          performance: null,
        },
      ];
    }

    return rows.map((metric) => {
      const scopedKey = scopedBaselineKey(
        metric.operatingSystem,
        canonicalFormat(metric.assetType),
        metric.currency,
      );
      const baseline =
        scopedBaselines.get(scopedKey) ??
        baselines.get(
          baselineKey(metric.operatingSystem, metric.currency),
        ) ??
        null;
      return {
        id: `${item.creativeAssetId}:${metric.operatingSystem}:${metric.currency}`,
        ...common,
        platform: platformFromOs(metric.operatingSystem),
        readiness: "Sẵn sàng",
        performanceLabel: "Đã có dữ liệu",
        eventMapping: {
          install: metric.installs > 0 ? true : null,
          registration: metric.registrations > 0 ? true : null,
        },
        performance: performanceSummary(
          metric,
          baseline,
          benchmarkSamples.get(scopedKey) ?? 0,
          settings.minimumInstallThreshold,
          dateFrom,
          dateTo,
          freshness,
          coverageRatio,
          partial,
        ),
      };
    });
  });
}

function setupChecks(input: {
  databaseConfigured: boolean;
  databaseReady: boolean;
  metaConfigured: boolean;
  securityConfigured: boolean;
  legalConfigured: boolean;
  connection: MetaConnectionRecord | null;
  lastInitialSyncAt: string | null;
  reportingTimezone?: string;
}): SetupCheck[] {
  const connectionLifecycle = input.connection
    ? evaluateMetaConnectionLifecycle(input.connection)
    : null;
  const connectionReady =
    input.connection?.status === "connected" &&
    connectionLifecycle !== "needs_reauth";

  return [
    {
      id: "app",
      label: "Ứng dụng đã deploy",
      description: "Next.js đang chạy trong môi trường hiện tại.",
      status: "ready",
    },
    {
      id: "database",
      label: "Database",
      description: input.databaseReady
        ? "Postgres đã sẵn sàng và schema đã cập nhật."
        : input.databaseConfigured
          ? "Đã có DATABASE_URL; schema sẽ tự khởi tạo sau owner gate."
          : "Cài Postgres từ Vercel Marketplace.",
      status: input.databaseReady
        ? "ready"
        : input.databaseConfigured
          ? "warning"
          : "pending",
      actionLabel: input.databaseConfigured ? undefined : "Mở hướng dẫn",
      actionHref: input.databaseConfigured ? undefined : "/setup#database",
    },
    {
      id: "meta",
      label: "Meta App",
      description: input.metaConfigured
        ? "App ID, App Secret và callback origin đã có."
        : "Thêm APP_URL, META_APP_ID và META_APP_SECRET.",
      status: input.metaConfigured ? "ready" : "pending",
      actionLabel: input.metaConfigured ? undefined : "Mở hướng dẫn",
      actionHref: input.metaConfigured ? undefined : "/setup#meta",
    },
    {
      id: "security",
      label: "Khóa bảo mật",
      description: input.securityConfigured
        ? "Encryption, session và owner bootstrap đã có."
        : "Thiết lập encryption, session và owner bootstrap secrets.",
      status: input.securityConfigured ? "ready" : "pending",
      actionLabel: input.securityConfigured ? undefined : "Xem biến môi trường",
      actionHref: input.securityConfigured ? undefined : "/setup#security",
    },
    {
      id: "legal",
      label: "Thông tin pháp lý",
      description: input.legalConfigured
        ? "Tên đơn vị và email quyền riêng tư đã được cấu hình."
        : "Thêm LEGAL_ENTITY_NAME và PRIVACY_CONTACT_EMAIL trước khi kết nối Meta.",
      status: input.legalConfigured ? "ready" : "pending",
      actionLabel: input.legalConfigured ? undefined : "Xem chính sách",
      actionHref: input.legalConfigured ? undefined : "/privacy",
    },
    {
      id: "connection",
      label: "Kết nối chủ sở hữu",
      description: connectionReady
        ? `Đã khóa với ${input.connection?.metaUserName ?? "Meta owner"}.${
            connectionLifecycle === "expiring_soon"
              ? " Token sắp hết hạn."
              : connectionLifecycle === "unknown"
                ? " Chưa xác định được thời hạn token."
                : ""
          }`
        : input.connection
          ? "Kết nối cần xác thực lại trước khi đồng bộ."
        : "Đăng nhập Meta và cấp quyền read-only.",
      status: connectionReady
        ? connectionLifecycle === "healthy"
          ? "ready"
          : "warning"
        : "locked",
      actionLabel: connectionReady ? undefined : "Kết nối Meta",
      actionHref: connectionReady ? undefined : "/connect",
    },
    {
      id: "sync",
      label: "Đồng bộ lần đầu",
      description: input.lastInitialSyncAt
        ? `Hoàn tất ${
            formatTimestamp(
              input.lastInitialSyncAt,
              input.reportingTimezone,
            ) ?? ""
          }.`
        : "Quét BM, tài khoản quảng cáo, Trang và creative.",
      status: input.lastInitialSyncAt ? "ready" : "locked",
    },
  ];
}

function mapSyncRun(
  run: SyncRunRecord,
  reportingTimezone = "Asia/Ho_Chi_Minh",
): SyncRunView {
  const status: SyncRunView["status"] =
    run.status === "succeeded"
      ? "success"
      : run.status === "partial"
        ? "partial"
        : run.status === "failed"
          ? "failed"
          : run.status === "cancelled"
            ? "cancelled"
            : "running";
  const rawWarnings = Array.isArray(run.stats.warnings)
    ? run.stats.warnings
    : [];
  const warnings = rawWarnings.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item)
    ) {
      return [];
    }
    const code =
      typeof item.code === "string" ? item.code.slice(0, 120) : null;
    const message =
      typeof item.message === "string"
        ? item.message.slice(0, 500)
        : null;
    if (!code || !message) return [];
    return [
      {
        code,
        resource:
          typeof item.resource === "string"
            ? item.resource.slice(0, 160)
            : null,
        message,
      },
    ];
  });
  const startedAtIso = run.startedAt ?? run.createdAt;
  const finishedAtIso = run.finishedAt;
  const durationSeconds =
    finishedAtIso && startedAtIso
      ? Math.max(
          0,
          Math.round(
            (new Date(finishedAtIso).getTime() -
              new Date(startedAtIso).getTime()) /
              1_000,
          ),
        )
      : null;
  const kindLabel =
    run.syncKind === "full"
      ? "Đồng bộ toàn bộ"
      : run.syncKind === "assets"
        ? "Đồng bộ tài sản"
        : run.syncKind === "insights"
          ? "Đồng bộ Insights"
          : "Đồng bộ tăng dần";
  const triggerLabel =
    run.triggerSource === "manual"
      ? "Thủ công"
      : run.triggerSource === "cron"
        ? "Lịch chạy"
        : run.triggerSource === "setup"
          ? "Thiết lập"
          : run.triggerSource === "retry"
            ? "Thử lại"
            : "Hệ thống";
  const insightsStats =
    typeof run.stats.insights === "object" &&
    run.stats.insights !== null &&
    !Array.isArray(run.stats.insights)
      ? run.stats.insights
      : null;
  const recordCount =
    insightsStats &&
    typeof insightsStats.metrics_upserted === "number" &&
    Number.isFinite(insightsStats.metrics_upserted)
      ? insightsStats.metrics_upserted
      : null;
  const errorCount =
    insightsStats &&
    typeof insightsStats.unmapped_rows === "number" &&
    Number.isFinite(insightsStats.unmapped_rows)
      ? insightsStats.unmapped_rows
      : null;
  return {
    id: run.syncRunId,
    kind: `${kindLabel} · ${triggerLabel}`,
    status,
    startedAtIso,
    finishedAtIso,
    durationSeconds:
      durationSeconds !== null && Number.isFinite(durationSeconds)
        ? durationSeconds
        : null,
    recordCount,
    errorCount,
    startedAt:
      formatTimestamp(
        run.startedAt ?? run.createdAt,
        reportingTimezone,
      ) ??
      run.startedAt ??
      run.createdAt,
    finishedAt: formatTimestamp(run.finishedAt, reportingTimezone),
    summary:
      status === "failed"
        ? "Đồng bộ thất bại; mở chi tiết để xem nguyên nhân kỹ thuật."
        : warnings.length > 0
          ? `${warnings.length} cảnh báo cần kiểm tra`
          : status === "success"
            ? "Hoàn tất không có cảnh báo"
            : status === "running"
              ? "Đang đồng bộ"
              : "Đồng bộ đã dừng",
    technicalSummary:
      run.errorMessage ??
      (run.currentStage ? `Stage: ${run.currentStage}` : null),
    warnings,
  };
}

function emptyDashboard(
  ownerName: string,
  configuredForLive: boolean,
): DashboardViewModel {
  return {
    ...demoDashboard,
    mode: "setup",
    ownerName,
    connectionLabel: "Chưa kết nối Meta",
    connectionDetail: configuredForLive
      ? "Nhập mã owner để mở Meta OAuth read-only."
      : "Hoàn tất Setup Wizard trước khi kết nối Meta.",
  };
}

function defaultApplicationResultDefinitions(): ResultDefinition[] {
  return DEFAULT_RESULT_DEFINITIONS.filter(
    (definition) => definition.enabled,
  ).map((definition) => ({
    ...definition,
    objectiveKeys: [...definition.objectiveKeys],
    rawActionTypes: [...definition.rawActionTypes],
    ...(definition.rawValueActionTypes
      ? { rawValueActionTypes: [...definition.rawValueActionTypes] }
      : {}),
  }));
}

async function loadApplicationResultDefinitions(
  repository: TrackerRepository,
): Promise<ResultDefinition[]> {
  try {
    const [storedDefinitions, mappings] = await Promise.all([
      repository.listResultDefinitions(),
      repository.listResultMappings(),
    ]);
    if (storedDefinitions.length === 0) {
      throw new Error("Result registry returned no stored definitions.");
    }
    return hydrateResultDefinitions({
      definitions: storedDefinitions,
      mappings,
    }).filter((definition) => definition.enabled);
  } catch (error) {
    console.error("[application-snapshot-result-definitions-fallback]", error);
    return defaultApplicationResultDefinitions();
  }
}

async function loadApplicationContextSnapshot(): Promise<ApplicationSnapshot> {
    const configuration = getRuntimeConfiguration();
    const configuredForLive =
      configuration.databaseConfigured &&
      configuration.metaConfigured &&
      configuration.securityConfigured &&
      configuration.legalConfigured;
    const session = await readPageOwnerSession();
    const authenticated = Boolean(session);

    if (configuration.demoMode) {
      return {
        demoMode: true,
        authenticated,
        configuredForLive,
        connection: null,
        dashboard: demoDashboard,
        assets: demoAssets,
        creatives: demoCreatives,
        creativesTruncated: false,
        syncRuns: demoSyncRuns,
        setupChecks: setupChecks({
          databaseConfigured: configuration.databaseConfigured,
          databaseReady: false,
          metaConfigured: configuration.metaConfigured,
          securityConfigured: configuration.securityConfigured,
          legalConfigured: configuration.legalConfigured,
          connection: null,
          lastInitialSyncAt: null,
        }),
        freshness: demoFreshness,
        reportingScope: defaultAllReportingScope(
          scopeInventoryFromAssets(demoAssets),
        ),
        resultDefinitions: defaultApplicationResultDefinitions(),
        settings: {
          timezone:
            process.env.REPORTING_TIMEZONE ?? "Asia/Ho_Chi_Minh",
          lookbackDays: Number(process.env.SYNC_LOOKBACK_DAYS ?? 30),
          currency: "VND",
          compareDefault: "previous_period",
          minimumInstallThreshold: 20,
          installActionTypes: DEFAULT_INSTALL_ACTION_TYPES,
          registrationActionTypes: DEFAULT_REGISTRATION_ACTION_TYPES,
          metricDisplayPresets: { version: 1, presets: {} },
          updatedAt: null,
        },
      };
    }

    if (!authenticated || !configuration.databaseConfigured) {
      return {
        demoMode: false,
        authenticated,
        configuredForLive,
        connection: null,
        dashboard: emptyDashboard("Owner", configuredForLive),
        assets: [],
        creatives: [],
        creativesTruncated: false,
        syncRuns: [],
        setupChecks: setupChecks({
          databaseConfigured: configuration.databaseConfigured,
          databaseReady: false,
          metaConfigured: configuration.metaConfigured,
          securityConfigured: configuration.securityConfigured,
          legalConfigured: configuration.legalConfigured,
          connection: null,
          lastInitialSyncAt: null,
        }),
        freshness: EMPTY_FRESHNESS,
        reportingScope: null,
        resultDefinitions: defaultApplicationResultDefinitions(),
        settings: {
          timezone:
            process.env.REPORTING_TIMEZONE ?? "Asia/Ho_Chi_Minh",
          lookbackDays: Number(process.env.SYNC_LOOKBACK_DAYS ?? 30),
          currency: null,
          compareDefault: "previous_period",
          minimumInstallThreshold: 20,
          installActionTypes: DEFAULT_INSTALL_ACTION_TYPES,
          registrationActionTypes: DEFAULT_REGISTRATION_ACTION_TYPES,
          metricDisplayPresets: { version: 1, presets: {} },
          updatedAt: null,
        },
      };
    }

    const databaseHealth = await readDatabaseHealth();
    if (!databaseHealth?.ok) {
      return {
        demoMode: false,
        authenticated,
        configuredForLive,
        connection: null,
        dashboard: emptyDashboard("Owner", configuredForLive),
        assets: [],
        creatives: [],
        creativesTruncated: false,
        syncRuns: [],
        setupChecks: setupChecks({
          databaseConfigured: true,
          databaseReady: false,
          metaConfigured: configuration.metaConfigured,
          securityConfigured: configuration.securityConfigured,
          legalConfigured: configuration.legalConfigured,
          connection: null,
          lastInitialSyncAt: null,
        }),
        freshness: EMPTY_FRESHNESS,
        reportingScope: null,
        resultDefinitions: defaultApplicationResultDefinitions(),
        settings: {
          timezone:
            process.env.REPORTING_TIMEZONE ?? "Asia/Ho_Chi_Minh",
          lookbackDays: Number(process.env.SYNC_LOOKBACK_DAYS ?? 30),
          currency: null,
          compareDefault: "previous_period",
          minimumInstallThreshold: 20,
          installActionTypes: DEFAULT_INSTALL_ACTION_TYPES,
          registrationActionTypes: DEFAULT_REGISTRATION_ACTION_TYPES,
          metricDisplayPresets: { version: 1, presets: {} },
          updatedAt: null,
        },
      };
    }

    const repository = await createTrackerRepository();
    const connection = await repository.getConnection();
    if (!connection || session?.sub !== connection.connectionId) {
      return {
        demoMode: false,
        authenticated: false,
        configuredForLive,
        connection: null,
        dashboard: emptyDashboard("Owner", configuredForLive),
        assets: [],
        creatives: [],
        creativesTruncated: false,
        syncRuns: [],
        setupChecks: setupChecks({
          databaseConfigured: true,
          databaseReady: true,
          metaConfigured: configuration.metaConfigured,
          securityConfigured: configuration.securityConfigured,
          legalConfigured: configuration.legalConfigured,
          connection: null,
          lastInitialSyncAt: null,
        }),
        freshness: EMPTY_FRESHNESS,
        reportingScope: null,
        resultDefinitions: defaultApplicationResultDefinitions(),
        settings: {
          timezone:
            process.env.REPORTING_TIMEZONE ?? "Asia/Ho_Chi_Minh",
          lookbackDays: Number(process.env.SYNC_LOOKBACK_DAYS ?? 30),
          currency: null,
          compareDefault: "previous_period",
          minimumInstallThreshold: 20,
          installActionTypes: DEFAULT_INSTALL_ACTION_TYPES,
          registrationActionTypes: DEFAULT_REGISTRATION_ACTION_TYPES,
          metricDisplayPresets: { version: 1, presets: {} },
          updatedAt: null,
        },
      };
    }

    const settings = await repository.getSettings();
    const dateTo = localDate(settings.reportingTimezone);
    const dateFrom = addDays(dateTo, -(settings.syncLookbackDays - 1));
    const [
      coverage,
      inventory,
      delivery,
      runs,
      insightsFreshness,
      scopeInventory,
      persistedScope,
      resultDefinitions,
    ] = await Promise.all([
        repository.getCoverage(connection.connectionId),
        repository.listMetaAssets(connection.connectionId),
        repository.getDeliveryPerformance({
          connectionId: connection.connectionId,
          dateFrom,
          dateTo,
          currency: settings.reportingCurrency ?? undefined,
        }),
        repository.listRecentSyncRuns(connection.connectionId, 20),
        repository.getInsightsFreshness(connection.connectionId),
        repository.listReportingScopeInventory(connection.connectionId),
        repository.getReportingScope(connection.connectionId),
        loadApplicationResultDefinitions(repository),
      ]);

    const assets: MetaAssetRow[] = [
      ...inventory.businesses.map((item) => ({
        id: item.metaBusinessId,
        name: item.name,
        kind: "Business" as const,
        parentName: null,
        status: item.isActive ? "ACTIVE" : "INACTIVE",
        verificationStatus: item.verificationStatus,
        isCurrent: item.isActive,
        lastSeenAt: item.lastSeenAt,
      })),
      ...inventory.adAccounts.map((item) => ({
        id: item.metaAdAccountId,
        name: item.name,
        kind: "Ad Account" as const,
        parentName: item.businessName,
        status: metaAdAccountStatusLabel(item.accountStatus),
        isCurrent: item.isActive,
        lastSeenAt: item.lastSeenAt,
        currency: item.currency,
        timezone: item.timezoneName,
      })),
      ...inventory.pages.map((item) => ({
        id: item.metaPageId,
        name: item.name,
        kind: "Page" as const,
        parentName: null,
        status: "DISCOVERED",
        category: item.category,
        isCurrent: item.isActive,
        lastSeenAt: item.lastSeenAt,
      })),
      ...inventory.apps.map((item) => ({
        id: item.metaAppId,
        name: item.name,
        kind: "App" as const,
        parentName: null,
        status: item.isActive ? "ACTIVE" : "INACTIVE",
        platform: item.platform,
        isCurrent: item.isActive,
        lastSeenAt: item.lastSeenAt,
      })),
    ];
    const freshness = createFreshness({
      lastSyncedAt: insightsFreshness.lastSyncedAt,
      dataThroughAt: insightsFreshness.dataThroughAt,
      syncVersion: insightsFreshness.syncVersion,
      syncStatus: insightsFreshness.syncStatus,
      syncMode: insightsFreshness.syncMode,
    });
    const reportingScope = persistedScope.confirmedAt
      ? buildCanonicalReportingScope({
          inventory: scopeInventory,
          persisted: persistedScope,
        })
      : defaultAllReportingScope(scopeInventory);
    const latestInsightsRun = runs.find((run) =>
      ["insights", "incremental", "full"].includes(run.syncKind),
    );
    const latestInsightsStats =
      latestInsightsRun &&
      typeof latestInsightsRun.stats.insights === "object" &&
      latestInsightsRun.stats.insights !== null &&
      !Array.isArray(latestInsightsRun.stats.insights)
        ? latestInsightsRun.stats.insights
        : null;
    const accountsAttempted =
      latestInsightsStats &&
      typeof latestInsightsStats.accounts_attempted === "number"
        ? latestInsightsStats.accounts_attempted
        : 0;
    const accountsSucceeded =
      latestInsightsStats &&
      typeof latestInsightsStats.accounts_succeeded === "number"
        ? latestInsightsStats.accounts_succeeded
        : 0;
    const coverageRatio =
      accountsAttempted > 0
        ? Math.min(1, Math.max(0, accountsSucceeded / accountsAttempted))
        : insightsFreshness.syncStatus === "healthy"
          ? 1
          : 0;
    const partial =
      insightsFreshness.syncStatus === "partial" ||
      latestInsightsRun?.status === "partial";
    const eventStatus = (
      operatingSystem: "ANDROID" | "IOS",
      field: "installs" | "registrations",
    ) => {
      const rows = delivery.filter(
        (item) => item.operatingSystem === operatingSystem,
      );
      if (rows.length === 0) return "pending" as const;
      return rows.some((item) => item[field] > 0)
        ? ("ready" as const)
        : ("warning" as const);
    };
    const lastSyncAt =
      insightsFreshness.lastSyncedAt ?? coverage?.lastSyncAt ?? null;
    const hasDelivery = delivery.some(
      (item) => item.impressions > 0 || item.spend > 0,
    );
    const hasInstallData = delivery.some((item) => item.installs > 0);
    const hasRegistrationData = delivery.some(
      (item) => item.registrations > 0,
    );
    const hasAnyConversion = hasInstallData || hasRegistrationData;
    const hasCompleteEventMapping =
      hasInstallData && hasRegistrationData;
    const connectionLifecycle =
      evaluateMetaConnectionLifecycle(connection);
    const connectionReady =
      connection.status === "connected" &&
      connectionLifecycle !== "needs_reauth";
    const dashboard: DashboardViewModel = {
      mode: connectionReady ? "connected" : "setup",
      ownerName: connection.metaUserName ?? "Owner",
      connectionLabel:
        connectionReady
          ? connectionLifecycle === "expiring_soon"
            ? "Meta đã kết nối · token sắp hết hạn"
            : "Meta đã kết nối"
          : `Meta ${connection.status}`,
      connectionDetail:
        connectionReady
          ? connectionLifecycle === "unknown"
            ? "Đang đọc tài sản được cấp quyền; Meta chưa trả thời hạn truy cập."
            : "Đang đọc toàn bộ tài sản mà owner token được Meta cấp quyền."
          : "Kết nối cần được xác thực lại trước lần đồng bộ tiếp theo.",
      lastSyncAt: formatTimestamp(
        lastSyncAt,
        settings.reportingTimezone,
      ),
      hasDelivery,
      counts: {
        businesses: coverage?.businessCount ?? inventory.businesses.length,
        adAccounts: inventory.adAccounts.filter(isOperationalAdAccount)
          .length,
        pages: coverage?.pageCount ?? inventory.pages.length,
        creatives: coverage?.creativeAssetCount ?? 0,
      },
      events: [
        {
          name: "Install",
          android: eventStatus("ANDROID", "installs"),
          ios: eventStatus("IOS", "installs"),
          total: delivery.reduce((sum, item) => sum + item.installs, 0),
        },
        {
          name: "CompleteRegistration",
          android: eventStatus("ANDROID", "registrations"),
          ios: eventStatus("IOS", "registrations"),
          total: delivery.reduce(
            (sum, item) => sum + item.registrations,
            0,
          ),
        },
      ],
      checklist: [
        {
          label: "App events trong Insights",
          status: hasAnyConversion ? "ready" : "warning",
          detail: hasAnyConversion
            ? "Đã quan sát thấy Install hoặc Registration trong Insights"
            : delivery.length
              ? "Chưa quan sát thấy Install/Registration trong Insights"
              : "Chưa có dữ liệu Insights để xác minh",
        },
        {
          label: "Quyền truy cập",
          status:
            !connectionReady
              ? "error"
              : connectionLifecycle === "healthy"
                ? "ready"
                : "warning",
          detail:
            !connectionReady
              ? "Cần kết nối lại"
              : connectionLifecycle === "healthy"
                ? "Token read-only còn hiệu lực"
                : connectionLifecycle === "expiring_soon"
                  ? "Token sắp hết hạn; nên kết nối lại"
                  : "Chưa xác định được thời hạn token"
        },
        {
          label: "Event mapping",
          status:
            delivery.length === 0
              ? "pending"
              : hasCompleteEventMapping
                ? "ready"
                : "warning",
          detail:
            delivery.length === 0
              ? "Chưa có Insights để xác minh"
              : hasCompleteEventMapping
                ? "Install và Registration đã có dữ liệu"
                : hasAnyConversion
                  ? "Mới nhận một trong hai event đã cấu hình"
                  : "Chưa nhận Install/Registration",
        },
        {
          label: "Lần đồng bộ cuối",
          status: lastSyncAt ? "ready" : "locked",
          detail:
            formatTimestamp(lastSyncAt, settings.reportingTimezone) ??
            "—",
        },
      ],
    };

    const snapshot: ApplicationSnapshot = {
      demoMode: false,
      authenticated,
      configuredForLive,
      connection,
      dashboard,
      assets,
      creatives: [],
      creativesTruncated: false,
      syncRuns: runs.map((run) =>
        mapSyncRun(run, settings.reportingTimezone),
      ),
      setupChecks: setupChecks({
        databaseConfigured: true,
        databaseReady: true,
        metaConfigured: configuration.metaConfigured,
        securityConfigured: configuration.securityConfigured,
        legalConfigured: configuration.legalConfigured,
        connection,
        // A terminal partial sync has still completed discovery and produced
        // usable coverage. Do not leave setup locked solely because Meta
        // returned non-fatal per-resource warnings.
        lastInitialSyncAt: settings.lastInitialSyncAt ?? lastSyncAt,
        reportingTimezone: settings.reportingTimezone,
      }),
      freshness,
      reportingScope,
      resultDefinitions,
      settings: {
        timezone: settings.reportingTimezone,
        lookbackDays: settings.syncLookbackDays,
        currency: settings.reportingCurrency,
        compareDefault: settings.compareDefault,
        minimumInstallThreshold: settings.minimumInstallThreshold,
        installActionTypes: settings.installActionTypes,
        registrationActionTypes: settings.registrationActionTypes,
        metricDisplayPresets: settings.metricDisplayPresets,
        updatedAt: settings.updatedAt,
      },
    };

    completeSnapshotLoaders.set(snapshot, async () => {
      const [libraryResult, performanceResult] = await Promise.all([
        loadCreativeLibrary(repository, connection.connectionId),
        loadPerformance(
          repository,
          connection.connectionId,
          dateFrom,
          dateTo,
          settings.reportingCurrency,
        ),
      ]);
      const library = libraryResult.items;
      const creatives = mapCreatives(
        library,
        performanceResult.items,
        delivery,
        settings,
        dateFrom,
        dateTo,
        freshness,
        coverageRatio,
        partial,
      );

      return {
        ...snapshot,
        dashboard: {
          ...snapshot.dashboard,
          counts: {
            ...snapshot.dashboard.counts,
            creatives: coverage?.creativeAssetCount ?? library.length,
          },
        },
        creatives,
        creativesTruncated:
          libraryResult.truncated || performanceResult.truncated,
      };
    });

    return snapshot;
}

/**
 * Lightweight request context for report pages and the application shell.
 * Live Creative rows are intentionally omitted because report pages load the
 * exact filtered range after resolving their reporting context.
 */
export const getApplicationContextSnapshot = cache(
  (): Promise<ApplicationSnapshot> => loadApplicationContextSnapshot(),
);

/**
 * Complete operational snapshot composed from the same cached request context.
 * This preserves the legacy full-data contract without repeating base queries
 * already made by the application layout.
 */
export const getApplicationSnapshot = cache(
  async (): Promise<ApplicationSnapshot> => {
    const contextSnapshot = await getApplicationContextSnapshot();
    const loadCompleteSnapshot = completeSnapshotLoaders.get(contextSnapshot);
    return loadCompleteSnapshot
      ? loadCompleteSnapshot()
      : contextSnapshot;
  },
);
