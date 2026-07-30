import type {
  CreativePerformanceSummary,
  CreativeRow,
  DataConfidence,
  DashboardViewModel,
  EntityLink,
  Freshness,
  RatingExplanation,
  MetaAssetRow,
  SetupCheck,
  SyncRunView,
} from "@/types/view-models";

export const demoFreshness: Freshness = {
  lastSyncedAt: "2026-07-30T08:10:00.000Z",
  dataThroughAt: "2026-07-29T23:59:59.000Z",
  syncStatus: "partial",
  freshnessSeconds: 29_400,
  syncMode: "scheduled",
};

function demoConfidence(
  confidence: DataConfidence["confidence"],
  installs: number,
): DataConfidence {
  return {
    dataStatus: installs >= 20 ? "ready" : "insufficient",
    confidence,
    coverageRatio: installs >= 20 ? 0.98 : 0.72,
    minimumThresholdMet: installs >= 20,
    reasonCodes:
      installs >= 20
        ? ["coverage_complete", "sample_threshold_met"]
        : ["sample_below_threshold"],
  };
}

function demoEntityLinks(
  creativeFamilyId: string,
  suffix: string,
): EntityLink {
  return {
    creativeFamilyId,
    assetId: `asset-demo-${suffix}`,
    metaCreativeIds: [`9000000000000${suffix}`],
    adIds: [`8000000000000${suffix}`],
    campaignIds: [`7000000000000${suffix}`],
    adAccountIds: [`act_6000000000000${suffix}`],
    pageIds: ["500000000000001"],
  };
}

function demoPerformance({
  spend,
  impressions,
  installs,
  registrations,
  baseline,
  rating,
  confidence,
  hookRate,
  holdRate,
}: {
  spend: number;
  impressions: number;
  installs: number;
  registrations: number;
  baseline: number;
  rating: CreativePerformanceSummary["rating"];
  confidence: DataConfidence["confidence"];
  hookRate: number;
  holdRate: number;
}): CreativePerformanceSummary {
  const cpi = installs > 0 ? spend / installs : null;
  const costPerRegistration =
    registrations > 0 ? spend / registrations : null;
  const dataConfidence = demoConfidence(confidence, installs);
  const performanceStatus: RatingExplanation["performanceStatus"] =
    rating === "TỐT"
      ? "good"
      : rating === "ỔN"
        ? "within_range"
        : rating === "ÍT DỮ LIỆU"
          ? "watch"
          : "poor";
  const recommendedAction: RatingExplanation["recommendedAction"] =
    rating === "TỐT"
      ? "scale"
      : rating === "ỔN"
        ? "hold"
        : rating === "ÍT DỮ LIỆU"
          ? "continue_test"
          : "review";

  return {
    currency: "VND",
    spend,
    impressions,
    dailyReachSum: Math.round(impressions * 0.78),
    linkCtr: 1.62,
    installs,
    registrations,
    cpi,
    costPerRegistration,
    hookRate,
    holdRate,
    osBaselineCpi: baseline,
    rating,
    dateFrom: "2026-07-01",
    dateTo: "2026-07-30",
    freshness: demoFreshness,
    confidence: dataConfidence,
    ratingExplanation: {
      rating: rating ?? "ÍT DỮ LIỆU",
      performanceStatus,
      recommendedAction,
      primaryMetric: "cpi",
      actualValue: cpi,
      benchmarkValue: baseline,
      deltaPercent:
        cpi === null || baseline === 0
          ? null
          : ((cpi - baseline) / baseline) * 100,
      benchmarkScope: {
        os: "android",
        format: "video",
        currency: "VND",
        windowDays: 30,
        sampleSize: 34,
      },
      thresholds: {
        minimumSampleSize: 20,
        goodMaxRatio: 0.85,
        withinRangeMaxRatio: 1.15,
      },
      reasons:
        rating === "TỐT"
          ? ["CPI thấp hơn benchmark và đủ độ tin cậy để mở rộng."]
          : rating === "ÍT DỮ LIỆU"
            ? ["Chưa đạt ngưỡng mẫu tối thiểu; tiếp tục thu thập dữ liệu."]
            : ["CPI cao hơn benchmark; cần rà soát thông điệp và phân phối."],
      confidence: dataConfidence,
    },
  };
}

export const demoDashboard: DashboardViewModel = {
  mode: "demo",
  ownerName: "Demo Owner",
  connectionLabel: "Dữ liệu mẫu",
  connectionDetail:
    "Bộ dữ liệu minh họa cho luồng phân tích Creative chỉ đọc.",
  lastSyncAt: "30/07/2026, 15:10",
  hasDelivery: true,
  counts: {
    businesses: 1,
    adAccounts: 2,
    pages: 1,
    creatives: 4,
  },
  events: [
    {
      name: "Install",
      android: "ready",
      ios: "ready",
      total: 1_778,
    },
    {
      name: "CompleteRegistration",
      android: "ready",
      ios: "ready",
      total: 842,
    },
  ],
  checklist: [
    {
      label: "App events trong Insights",
      status: "ready",
      detail: "Đã có Install và CompleteRegistration",
    },
    {
      label: "Quyền truy cập",
      status: "ready",
      detail: "ads_read · read_insights",
    },
    {
      label: "Event mapping",
      status: "ready",
      detail: "Mapping hợp lệ",
    },
    {
      label: "Lần đồng bộ cuối",
      status: "ready",
      detail: "30/07/2026, 15:10",
    },
  ],
};

export const demoCreatives: CreativeRow[] = [
  {
    id: "demo-creative-01",
    creativeFamilyId: "cf_111111111111111111111111",
    name: "Onboarding Motion 01",
    assetKey: "video:7f9a3c1e6b2d",
    aliases: ["V01-2606-VA"],
    format: "Video",
    platform: "Android + iOS",
    linkLabel: "Page",
    linkCount: 1,
    currentAdCount: 1,
    activeAdCount: 1,
    readiness: "Sẵn sàng",
    performanceLabel: "Chưa có dữ liệu",
    imageUrl: "/creative-demo/onboarding-motion.webp",
    duration: "00:18",
    ratio: "9:16",
    pageName: "Demo Growth Lab",
    eventMapping: {
      install: true,
      registration: true,
    },
    performance: demoPerformance({
      spend: 18_600_000,
      impressions: 960_000,
      installs: 1_240,
      registrations: 620,
      baseline: 18_000,
      rating: "TỐT",
      confidence: "high",
      hookRate: 34.2,
      holdRate: 18.6,
    }),
    entityLinks: demoEntityLinks(
      "cf_111111111111111111111111",
      "01",
    ),
  },
  {
    id: "demo-creative-02",
    creativeFamilyId: "cf_222222222222222222222222",
    name: "Feature Tour 02",
    assetKey: "video:3b2d8e4f9a7c",
    aliases: ["V02-P01"],
    format: "Video",
    platform: "Android",
    linkLabel: "Page",
    linkCount: 1,
    currentAdCount: 1,
    activeAdCount: 1,
    readiness: "Thiếu event mapping",
    performanceLabel: "Chưa có dữ liệu",
    imageUrl: "/creative-demo/feature-tour.webp",
    duration: "00:22",
    ratio: "9:16",
    pageName: "Demo Growth Lab",
    eventMapping: {
      install: true,
      registration: false,
    },
    performance: demoPerformance({
      spend: 13_200_000,
      impressions: 640_000,
      installs: 440,
      registrations: 160,
      baseline: 23_000,
      rating: "KÉM",
      confidence: "high",
      hookRate: 24.8,
      holdRate: 12.4,
    }),
    entityLinks: demoEntityLinks(
      "cf_222222222222222222222222",
      "02",
    ),
  },
  {
    id: "demo-creative-03",
    creativeFamilyId: "cf_333333333333333333333333",
    name: "Welcome Banner A",
    assetKey: "image:a1b2c3d4e5f6",
    aliases: ["BANNER-WELCOME-A"],
    format: "Banner",
    platform: "Android + iOS",
    linkLabel: "Chưa liên kết",
    linkCount: 0,
    currentAdCount: 0,
    activeAdCount: 0,
    readiness: "Chưa gắn Ads",
    performanceLabel: "Mở khóa khi có delivery",
    imageUrl: "/creative-demo/welcome-banner.webp",
    duration: null,
    ratio: "1.91:1",
    pageName: null,
    eventMapping: {
      install: true,
      registration: true,
    },
    performance: demoPerformance({
      spend: 5_400_000,
      impressions: 284_000,
      installs: 90,
      registrations: 48,
      baseline: 45_000,
      rating: "KÉM",
      confidence: "medium",
      hookRate: 0,
      holdRate: 0,
    }),
    entityLinks: demoEntityLinks(
      "cf_333333333333333333333333",
      "03",
    ),
  },
  {
    id: "demo-creative-04",
    creativeFamilyId: "cf_444444444444444444444444",
    name: "Registration Banner B",
    assetKey: "image:f6e5d4c3b2a1",
    aliases: ["BANNER-REG-B"],
    format: "Banner",
    platform: "iOS",
    linkLabel: "Ad",
    linkCount: 1,
    currentAdCount: 1,
    activeAdCount: 0,
    readiness: "Chưa có dữ liệu",
    performanceLabel: "Mở khóa khi có delivery",
    imageUrl: "/creative-demo/registration-banner.webp",
    duration: null,
    ratio: "1.91:1",
    pageName: "Demo Growth Lab",
    eventMapping: {
      install: true,
      registration: true,
    },
    performance: demoPerformance({
      spend: 1_200_000,
      impressions: 88_000,
      installs: 8,
      registrations: 3,
      baseline: 45_000,
      rating: "ÍT DỮ LIỆU",
      confidence: "low",
      hookRate: 0,
      holdRate: 0,
    }),
    entityLinks: demoEntityLinks(
      "cf_444444444444444444444444",
      "04",
    ),
  },
];

export const demoAssets: MetaAssetRow[] = [
  {
    id: "400000000000001",
    name: "Demo Growth Business",
    kind: "Business",
    parentName: null,
    status: "ACTIVE",
    isCurrent: true,
    lastSeenAt: "2026-07-30T08:10:00.000Z",
    verificationStatus: "VERIFIED",
  },
  {
    id: "act_600000000000001",
    name: "Demo App Growth · Android",
    kind: "Ad Account",
    parentName: "Demo Growth Business",
    status: "ACTIVE",
    isCurrent: true,
    lastSeenAt: "2026-07-30T08:10:00.000Z",
    currency: "VND",
    timezone: "Asia/Ho_Chi_Minh",
  },
  {
    id: "act_600000000000002",
    name: "Demo App Growth · iOS",
    kind: "Ad Account",
    parentName: "Demo Growth Business",
    status: "ACTIVE",
    isCurrent: true,
    lastSeenAt: "2026-07-30T08:10:00.000Z",
    currency: "VND",
    timezone: "Asia/Ho_Chi_Minh",
  },
  {
    id: "500000000000001",
    name: "Demo Growth Lab",
    kind: "Page",
    parentName: "Demo Growth Business",
    status: "ACTIVE",
    isCurrent: true,
    lastSeenAt: "2026-07-30T08:10:00.000Z",
    category: "Ứng dụng",
  },
  {
    id: "300000000000001",
    name: "Demo Growth App",
    kind: "App",
    parentName: "Demo Growth Business",
    status: "ACTIVE",
    isCurrent: true,
    lastSeenAt: "2026-07-30T08:10:00.000Z",
    platform: "Android + iOS",
  },
];

export const demoSyncRuns: SyncRunView[] = [
  {
    id: "demo-sync-03",
    kind: "Đồng bộ Insights · Lịch chạy",
    status: "partial",
    startedAt: "30/07/2026, 15:08",
    finishedAt: "30/07/2026, 15:10",
    startedAtIso: "2026-07-30T08:08:00.000Z",
    finishedAtIso: "2026-07-30T08:10:00.000Z",
    durationSeconds: 126,
    recordCount: 18_420,
    errorCount: 42,
    summary: "Hoàn thành có 1 cảnh báo cần kiểm tra",
    technicalSummary: null,
    warnings: [
      {
        code: "INSIGHTS_ROWS_PARTIAL",
        resource: "act_600000000000002/ads",
        message:
          "Một phần Ads chưa trả đủ breakdown thiết bị trong cửa sổ báo cáo.",
      },
    ],
  },
  {
    id: "demo-sync-02",
    kind: "Đồng bộ Insights · Lịch chạy",
    status: "success",
    startedAt: "29/07/2026, 15:06",
    finishedAt: "29/07/2026, 15:08",
    startedAtIso: "2026-07-29T08:06:00.000Z",
    finishedAtIso: "2026-07-29T08:08:00.000Z",
    durationSeconds: 118,
    recordCount: 18_208,
    errorCount: 0,
    summary: "Hoàn tất không có cảnh báo",
    technicalSummary: null,
    warnings: [],
  },
  {
    id: "demo-sync-01",
    kind: "Đồng bộ tài sản · Thủ công",
    status: "success",
    startedAt: "28/07/2026, 09:14",
    finishedAt: "28/07/2026, 09:15",
    startedAtIso: "2026-07-28T02:14:00.000Z",
    finishedAtIso: "2026-07-28T02:15:00.000Z",
    durationSeconds: 64,
    recordCount: 142,
    errorCount: 0,
    summary: "Hoàn tất không có cảnh báo",
    technicalSummary: null,
    warnings: [],
  },
];

export const demoSetupChecks: SetupCheck[] = [
  {
    id: "app",
    label: "Ứng dụng đã deploy",
    description: "Next.js đang chạy trong môi trường hiện tại.",
    status: "ready",
  },
  {
    id: "database",
    label: "Database",
    description: "Cài Postgres từ Vercel Marketplace.",
    status: "pending",
    actionLabel: "Mở hướng dẫn",
    actionHref: "/setup#database",
  },
  {
    id: "meta",
    label: "Meta App",
    description: "Thêm META_APP_ID và META_APP_SECRET trên Vercel.",
    status: "pending",
    actionLabel: "Mở hướng dẫn",
    actionHref: "/setup#meta",
  },
  {
    id: "security",
    label: "Khóa bảo mật",
    description: "Thiết lập TOKEN_ENCRYPTION_KEY, SESSION_SECRET và CRON_SECRET.",
    status: "pending",
    actionLabel: "Xem biến môi trường",
    actionHref: "/setup#security",
  },
  {
    id: "connection",
    label: "Kết nối chủ sở hữu",
    description: "Đăng nhập Meta và cấp quyền read-only.",
    status: "locked",
  },
  {
    id: "sync",
    label: "Đồng bộ lần đầu",
    description: "Quét BM, tài khoản quảng cáo, Trang và creative.",
    status: "locked",
  },
];
