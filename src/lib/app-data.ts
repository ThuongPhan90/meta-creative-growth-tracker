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
  demoSyncRuns,
} from "@/lib/demo-data";
import {
  baselineKey,
  computeOsCpiBaselines,
  rateCreativeCpi,
} from "@/lib/reporting";
import { evaluateMetaConnectionLifecycle } from "@/lib/meta";
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
  settings: {
    timezone: string;
    lookbackDays: number;
    currency: string | null;
    minimumInstallThreshold: number;
    installActionTypes: string[];
    registrationActionTypes: string[];
  };
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
  const items: CreativeLibraryItem[] = [];
  for (let offset = 0; offset <= MAX_VIEW_ROWS; offset += PAGE_SIZE) {
    const limit = Math.min(PAGE_SIZE, MAX_VIEW_ROWS + 1 - items.length);
    const batch = await repository.listCreativeLibrary({
      connectionId,
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

async function loadPerformance(
  repository: TrackerRepository,
  connectionId: string,
  dateFrom: string,
  dateTo: string,
  currency: string | null,
) {
  const items: CreativePerformanceItem[] = [];
  for (let offset = 0; offset <= MAX_VIEW_ROWS; offset += PAGE_SIZE) {
    const limit = Math.min(PAGE_SIZE, MAX_VIEW_ROWS + 1 - items.length);
    const batch = await repository.listCreativePerformance({
      connectionId,
      dateFrom,
      dateTo,
      currency: currency ?? undefined,
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

function performanceSummary(
  item: CreativePerformanceItem,
  baseline: number | null,
  minimumInstalls: number,
  dateFrom: string,
  dateTo: string,
): CreativePerformanceSummary {
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
  };
}

function mapCreatives(
  library: readonly CreativeLibraryItem[],
  performance: readonly CreativePerformanceItem[],
  deliveryPerformance: readonly DeliveryPerformanceItem[],
  settings: TrackerSettings,
  dateFrom: string,
  dateTo: string,
) {
  const baselines = computeOsCpiBaselines(deliveryPerformance);
  const byAsset = new Map<string, CreativePerformanceItem[]>();
  for (const item of performance) {
    const rows = byAsset.get(item.creativeAssetId) ?? [];
    rows.push(item);
    byAsset.set(item.creativeAssetId, rows);
  }

  return library.flatMap<CreativeRow>((item) => {
    const rows = byAsset.get(item.creativeAssetId) ?? [];
    const common = {
      name: item.name ?? item.assetKey,
      assetKey: item.assetKey,
      aliases: item.creativeCodes,
      format:
        item.assetType === "video"
          ? ("Video" as const)
          : item.assetType === "image"
            ? ("Banner" as const)
            : ("Unknown" as const),
      linkLabel: item.adCount > 0 ? "Ads" : "Chưa liên kết",
      linkCount: item.adCount,
      imageUrl: safeThumbnail(item.thumbnailUrl ?? item.previewUrl),
      duration: formatDuration(item.durationSeconds),
      ratio: ratio(item.width, item.height),
      pageName: item.pageNames[0] ?? null,
    };

    if (rows.length === 0) {
      return [
        {
          id: `${item.creativeAssetId}:UNKNOWN:none`,
          ...common,
          platform: "Unknown",
          readiness: item.adCount > 0 ? "Chờ phân phối" : "Chưa gắn Ads",
          performanceLabel:
            item.adCount > 0
              ? "Chưa có dữ liệu"
              : "Mở khóa khi creative được gắn Ads",
          eventMapping: { install: null, registration: null },
          performance: null,
        },
      ];
    }

    return rows.map((metric) => {
      const baseline =
        baselines.get(
          baselineKey(metric.operatingSystem, metric.currency),
        ) ?? null;
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
          settings.minimumInstallThreshold,
          dateFrom,
          dateTo,
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
  return {
    id: run.syncRunId,
    kind: `${run.syncKind} · ${run.triggerSource}`,
    status,
    startedAt:
      formatTimestamp(
        run.startedAt ?? run.createdAt,
        reportingTimezone,
      ) ??
      run.startedAt ??
      run.createdAt,
    finishedAt: formatTimestamp(run.finishedAt, reportingTimezone),
    summary:
      run.errorMessage ??
      (warnings.length > 0
        ? `${warnings.length} cảnh báo · ${warnings
            .slice(0, 2)
            .map((item) => item.code)
            .join(", ")}`
        : run.currentStage
          ? `Stage: ${run.currentStage}`
          : `Status: ${run.status}`),
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
        settings: {
          timezone:
            process.env.REPORTING_TIMEZONE ?? "Asia/Ho_Chi_Minh",
          lookbackDays: Number(process.env.SYNC_LOOKBACK_DAYS ?? 30),
          currency: "VND",
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
        settings: {
          timezone:
            process.env.REPORTING_TIMEZONE ?? "Asia/Ho_Chi_Minh",
          lookbackDays: Number(process.env.SYNC_LOOKBACK_DAYS ?? 30),
          currency: null,
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
        settings: {
          timezone:
            process.env.REPORTING_TIMEZONE ?? "Asia/Ho_Chi_Minh",
          lookbackDays: Number(process.env.SYNC_LOOKBACK_DAYS ?? 30),
          currency: null,
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
        settings: {
          timezone:
            process.env.REPORTING_TIMEZONE ?? "Asia/Ho_Chi_Minh",
          lookbackDays: Number(process.env.SYNC_LOOKBACK_DAYS ?? 30),
          currency: null,
          minimumInstallThreshold: 20,
          installActionTypes: DEFAULT_INSTALL_ACTION_TYPES,
          registrationActionTypes: DEFAULT_REGISTRATION_ACTION_TYPES,
        },
      };
    }

    const settings = await repository.getSettings();
    const dateTo = localDate(settings.reportingTimezone);
    const dateFrom = addDays(dateTo, -(settings.syncLookbackDays - 1));
    const [coverage, inventory, libraryResult, performanceResult, delivery, runs] =
      await Promise.all([
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
      ]);
    const library = libraryResult.items;
    const performance = performanceResult.items;

    const assets: MetaAssetRow[] = [
      ...inventory.businesses.map((item) => ({
        id: item.metaBusinessId,
        name: item.name,
        kind: "Business" as const,
        parentName: null,
        status: item.isActive
          ? item.verificationStatus ?? "ACCESSIBLE"
          : "INACTIVE",
      })),
      ...inventory.adAccounts.map((item) => ({
        id: item.metaAdAccountId,
        name: item.name,
        kind: "Ad Account" as const,
        parentName: item.businessName,
        status: item.isActive
          ? item.accountStatus === 1
            ? "ACTIVE"
            : `STATUS ${item.accountStatus ?? "UNKNOWN"}`
          : "INACTIVE",
        currency: item.currency,
        timezone: item.timezoneName,
      })),
      ...inventory.pages.map((item) => ({
        id: item.metaPageId,
        name: item.name,
        kind: "Page" as const,
        parentName: null,
        status: item.isActive ? item.category ?? "ACCESSIBLE" : "INACTIVE",
      })),
      ...inventory.apps.map((item) => ({
        id: item.metaAppId,
        name: item.name,
        kind: "App" as const,
        parentName: null,
        status: item.isActive ? item.platform.toUpperCase() : "INACTIVE",
      })),
    ];
    const creatives = mapCreatives(
      library,
      performance,
      delivery,
      settings,
      dateFrom,
      dateTo,
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
    const lastSyncAt = coverage?.lastSyncAt ?? null;
    const hasDelivery = delivery.some(
      (item) => item.impressions > 0 || item.spend > 0,
    );
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
        adAccounts:
          coverage?.adAccountCount ?? inventory.adAccounts.length,
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
          label: "Meta SDK",
          status: "warning",
          detail: "Xác nhận thủ công trong Events Manager",
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
          status: delivery.some(
            (item) => item.installs > 0 || item.registrations > 0,
          )
            ? "ready"
            : "pending",
          detail: delivery.length
            ? "Đã kiểm tra từ Meta Insights"
            : "Chưa có Insights để xác minh",
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
        lastInitialSyncAt: settings.lastInitialSyncAt,
        reportingTimezone: settings.reportingTimezone,
      }),
      settings: {
        timezone: settings.reportingTimezone,
        lookbackDays: settings.syncLookbackDays,
        currency: settings.reportingCurrency,
        minimumInstallThreshold: settings.minimumInstallThreshold,
        installActionTypes: settings.installActionTypes,
        registrationActionTypes: settings.registrationActionTypes,
      },
    };
  },
);
