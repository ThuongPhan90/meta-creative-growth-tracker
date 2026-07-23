import type {
  CreativeRow,
  DashboardViewModel,
  MetaAssetRow,
  SetupCheck,
  SyncRunView,
} from "@/types/view-models";

export const demoDashboard: DashboardViewModel = {
  mode: "demo",
  ownerName: "Donny",
  connectionLabel: "Chưa kết nối Meta",
  connectionDetail:
    "Kết nối tài khoản Meta để quét tài sản và bắt đầu theo dõi.",
  lastSyncAt: null,
  hasDelivery: false,
  counts: {
    businesses: 0,
    adAccounts: 0,
    pages: 0,
    creatives: 0,
  },
  events: [
    {
      name: "Install",
      android: "pending",
      ios: "pending",
      total: null,
    },
    {
      name: "CompleteRegistration",
      android: "pending",
      ios: "pending",
      total: null,
    },
  ],
  checklist: [
    {
      label: "Meta SDK",
      status: "pending",
      detail: "Chưa kiểm tra",
    },
    {
      label: "Quyền truy cập",
      status: "pending",
      detail: "Chưa cấp quyền",
    },
    {
      label: "Event mapping",
      status: "pending",
      detail: "Chưa kiểm tra",
    },
    {
      label: "Lần đồng bộ cuối",
      status: "locked",
      detail: "—",
    },
  ],
};

export const demoCreatives: CreativeRow[] = [
  {
    id: "demo-creative-01",
    name: "Onboarding Motion 01",
    assetKey: "video:7f9a3c1e6b2d",
    aliases: ["V01-2606-VA"],
    format: "Video",
    platform: "Android + iOS",
    linkLabel: "Page",
    linkCount: 1,
    readiness: "Sẵn sàng",
    performanceLabel: "Chưa có dữ liệu",
    imageUrl: "/creative-demo/onboarding-motion.webp",
    duration: "00:18",
    ratio: "9:16",
    pageName: "Donny Growth Lab",
    eventMapping: {
      install: true,
      registration: true,
    },
  },
  {
    id: "demo-creative-02",
    name: "Feature Tour 02",
    assetKey: "video:3b2d8e4f9a7c",
    aliases: ["V02-P01"],
    format: "Video",
    platform: "Android",
    linkLabel: "Page",
    linkCount: 1,
    readiness: "Thiếu event mapping",
    performanceLabel: "Chưa có dữ liệu",
    imageUrl: "/creative-demo/feature-tour.webp",
    duration: "00:22",
    ratio: "9:16",
    pageName: "Donny Growth Lab",
    eventMapping: {
      install: true,
      registration: false,
    },
  },
  {
    id: "demo-creative-03",
    name: "Welcome Banner A",
    assetKey: "image:a1b2c3d4e5f6",
    aliases: ["BANNER-WELCOME-A"],
    format: "Banner",
    platform: "Android + iOS",
    linkLabel: "Chưa liên kết",
    linkCount: 0,
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
  },
  {
    id: "demo-creative-04",
    name: "Registration Banner B",
    assetKey: "image:f6e5d4c3b2a1",
    aliases: ["BANNER-REG-B"],
    format: "Banner",
    platform: "iOS",
    linkLabel: "Ad",
    linkCount: 1,
    readiness: "Chờ phân phối",
    performanceLabel: "Mở khóa khi có delivery",
    imageUrl: "/creative-demo/registration-banner.webp",
    duration: null,
    ratio: "1.91:1",
    pageName: "Donny Growth Lab",
    eventMapping: {
      install: true,
      registration: true,
    },
  },
];

export const demoAssets: MetaAssetRow[] = [];

export const demoSyncRuns: SyncRunView[] = [];

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
