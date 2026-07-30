import "server-only";

import { cache } from "react";

import {
  createTrackerRepository,
  type CreativeLibraryItem,
  type CreativePerformanceItem,
  type DeliveryPerformanceItem,
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
  computeOsCpiBaselines,
  computeScopedCpiBaselines,
  explainCreativeRating,
  rateCreativeCpi,
  scopedBaselineKey,
} from "@/lib/reporting";
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

const PAGE_SIZE = 200;
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
  settings: {
    timezone: string;
    lookbackDays: number;
    currency: string | null;
    compareDefault: "previous_period" | "none";
    minimumInstallThreshold: number;
    installActionTypes: string[];
    registrationActionTypes: string[];
  };
};

const EMPTY_FRESHNESS: Freshness = {
  lastSyncedAt: null,
  dataThroughAt: null,
  syncStatus: "warning",
  freshnessSeconds: null,
  syncMode: "manual",
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
) {
  const items = await repository.listCreativeLibrary({
    connectionId,
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
) {
  const items: CreativePerformanceItem[] = [];
  for (let offset = 0; offset <= MAX_VIEW_ROWS; offset += PAGE_SIZE) {
    const limit = Math.min(PAGE_SIZE, MAX_VIEW_ROWS + 1 - items.length);
    const batch = await repository.listCreativePerformance({
      connectionId,
      dateFrom,
      dateTo,
      currency: currency ?? undefined,
      accountMetaId: accountMetaId || undefined,
      campaignMetaId: campaignMetaId || undefined,
      limit,
      offset,
    });
    items.push(...batch);
    if (items.length > MAX_VIEW_ROWS || batch.length < limit) break;
  }
  return {
    items: items.slice(0, MAX_VIEW_ROWS),
    truncated: items.length > MAX_VIEW_ROWS,
  };
}

export async function getCreativeRowsForReport({
  snapshot,
  dateFrom,
  dateTo,
  accountMetaId,
  campaignMetaId,
  currency,
}: {
  snapshot: ApplicationSnapshot;
  dateFrom: string;
  dateTo: string;
  accountMetaId?: string;
  campaignMetaId?: string;
  currency?: string | null;
}): Promise<{
  creatives: CreativeRow[];
  truncated: boolean;
}> {
  if (snapshot.demoMode) {
    const filtered = snapshot.creatives.filter((creative) => {
      if (
        accountMetaId &&
        !creative.entityLinks?.adAccountIds.includes(accountMetaId)
      ) {
        return false;
      }
      if (
        campaignMetaId &&
        !creative.entityLinks?.campaignIds.includes(campaignMetaId)
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
    return {
      creatives: isPreviousDemoPeriod
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
        : filtered,
      truncated: false,
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
    };
  }
  const repository = await createTrackerRepository();
  const settings = await repository.getSettings();
  const effectiveCurrency =
    currency === undefined ? settings.reportingCurrency : currency;
  const [libraryResult, performanceResult, delivery] = await Promise.all([
    loadCreativeLibrary(repository, snapshot.connection.connectionId),
    loadPerformance(
      repository,
      snapshot.connection.connectionId,
      dateFrom,
      dateTo,
      effectiveCurrency,
      accountMetaId,
      campaignMetaId,
    ),
    repository.getDeliveryPerformance({
      connectionId: snapshot.connection.connectionId,
      dateFrom,
      dateTo,
      currency: effectiveCurrency ?? undefined,
      accountMetaId: accountMetaId || undefined,
      campaignMetaId: campaignMetaId || undefined,
    }),
  ]);
  const coverageRatio =
    snapshot.freshness.syncStatus === "healthy"
      ? 1
      : snapshot.freshness.syncStatus === "partial"
        ? 0.8
        : 0;
  return {
    creatives: mapCreatives(
      libraryResult.items,
      performanceResult.items,
      delivery,
      settings,
      dateFrom,
      dateTo,
      snapshot.freshness,
      coverageRatio,
      snapshot.freshness.syncStatus === "partial",
    ),
    truncated: libraryResult.truncated || performanceResult.truncated,
  };
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
  campaignMetaId,
  repository: suppliedRepository,
}: {
  snapshot: ApplicationSnapshot;
  creativeFamilyId: string;
  dateFrom: string;
  dateTo: string;
  currency?: string;
  accountMetaId?: string;
  campaignMetaId?: string;
  repository?: TrackerRepository;
}): Promise<CreativeRow[] | null> {
  if (snapshot.demoMode) {
    const rows = snapshot.creatives.filter(
      (row) => row.creativeFamilyId === creativeFamilyId,
    );
    return rows.length ? rows : null;
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

  const settings = await repository.getSettings();
  const reportingCurrency =
    currency?.trim() || settings.reportingCurrency || undefined;
  const [performance, delivery] = await Promise.all([
    repository.listCreativePerformance({
      connectionId: snapshot.connection.connectionId,
      creativeFamilyId,
      dateFrom,
      dateTo,
      currency: reportingCurrency,
      accountMetaId: accountMetaId?.trim() || undefined,
      campaignMetaId: campaignMetaId?.trim() || undefined,
      limit: 200,
      offset: 0,
    }),
    repository.getDeliveryPerformance({
      connectionId: snapshot.connection.connectionId,
      dateFrom,
      dateTo,
      currency: reportingCurrency,
      accountMetaId: accountMetaId?.trim() || undefined,
      campaignMetaId: campaignMetaId?.trim() || undefined,
    }),
  ]);
  const coverageRatio =
    snapshot.freshness.syncStatus === "healthy"
      ? 1
      : snapshot.freshness.syncStatus === "partial"
        ? 0.8
        : 0;

  return mapCreatives(
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
}

export async function getOverviewTrendForReport({
  snapshot,
  dateFrom,
  dateTo,
  accountMetaId,
  campaignMetaId,
  currency,
}: {
  snapshot: ApplicationSnapshot;
  dateFrom: string;
  dateTo: string;
  accountMetaId?: string;
  campaignMetaId?: string;
  currency?: string | null;
}) {
  if (snapshot.demoMode) {
    const start = new Date(`${dateFrom}T00:00:00.000Z`).getTime();
    const end = new Date(`${dateTo}T00:00:00.000Z`).getTime();
    const spanDays = Math.max(
      1,
      Math.round((end - start) / 86_400_000),
    );
    const offsets = [...new Set([0, 0.2, 0.4, 0.6, 0.8, 1].map(
      (ratio) => Math.round(spanDays * ratio),
    ))];
    return offsets.map((offset, index) => {
      const date = new Date(start + offset * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const cpi = [24_500, 22_800, 21_400, 20_900, 19_600, 18_700][
        index
      ];
      const costPerRegistration = [
        48_000, 45_500, 43_800, 42_100, 40_600, 39_400,
      ][index];
      return {
        date,
        currency:
          currency === undefined
            ? snapshot.settings.currency ?? "VND"
            : currency ?? snapshot.settings.currency ?? "VND",
        spend: 6_000_000 + index * 350_000,
        installs: 245 + index * 24,
        registrations: 122 + index * 13,
        cpi,
        costPerRegistration,
      };
    });
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
  const points = await repository.getDeliveryTrend({
    connectionId: snapshot.connection.connectionId,
    dateFrom,
    dateTo,
    currency: effectiveCurrency ?? undefined,
    accountMetaId: accountMetaId || undefined,
    campaignMetaId: campaignMetaId || undefined,
  });

  return points.map((point) => ({
    date: point.metricDate,
    currency: point.currency,
    spend: point.spend,
    installs: point.installs,
    registrations: point.registrations,
    cpi: point.cpi,
    costPerRegistration: point.costPerRegistration,
  }));
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

export const getApplicationSnapshot = cache(
  async (): Promise<ApplicationSnapshot> => {
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
        settings: {
          timezone:
            process.env.REPORTING_TIMEZONE ?? "Asia/Ho_Chi_Minh",
          lookbackDays: Number(process.env.SYNC_LOOKBACK_DAYS ?? 30),
          currency: "VND",
          compareDefault: "previous_period",
          minimumInstallThreshold: 20,
          installActionTypes: DEFAULT_INSTALL_ACTION_TYPES,
          registrationActionTypes: DEFAULT_REGISTRATION_ACTION_TYPES,
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
        settings: {
          timezone:
            process.env.REPORTING_TIMEZONE ?? "Asia/Ho_Chi_Minh",
          lookbackDays: Number(process.env.SYNC_LOOKBACK_DAYS ?? 30),
          currency: null,
          compareDefault: "previous_period",
          minimumInstallThreshold: 20,
          installActionTypes: DEFAULT_INSTALL_ACTION_TYPES,
          registrationActionTypes: DEFAULT_REGISTRATION_ACTION_TYPES,
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
        settings: {
          timezone:
            process.env.REPORTING_TIMEZONE ?? "Asia/Ho_Chi_Minh",
          lookbackDays: Number(process.env.SYNC_LOOKBACK_DAYS ?? 30),
          currency: null,
          compareDefault: "previous_period",
          minimumInstallThreshold: 20,
          installActionTypes: DEFAULT_INSTALL_ACTION_TYPES,
          registrationActionTypes: DEFAULT_REGISTRATION_ACTION_TYPES,
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
        settings: {
          timezone:
            process.env.REPORTING_TIMEZONE ?? "Asia/Ho_Chi_Minh",
          lookbackDays: Number(process.env.SYNC_LOOKBACK_DAYS ?? 30),
          currency: null,
          compareDefault: "previous_period",
          minimumInstallThreshold: 20,
          installActionTypes: DEFAULT_INSTALL_ACTION_TYPES,
          registrationActionTypes: DEFAULT_REGISTRATION_ACTION_TYPES,
        },
      };
    }

    const settings = await repository.getSettings();
    const dateTo = localDate(settings.reportingTimezone);
    const dateFrom = addDays(dateTo, -(settings.syncLookbackDays - 1));
    const [
      coverage,
      inventory,
      libraryResult,
      performanceResult,
      delivery,
      runs,
      insightsFreshness,
    ] = await Promise.all([
        repository.getCoverage(connection.connectionId),
        repository.listMetaAssets(connection.connectionId),
        loadCreativeLibrary(repository, connection.connectionId),
        loadPerformance(
          repository,
          connection.connectionId,
          dateFrom,
          dateTo,
          settings.reportingCurrency,
        ),
        repository.getDeliveryPerformance({
          connectionId: connection.connectionId,
          dateFrom,
          dateTo,
          currency: settings.reportingCurrency ?? undefined,
        }),
        repository.listRecentSyncRuns(connection.connectionId, 20),
        repository.getInsightsFreshness(connection.connectionId),
      ]);
    const library = libraryResult.items;
    const performance = performanceResult.items;

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
        status: item.isActive ? "ACTIVE" : "INACTIVE",
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
      syncStatus: insightsFreshness.syncStatus,
      syncMode: insightsFreshness.syncMode,
    });
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
    const creatives = mapCreatives(
      library,
      performance,
      delivery,
      settings,
      dateFrom,
      dateTo,
      freshness,
      coverageRatio,
      partial,
    );

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
        creatives:
          coverage?.creativeAssetCount ?? library.length,
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

    return {
      demoMode: false,
      authenticated,
      configuredForLive,
      connection,
      dashboard,
      assets,
      creatives,
      creativesTruncated:
        libraryResult.truncated || performanceResult.truncated,
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
      settings: {
        timezone: settings.reportingTimezone,
        lookbackDays: settings.syncLookbackDays,
        currency: settings.reportingCurrency,
        compareDefault: settings.compareDefault,
        minimumInstallThreshold: settings.minimumInstallThreshold,
        installActionTypes: settings.installActionTypes,
        registrationActionTypes: settings.registrationActionTypes,
      },
    };
  },
);
