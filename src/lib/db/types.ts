export type DatabaseId = string;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type ConnectionStatus =
  | "pending"
  | "connected"
  | "needs_reauth"
  | "revoked"
  | "error";

export interface MetaConnectionInput {
  metaUserId: string;
  metaUserName?: string | null;
  encryptedAccessToken: string;
  grantedScopes?: readonly string[];
  declinedScopes?: readonly string[];
  tokenExpiresAt?: string | null;
  dataAccessExpiresAt?: string | null;
  status?: ConnectionStatus;
}

export interface MetaConnectionRecord {
  connectionId: DatabaseId;
  ownerId: number;
  metaUserId: string;
  metaUserName: string | null;
  grantedScopes: string[];
  declinedScopes: string[];
  tokenExpiresAt: string | null;
  dataAccessExpiresAt: string | null;
  status: ConnectionStatus;
  lastValidatedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MetaConnectionSecretRecord extends MetaConnectionRecord {
  encryptedAccessToken: string;
}

export interface TrackerSettings {
  ownerId: number;
  reportingTimezone: string;
  reportingCurrency: string | null;
  syncLookbackDays: number;
  minimumInstallThreshold: number;
  minimumRegistrationThreshold: number;
  benchmarkMode: "os" | "account_os_event" | "custom";
  benchmarkWindowDays: number;
  benchmarkByOs: boolean;
  benchmarkByFormat: boolean;
  numberFormat: "vi-VN" | "en-US";
  compareDefault: "previous_period" | "none";
  scoringWeights: {
    cpi: number;
    cpa: number;
    hook: number;
    hold: number;
  };
  syncCadence: "deployment" | "manual";
  alertChannel: "none" | "email";
  installActionTypes: string[];
  registrationActionTypes: string[];
  lastInitialSyncAt: string | null;
  updatedAt: string;
}

export interface TrackerSettingsUpdate {
  reportingTimezone?: string;
  reportingCurrency?: string | null;
  syncLookbackDays?: number;
  minimumInstallThreshold?: number;
  minimumRegistrationThreshold?: number;
  benchmarkMode?: TrackerSettings["benchmarkMode"];
  benchmarkWindowDays?: number;
  benchmarkByOs?: boolean;
  benchmarkByFormat?: boolean;
  numberFormat?: TrackerSettings["numberFormat"];
  compareDefault?: TrackerSettings["compareDefault"];
  scoringWeights?: TrackerSettings["scoringWeights"];
  syncCadence?: TrackerSettings["syncCadence"];
  alertChannel?: TrackerSettings["alertChannel"];
  installActionTypes?: readonly string[];
  registrationActionTypes?: readonly string[];
  lastInitialSyncAt?: string | null;
}

export interface SettingsAuditRecord {
  settingsAuditId: DatabaseId;
  changedAt: string;
  changedBy: string;
  beforeState: JsonObject;
  afterState: JsonObject;
}

export interface BusinessInput {
  metaBusinessId: string;
  name: string;
  verificationStatus?: string | null;
  rawPayload?: JsonObject;
}

export interface AdAccountInput {
  metaAdAccountId: string;
  accountId: string;
  name: string;
  accountStatus?: number | null;
  disableReason?: number | null;
  currency: string;
  timezoneName: string;
  timezoneOffsetHoursUtc?: number | null;
  businessName?: string | null;
  rawPayload?: JsonObject;
}

export interface PageInput {
  metaPageId: string;
  name: string;
  category?: string | null;
  pictureUrl?: string | null;
  rawPayload?: JsonObject;
}

export interface MetaAppInput {
  metaAppId: string;
  name: string;
  namespace?: string | null;
  platform?: "android" | "ios" | "both" | "unknown";
  storeUrl?: string | null;
  rawPayload?: JsonObject;
}

export interface CampaignInput {
  metaCampaignId: string;
  name: string;
  objective?: string | null;
  status?: string | null;
  effectiveStatus?: string | null;
  buyingType?: string | null;
  startTime?: string | null;
  stopTime?: string | null;
  metaCreatedTime?: string | null;
  metaUpdatedTime?: string | null;
  rawPayload?: JsonObject;
}

export interface AdSetInput {
  metaAdSetId: string;
  campaignId: DatabaseId;
  name: string;
  status?: string | null;
  effectiveStatus?: string | null;
  optimizationGoal?: string | null;
  billingEvent?: string | null;
  promotedObject?: JsonObject;
  startTime?: string | null;
  endTime?: string | null;
  metaCreatedTime?: string | null;
  metaUpdatedTime?: string | null;
  rawPayload?: JsonObject;
}

export interface AdInput {
  metaAdId: string;
  campaignId: DatabaseId;
  adSetId: DatabaseId;
  name: string;
  creativeCode?: string | null;
  status?: string | null;
  effectiveStatus?: string | null;
  metaCreatedTime?: string | null;
  metaUpdatedTime?: string | null;
  rawPayload?: JsonObject;
}

export interface CreativeInput {
  metaCreativeId: string;
  pageId?: DatabaseId | null;
  name?: string | null;
  creativeCode?: string | null;
  creativeFormat?: "video" | "image" | "carousel" | "dynamic" | "unknown";
  objectStoryId?: string | null;
  effectiveObjectStoryId?: string | null;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  metaCreatedTime?: string | null;
  metaUpdatedTime?: string | null;
  rawPayload?: JsonObject;
}

export interface CreativeAssetInput {
  assetKey: string;
  assetType: "video" | "image" | "unknown";
  metaVideoId?: string | null;
  metaImageHash?: string | null;
  name?: string | null;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  rawPayload?: JsonObject;
}

export interface CanonicalResultFactInput {
  canonicalResultKey: string;
  value: number;
  selectedActionType: string;
}

export interface DailyMetricInput {
  metricDate: string;
  adAccountId: DatabaseId;
  campaignId: DatabaseId;
  adSetId: DatabaseId;
  adId: DatabaseId;
  creativeId?: DatabaseId | null;
  creativeAssetId?: DatabaseId | null;
  metricScope: "ad" | "creative" | "asset";
  scopeKey: string;
  allocationMethod: "exact" | "single_asset" | "unallocated";
  country?: string;
  publisherPlatform?: string;
  platformPosition?: string;
  impressionDevice?: string;
  attributionWindow?: string;
  actionReportTime: "impression" | "conversion" | "mixed";
  syncVersion: string;
  accountTimezone: string;
  currency: string;
  spend?: number;
  impressions?: number;
  reportedReach?: number;
  linkClicks?: number;
  installs?: number;
  registrations?: number;
  purchases?: number;
  purchaseValue?: number;
  video3sViews?: number;
  video100Views?: number;
  rawActions?: JsonValue[];
  rawActionValues?: JsonValue[];
  canonicalResultMetrics?: readonly CanonicalResultFactInput[];
  canonicalResultValues?: readonly CanonicalResultFactInput[];
  rawPayload?: JsonObject;
  actionMappingVersion?: string;
  resultMappingVersion?: string;
  fetchedAt?: string;
}

export interface ActionMetricDailyInput {
  metricDate: string;
  adAccountId: DatabaseId;
  campaignId: DatabaseId;
  adId: DatabaseId;
  canonicalResultKey: string;
  attributionWindow: string;
  actionReportTime: "impression" | "conversion" | "mixed";
  currency: string;
  value: number;
  selectedActionTypes: readonly string[];
  syncVersion: string;
  resultMappingVersion: string;
  fetchedAt?: string;
}

export type ActionValueDailyInput = ActionMetricDailyInput;

export interface PeriodReachSnapshotInput {
  adAccountId: DatabaseId;
  campaignId?: DatabaseId | null;
  scopeLevel: "account" | "campaign";
  dateFrom: string;
  dateTo: string;
  attributionWindow: string;
  actionReportTime: "impression" | "conversion" | "mixed";
  syncVersion: string;
  reach: number;
  fetchedAt?: string;
}

export interface PeriodReachFilters {
  connectionId: DatabaseId;
  dateFrom: string;
  dateTo: string;
  adAccountIds: readonly string[];
  campaignIds?: readonly string[];
  attributionWindow: string;
  actionReportTime: "impression" | "conversion" | "mixed";
  syncVersion: string;
  resultMappingVersion: string;
}

export type PeriodReachResult =
  | {
      available: true;
      scopeLevel: "account" | "campaign";
      adAccountId: string;
      campaignId: string | null;
      reach: number;
      dateFrom: string;
      dateTo: string;
      attributionWindow: string;
      actionReportTime: "impression" | "conversion" | "mixed";
      syncVersion: string;
    }
  | {
      available: false;
      reason:
        | "exact_account_scope_required"
        | "multi_account_overlap_unsafe"
        | "multi_campaign_overlap_unsafe"
        | "reporting_snapshot_stale"
        | "exact_snapshot_unavailable";
    };

export interface CanonicalResultObjectiveMapping {
  objectiveKey: string;
  rawObjectiveKeys: readonly string[];
}

export interface CanonicalResultTotalsFilters {
  connectionId: DatabaseId;
  dateFrom: string;
  dateTo: string;
  adAccountIds?: readonly string[];
  campaignMetaIds?: readonly string[];
  objectiveKeys?: readonly string[];
  objectiveMappings: readonly CanonicalResultObjectiveMapping[];
  currency?: string;
  attributionWindow: string;
  actionReportTime: "impression" | "conversion" | "mixed";
  syncVersion: string;
  resultMappingVersion: string;
}

export interface CanonicalResultTotal {
  canonicalResultKey: string;
  objectiveKey: string;
  metricSource: "action" | "action_value";
  currency: string;
  value: number;
  objectiveSpend: number;
}

export interface CanonicalObjectiveSpendTotal {
  objectiveKey: string;
  currency: string;
  spend: number;
}

export interface CanonicalResultTotals {
  results: CanonicalResultTotal[];
  spendByObjective: CanonicalObjectiveSpendTotal[];
}

export interface CanonicalCampaignResultTotal {
  adAccountMetaId: string;
  campaignMetaId: string;
  canonicalResultKey: string;
  objectiveKey: string;
  metricSource: "action" | "action_value";
  currency: string;
  value: number;
}

export interface CanonicalCreativeFamilyResultTotal {
  adAccountMetaId: string;
  /**
   * Null keeps mixed, dynamic, missing and otherwise ambiguous Ad-level facts
   * visible without assigning them to a physical Creative Family.
   */
  creativeFamilyId: string | null;
  allocationMethod: "single_asset" | "unallocated";
  canonicalResultKey: string;
  objectiveKey: string;
  metricSource: "action" | "action_value";
  currency: string;
  value: number;
}

export type CanonicalResultBatch<T> =
  | {
      available: true;
      syncVersion: string;
      resultMappingVersion: string;
      results: T[];
    }
  | {
      available: false;
      reason:
        | "reporting_snapshot_unavailable"
        | "reporting_snapshot_stale";
      results: [];
    };

export type CanonicalCampaignResultTotals =
  CanonicalResultBatch<CanonicalCampaignResultTotal>;

export type CanonicalCreativeFamilyResultTotals =
  CanonicalResultBatch<CanonicalCreativeFamilyResultTotal>;

export interface AssetRelationshipInput {
  businessId: DatabaseId;
  assetId: DatabaseId;
  relationship?: string;
}

export interface CreativeAssetLinkInput {
  creativeId: DatabaseId;
  creativeAssetId: DatabaseId;
  position?: number;
  role?: string;
  source?: string;
}

export interface AdCreativeLinkInput {
  adId: DatabaseId;
  creativeId: DatabaseId;
  relationship?: string;
}

export interface ConnectionCoverage {
  connectionId: DatabaseId;
  connectionStatus: ConnectionStatus;
  lastValidatedAt: string | null;
  businessCount: number;
  adAccountCount: number;
  pageCount: number;
  appCount: number;
  creativeContainerCount: number;
  creativeAssetCount: number;
  campaignCount: number;
  adCount: number;
  lastSyncAt: string | null;
}

export interface MetaBusinessListItem {
  businessId: DatabaseId;
  metaBusinessId: string;
  name: string;
  verificationStatus: string | null;
  isActive: boolean;
  lastSeenAt: string;
}

export interface MetaAdAccountListItem {
  adAccountId: DatabaseId;
  metaAdAccountId: string;
  accountId: string;
  name: string;
  accountStatus: number | null;
  currency: string;
  timezoneName: string;
  businessName: string | null;
  isActive: boolean;
  lastSeenAt: string;
}

export interface MetaPageListItem {
  pageId: DatabaseId;
  metaPageId: string;
  name: string;
  category: string | null;
  pictureUrl: string | null;
  isActive: boolean;
  lastSeenAt: string;
}

export interface MetaAppListItem {
  appId: DatabaseId;
  metaAppId: string;
  name: string;
  namespace: string | null;
  platform: "android" | "ios" | "both" | "unknown";
  storeUrl: string | null;
  isActive: boolean;
  lastSeenAt: string;
}

export interface MetaAssetInventory {
  businesses: MetaBusinessListItem[];
  adAccounts: MetaAdAccountListItem[];
  pages: MetaPageListItem[];
  apps: MetaAppListItem[];
}

export interface CreativeLibraryFilters {
  connectionId: DatabaseId;
  creativeFamilyId?: DatabaseId;
  search?: string;
  assetType?: "video" | "image" | "unknown";
  limit?: number;
  offset?: number;
}

export interface CreativeLibraryItem {
  creativeAssetId: DatabaseId;
  /** Present on V2 projections; older repository projections remain valid. */
  creativeFamilyId?: DatabaseId;
  assetKey: string;
  assetType: "video" | "image" | "unknown";
  metaVideoId: string | null;
  metaImageHash: string | null;
  name: string | null;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  creativeCodes: string[];
  pageNames: string[];
  creativeContainerCount: number;
  adCount: number;
  currentAdCount: number;
  activeAdCount: number;
  adAccountCount: number;
  pageCount: number;
  metaCreativeIds?: string[];
  adIds?: string[];
  campaignIds?: string[];
  adAccountIds?: string[];
  pageIds?: string[];
  lastUsedAt: string | null;
  lastSeenAt: string;
}

export interface InsightsFreshnessRecord {
  lastSyncedAt: string | null;
  dataThroughAt: string | null;
  syncVersion: string | null;
  syncStatus: "healthy" | "warning" | "partial" | "error";
  syncMode: "scheduled" | "manual" | "webhook";
}

export interface CreativePerformanceFilters {
  connectionId: DatabaseId;
  creativeFamilyId?: DatabaseId;
  dateFrom: string;
  dateTo: string;
  adAccountId?: DatabaseId;
  accountMetaId?: string;
  campaignMetaId?: string;
  attributionWindow?: string;
  actionReportTime?: "impression" | "conversion" | "mixed";
  syncVersion?: string;
  objectiveRawKeys?: readonly string[];
  assetType?: "video" | "image" | "unknown";
  currency?: string;
  limit?: number;
  offset?: number;
}

export interface CreativePerformanceItem {
  creativeAssetId: DatabaseId;
  /** Present on V2 projections; older repository projections remain valid. */
  creativeFamilyId?: DatabaseId;
  assetKey: string;
  assetType: "video" | "image" | "unknown";
  name: string | null;
  thumbnailUrl: string | null;
  operatingSystem: "ANDROID" | "IOS" | "UNKNOWN";
  currency: string;
  spend: number;
  impressions: number;
  dailyReachSum: number;
  linkClicks: number;
  installs: number;
  registrations: number;
  video3sViews: number;
  video100Views: number;
  linkCtr: number | null;
  cpi: number | null;
  costPerRegistration: number | null;
  hookRate: number | null;
  holdRate: number | null;
  metricDays: number;
}

export interface DeliveryPerformanceFilters {
  connectionId: DatabaseId;
  dateFrom: string;
  dateTo: string;
  adAccountId?: DatabaseId;
  accountMetaId?: string;
  campaignMetaId?: string;
  attributionWindow?: string;
  actionReportTime?: "impression" | "conversion" | "mixed";
  syncVersion?: string;
  objectiveRawKeys?: readonly string[];
  currency?: string;
}

export interface DeliveryPerformanceItem {
  operatingSystem: "ANDROID" | "IOS" | "UNKNOWN";
  currency: string;
  spend: number;
  impressions: number;
  linkClicks: number;
  installs: number;
  registrations: number;
  video3sViews: number;
  video100Views: number;
  metricDays: number;
}

export type DeliveryTrendFilters = DeliveryPerformanceFilters;

/**
 * One daily point for exactly one currency. Consumers must render separate
 * series (or request a currency filter) rather than summing monetary values.
 */
export interface DeliveryTrendItem {
  metricDate: string;
  currency: string;
  spend: number;
  impressions: number;
  linkClicks: number;
  installs: number;
  registrations: number;
  video3sViews: number;
  video100Views: number;
  linkCtr: number | null;
  cpi: number | null;
  costPerRegistration: number | null;
}

export interface CampaignInventoryFilters {
  connectionId: DatabaseId;
  dateFrom?: string;
  dateTo?: string;
  currency?: string;
  accountMetaId?: string;
  attributionWindow?: string;
  actionReportTime?: "impression" | "conversion" | "mixed";
  syncVersion?: string;
  objectiveRawKeys?: readonly string[];
  includeInactiveAccounts?: boolean;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CampaignPerformanceItem {
  currency: string;
  spend: number;
  impressions: number;
  installs: number;
  registrations: number;
  cpi: number | null;
  costPerRegistration: number | null;
  /** Snapshot-pinned normalized Meta results keyed by canonical Result. */
  resultValues?: Record<string, number | null>;
}

export interface CampaignInventoryItem {
  campaignId: DatabaseId;
  metaCampaignId: string;
  name: string;
  objective: string | null;
  status: string | null;
  effectiveStatus: string | null;
  isActive: boolean;
  metaAdAccountId: string;
  adAccountName: string;
  adSetCount: number;
  adCount: number;
  creativeAssetCount: number;
  performance: CampaignPerformanceItem[];
  lastSeenAt: string;
}

export interface CampaignInventoryPage {
  items: CampaignInventoryItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface CampaignAdItem {
  adId: DatabaseId;
  metaAdId: string;
  name: string;
  status: string | null;
  effectiveStatus: string | null;
  creativeFamilyIds: string[];
}

export interface CampaignAdSetItem {
  adSetId: DatabaseId;
  metaAdSetId: string;
  name: string;
  status: string | null;
  effectiveStatus: string | null;
  ads: CampaignAdItem[];
}

export interface CampaignHierarchy {
  campaignId: DatabaseId;
  metaCampaignId: string;
  adSets: CampaignAdSetItem[];
}

export interface CreativeTrackerFilters {
  connectionId: DatabaseId;
  dateFrom: string;
  dateTo: string;
  accountMetaId?: string;
  includeInactiveAccounts?: boolean;
  campaignMetaId?: string;
  assetType?: "video" | "image" | "unallocated";
  search?: string;
  currency?: string;
  limit?: number;
  offset?: number;
}

export interface CreativeTrackerItem {
  creativeCode: string;
  operatingSystem: "ANDROID" | "IOS" | "UNKNOWN";
  currency: string;
  format: "video" | "image" | "unallocated" | "mixed";
  spend: number;
  impressions: number;
  dailyReachSum: number;
  linkClicks: number;
  installs: number;
  registrations: number;
  video3sViews: number;
  video100Views: number;
  accountCount: number;
  campaignCount: number;
  adCount: number;
  assetCount: number;
  hasUnallocatedDelivery: boolean;
  osBaselineCpi: number | null;
  metricDays: number;
}

export interface CreativeTrackerPage {
  items: CreativeTrackerItem[];
  total: number;
  limit: number;
  offset: number;
}

export type SyncKind = "full" | "assets" | "insights" | "incremental";
export type SyncTrigger = "manual" | "cron" | "setup" | "retry" | "system";
export type SyncRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "cancelled";

export interface CreateSyncRunInput {
  connectionId: DatabaseId;
  requestKey?: string | null;
  syncKind: SyncKind;
  triggerSource: SyncTrigger;
  windowStart?: string | null;
  windowEnd?: string | null;
}

export interface SyncRunRecord {
  syncRunId: DatabaseId;
  connectionId: DatabaseId;
  requestKey: string | null;
  syncKind: SyncKind;
  triggerSource: SyncTrigger;
  status: SyncRunStatus;
  windowStart: string | null;
  windowEnd: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  currentStage: string | null;
  progress: JsonObject;
  stats: JsonObject;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreativeFamilyIdentityRecord {
  creativeFamilyId: DatabaseId;
  creativeAssetId: DatabaseId;
  assetKey: string;
  assetType: "video" | "image" | "unknown";
  metaVideoId: string | null;
  metaImageHash: string | null;
}

export interface CreativeFamilyEntityLinksRecord
  extends CreativeFamilyIdentityRecord {
  metaCreativeIds: string[];
  adIds: string[];
  campaignIds: string[];
  adAccountIds: string[];
  pageIds: string[];
}

export interface DataHealthOccurrenceInput {
  technicalCode: string;
  severity: "info" | "warning" | "error" | "critical";
  userMessage: string;
  impact: string;
  affectedEntities: {
    entityType:
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
    entityId: DatabaseId;
    label?: string | null;
  }[];
  occurredAt?: string | null;
}
