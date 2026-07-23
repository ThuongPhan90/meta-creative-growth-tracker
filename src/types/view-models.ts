export type AppMode = "demo" | "setup" | "connected";

export type ReadinessStatus =
  | "ready"
  | "pending"
  | "warning"
  | "error"
  | "locked";

export type AssetCounts = {
  businesses: number;
  adAccounts: number;
  pages: number;
  creatives: number;
};

export type EventHealth = {
  name: "Install" | "CompleteRegistration";
  android: ReadinessStatus;
  ios: ReadinessStatus;
  total: number | null;
};

export type ChecklistItem = {
  label: string;
  status: ReadinessStatus;
  detail: string;
};

export type DashboardViewModel = {
  mode: AppMode;
  ownerName: string;
  connectionLabel: string;
  connectionDetail: string;
  lastSyncAt: string | null;
  hasDelivery: boolean;
  counts: AssetCounts;
  events: EventHealth[];
  checklist: ChecklistItem[];
};

export type MetaAssetKind = "Business" | "Ad Account" | "Page" | "App";

export type MetaAssetRow = {
  id: string;
  name: string;
  kind: MetaAssetKind;
  parentName: string | null;
  status: string;
  currency?: string | null;
  timezone?: string | null;
};

export type CreativeFormat = "Video" | "Banner" | "Carousel" | "Unknown";
export type CreativePlatform = "Android" | "iOS" | "Android + iOS" | "Unknown";
export type CreativeReadiness =
  | "Sẵn sàng"
  | "Thiếu event mapping"
  | "Chưa gắn Ads"
  | "Chờ phân phối"
  | "Không xác định";

export type CreativeRating =
  | "KHÔNG INSTALL"
  | "ÍT DỮ LIỆU"
  | "TỐT"
  | "ỔN"
  | "KÉM";

export type CreativePerformanceSummary = {
  currency: string;
  spend: number;
  impressions: number;
  dailyReachSum: number;
  linkCtr: number | null;
  installs: number;
  registrations: number;
  cpi: number | null;
  costPerRegistration: number | null;
  hookRate: number | null;
  holdRate: number | null;
  osBaselineCpi: number | null;
  rating: CreativeRating | null;
  dateFrom: string;
  dateTo: string;
};

export type CreativeRow = {
  id: string;
  name: string;
  assetKey: string;
  aliases: string[];
  format: CreativeFormat;
  platform: CreativePlatform;
  linkLabel: string;
  linkCount: number;
  readiness: CreativeReadiness;
  performanceLabel: string;
  imageUrl: string;
  duration: string | null;
  ratio: string | null;
  pageName: string | null;
  eventMapping: {
    install: boolean | null;
    registration: boolean | null;
  };
  performance?: CreativePerformanceSummary | null;
};

export type SyncRunView = {
  id: string;
  kind: string;
  status: "running" | "success" | "partial" | "failed" | "cancelled";
  startedAt: string;
  finishedAt: string | null;
  summary: string;
  warnings: {
    code: string;
    resource: string | null;
    message: string;
  }[];
};

export type SetupCheck = {
  id:
    | "app"
    | "database"
    | "meta"
    | "security"
    | "legal"
    | "connection"
    | "sync";
  label: string;
  description: string;
  status: ReadinessStatus;
  actionLabel?: string;
  actionHref?: string;
};
