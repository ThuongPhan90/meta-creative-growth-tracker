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
  isCurrent?: boolean;
  lastSeenAt?: string | null;
  currency?: string | null;
  timezone?: string | null;
  category?: string | null;
  verificationStatus?: string | null;
  platform?: string | null;
};

export type CreativeFormat = "Video" | "Banner" | "Carousel" | "Unknown";
export type CreativePlatform = "Android" | "iOS" | "Android + iOS" | "Unknown";
export type CreativeReadiness =
  | "Sẵn sàng"
  | "Thiếu event mapping"
  | "Chưa gắn Ads"
  | "Chờ phân phối"
  | "Chưa có dữ liệu"
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
  freshness?: Freshness;
  confidence?: DataConfidence;
  ratingExplanation?: RatingExplanation | null;
};

export type CreativeRow = {
  id: string;
  creativeFamilyId?: string;
  name: string;
  assetKey: string;
  aliases: string[];
  format: CreativeFormat;
  platform: CreativePlatform;
  linkLabel: string;
  linkCount: number;
  currentAdCount: number;
  activeAdCount: number;
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
  entityLinks?: EntityLink;
};

export type SyncRunView = {
  id: string;
  kind: string;
  status: "running" | "success" | "partial" | "failed" | "cancelled";
  startedAt: string;
  finishedAt: string | null;
  startedAtIso?: string | null;
  finishedAtIso?: string | null;
  durationSeconds?: number | null;
  recordCount?: number | null;
  errorCount?: number | null;
  summary: string;
  technicalSummary?: string | null;
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

export type SyncHealthStatus = "healthy" | "warning" | "partial" | "error";
export type SyncMode = "scheduled" | "manual" | "webhook";

/**
 * Response-level synchronization metadata. Null timestamps represent a source
 * that has never completed the corresponding synchronization step.
 */
export type Freshness = {
  lastSyncedAt: string | null;
  dataThroughAt: string | null;
  syncStatus: SyncHealthStatus;
  freshnessSeconds: number | null;
  syncMode: SyncMode;
};

export type DataStatus =
  | "ready"
  | "insufficient"
  | "missing_mapping"
  | "stale"
  | "partial";
export type ConfidenceLevel = "high" | "medium" | "low";

export type DataConfidence = {
  dataStatus: DataStatus;
  confidence: ConfidenceLevel;
  coverageRatio: number;
  minimumThresholdMet: boolean;
  reasonCodes: string[];
};

export type CanonicalOperatingSystem = "android" | "ios" | "unknown";
export type CanonicalCreativeFormat =
  | "video"
  | "image"
  | "carousel"
  | "dynamic"
  | "unknown";

export type PerformanceStatus = "good" | "within_range" | "watch" | "poor";
export type RecommendedAction =
  | "scale"
  | "hold"
  | "continue_test"
  | "review";
export type RatingPrimaryMetric =
  | "cpi"
  | "cpa_registration"
  | "hook_rate"
  | "hold_rate";

export type RatingBenchmarkScope = {
  os: CanonicalOperatingSystem;
  format: CanonicalCreativeFormat;
  currency: string;
  windowDays: number;
  sampleSize: number;
};

export type RatingThresholds = {
  minimumSampleSize: number;
  goodMaxRatio: number;
  withinRangeMaxRatio: number;
};

/**
 * Complete, user-explainable rating contract. `rating` preserves the legacy
 * tracker label while the remaining fields power the connected-navigation UI.
 */
export type RatingExplanation = {
  rating: CreativeRating;
  performanceStatus: PerformanceStatus;
  recommendedAction: RecommendedAction;
  primaryMetric: RatingPrimaryMetric;
  actualValue: number | null;
  benchmarkValue: number | null;
  deltaPercent: number | null;
  benchmarkScope: RatingBenchmarkScope;
  thresholds: RatingThresholds;
  reasons: string[];
  confidence: DataConfidence;
};

export type EntityLink = {
  creativeFamilyId: string;
  assetId: string;
  metaCreativeIds: string[];
  adIds: string[];
  campaignIds: string[];
  adAccountIds: string[];
  pageIds: string[];
};

export type CreativeFamilyPerformance = {
  currency: string;
  dateFrom: string;
  dateTo: string;
  spend: number;
  impressions: number;
  linkClicks: number;
  installs: number;
  registrations: number;
  cpi: number | null;
  costPerRegistration: number | null;
  hookRate: number | null;
  holdRate: number | null;
};

export type CreativeFamilySummary = {
  creativeFamilyId: string;
  displayName: string;
  assetId: string;
  assetKey: string;
  canonicalIdentity: string;
  aliases: string[];
  format: CanonicalCreativeFormat;
  operatingSystems: CanonicalOperatingSystem[];
  thumbnailUrl: string | null;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  performance: CreativeFamilyPerformance | null;
  freshness: Freshness;
  confidence: DataConfidence;
  ratingExplanation: RatingExplanation | null;
  entityLinks: EntityLink;
};

export type CreativeFamilyMetaCreative = {
  metaCreativeId: string;
  name: string | null;
  pageId: string | null;
  postId: string | null;
};

export type CreativeFamilyUsage = {
  adId: string;
  adName: string | null;
  adSetId: string;
  campaignId: string;
  adAccountId: string;
  status: string | null;
};

export type CreativeFamilyDetail = CreativeFamilySummary & {
  identitySource: "physical_asset" | "internal_stable_identifier";
  metaCreatives: CreativeFamilyMetaCreative[];
  usage: CreativeFamilyUsage[];
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

export type CanonicalEntityKind =
  | "business"
  | "ad_account"
  | "campaign"
  | "ad_set"
  | "ad"
  | "meta_creative"
  | "asset"
  | "creative_family"
  | "page"
  | "post"
  | "event_mapping"
  | "connection";

export type DataHealthAffectedEntity = {
  entityType: CanonicalEntityKind;
  entityId: string;
  label: string | null;
};

export type DataHealthSeverity = "info" | "warning" | "error" | "critical";

export type DataHealthIssue = {
  issueId: string;
  severity: DataHealthSeverity;
  userMessage: string;
  technicalCode: string;
  occurrenceCount: number;
  affectedGroupCount: number;
  impact: string;
  affectedEntities: DataHealthAffectedEntity[];
  firstOccurredAt: string | null;
  lastOccurredAt: string | null;
};
