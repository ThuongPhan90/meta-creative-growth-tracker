import { createHash } from "node:crypto";

import type {
  AdAccountInput,
  AdCreativeLinkInput,
  AdInput,
  AdSetInput,
  AssetRelationshipInput,
  BusinessInput,
  CampaignInput,
  CreativeAssetInput,
  CreativeAssetLinkInput,
  CreativeInput,
  DailyMetricInput,
  DatabaseId,
  JsonObject,
  JsonValue,
  MetaAppInput,
  PageInput,
} from "@/lib/db/types";
import {
  MetaGraphApiError,
  MetaGraphClient,
  MetaGraphRequestError,
  type MetaGraphClientOptions,
  type MetaGraphPaginationOptions,
  type MetaGraphRequestOptions,
} from "@/lib/meta/client";
import {
  extractActionMetric,
  parseInsightMetrics,
} from "@/lib/meta/metrics";
import { missingMetaOAuthScopes } from "@/lib/meta/oauth";
import type { MetaActionMapping } from "@/lib/meta/config";
import type {
  MetaAction,
  MetaGraphQuery,
  MetaInsightRow,
} from "@/lib/meta/types";
import {
  decryptMetaToken,
  type TokenEncryptionOptions,
} from "@/lib/security/encryption";
import { normalizeCreativeCode } from "@/lib/reporting";

import type {
  MetaSyncAdapter,
  MetaSyncStageContext,
  RunSyncInput,
  RunSyncResult,
  SyncStageResult,
  SyncWarning,
} from "./contracts";
import { mapWithConcurrency } from "./concurrency";
import { SyncStageError } from "./contracts";
import { runMetaSync } from "./orchestrator";

const USER_FIELDS = "id,name";
const PERMISSION_FIELDS = "permission,status";
const BUSINESS_FIELDS = "id,name,verification_status";
const AD_ACCOUNT_FIELDS = [
  "id",
  "account_id",
  "name",
  "account_status",
  "disable_reason",
  "currency",
  "timezone_name",
  "timezone_offset_hours_utc",
  "business{id,name}",
].join(",");
const PAGE_FIELDS = "id,name,category,picture";
const APP_FIELDS = "id,name,namespace,link,supported_platforms";
const CAMPAIGN_FIELDS = [
  "id",
  "name",
  "objective",
  "status",
  "effective_status",
  "buying_type",
  "start_time",
  "stop_time",
  "created_time",
  "updated_time",
].join(",");
const AD_SET_FIELDS = [
  "id",
  "name",
  "status",
  "effective_status",
  "campaign_id",
  "optimization_goal",
  "billing_event",
  "promoted_object",
  "start_time",
  "end_time",
  "created_time",
  "updated_time",
].join(",");
const AD_FIELDS = [
  "id",
  "name",
  "status",
  "effective_status",
  "campaign_id",
  "adset_id",
  "creative{id}",
  "created_time",
  "updated_time",
].join(",");
const CREATIVE_FIELDS = [
  "id",
  "name",
  "object_type",
  "image_hash",
  "image_url",
  "thumbnail_url",
  "video_id",
  "object_story_id",
  "effective_object_story_id",
  "object_story_spec",
  "asset_feed_spec",
  "body",
  "title",
  "call_to_action_type",
  "url_tags",
].join(",");
// Current Ads Insights exposes 3-second views inside actions as
// action_type=video_view. video_play_actions is requested separately so the
// raw row retains the distinct video-start signal; it must not be substituted
// for a 3-second view.
const INSIGHT_FIELDS = [
  "date_start",
  "date_stop",
  "account_id",
  "account_currency",
  "attribution_setting",
  "campaign_id",
  "adset_id",
  "ad_id",
  "spend",
  "impressions",
  "reach",
  "inline_link_clicks",
  "actions",
  "action_values",
  "video_play_actions",
  "video_p100_watched_actions",
].join(",");
const ASSET_INSIGHT_FIELDS = [
  "date_start",
  "date_stop",
  "account_id",
  "account_currency",
  "attribution_setting",
  "campaign_id",
  "adset_id",
  "ad_id",
  "spend",
  "impressions",
  "reach",
  "inline_link_clicks",
  "actions",
  "action_values",
  "video_play_actions",
  "video_p100_watched_actions",
].join(",");

const PURCHASE_ACTION_TYPES = [
  "purchase",
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "mobile_app_purchase",
] as const;

const CAMPAIGN_EFFECTIVE_STATUSES = [
  "ACTIVE",
  "ARCHIVED",
  "DELETED",
  "IN_PROCESS",
  "PAUSED",
  "WITH_ISSUES",
] as const;
const AD_SET_EFFECTIVE_STATUSES = [
  "ACTIVE",
  "ARCHIVED",
  "CAMPAIGN_PAUSED",
  "DELETED",
  "IN_PROCESS",
  "PAUSED",
  "WITH_ISSUES",
] as const;
const AD_EFFECTIVE_STATUSES = [
  "ACTIVE",
  "ADSET_PAUSED",
  "ARCHIVED",
  "CAMPAIGN_PAUSED",
  "DELETED",
  "DISAPPROVED",
  "IN_PROCESS",
  "PAUSED",
  "PENDING_BILLING_INFO",
  "PENDING_REVIEW",
  "PREAPPROVED",
  "WITH_ISSUES",
] as const;

const BUSINESS_ASSET_DISCOVERY_CONCURRENCY = 6;
const AD_ACCOUNT_ASSET_READ_CONCURRENCY = 2;
const CREATIVE_DETAIL_CONCURRENCY = 6;
const AD_ACCOUNT_INSIGHT_SYNC_CONCURRENCY = 2;

const BREAKDOWN_ATTEMPTS = [
  {
    label: "publisher_platform,platform_position,impression_device",
    values: [
      "publisher_platform",
      "platform_position",
      "impression_device",
    ],
  },
  {
    label: "publisher_platform,platform_position",
    values: ["publisher_platform", "platform_position"],
  },
  {
    label: "publisher_platform,impression_device",
    values: ["publisher_platform", "impression_device"],
  },
  {
    label: "publisher_platform",
    values: ["publisher_platform"],
  },
  {
    label: "impression_device",
    values: ["impression_device"],
  },
  { label: "none", values: [] },
] as const;

const ASSET_BREAKDOWN_FIELDS = [
  "image_asset",
  "video_asset",
] as const;
const ASSET_DELIVERY_BREAKDOWN_ATTEMPTS = [
  ["publisher_platform", "platform_position", "impression_device"],
  ["publisher_platform", "impression_device"],
  ["impression_device"],
  [],
] as const;

type GraphRecord = Record<string, unknown>;

interface GraphUser extends GraphRecord {
  id: string;
  name?: string;
}

interface GraphPermission extends GraphRecord {
  permission: string;
  status: string;
}

interface GraphBusiness extends GraphRecord {
  id: string;
  name?: string;
  verification_status?: string;
}

interface GraphAdAccount extends GraphRecord {
  id: string;
  account_id?: string;
  name?: string;
  account_status?: number;
  disable_reason?: number;
  currency?: string;
  timezone_name?: string;
  timezone_offset_hours_utc?: number;
  business?: {
    id?: string;
    name?: string;
  };
}

interface GraphPage extends GraphRecord {
  id: string;
  name?: string;
  category?: string;
  picture?: {
    data?: {
      url?: string;
    };
  };
}

interface GraphApp extends GraphRecord {
  id: string;
  name?: string;
  namespace?: string;
  link?: string;
  supported_platforms?: string[];
}

interface GraphCampaign extends GraphRecord {
  id: string;
  name?: string;
  objective?: string;
  status?: string;
  effective_status?: string;
  buying_type?: string;
  start_time?: string;
  stop_time?: string;
  created_time?: string;
  updated_time?: string;
}

interface GraphAdSet extends GraphRecord {
  id: string;
  name?: string;
  campaign_id?: string;
  status?: string;
  effective_status?: string;
  optimization_goal?: string;
  billing_event?: string;
  promoted_object?: GraphRecord;
  start_time?: string;
  end_time?: string;
  created_time?: string;
  updated_time?: string;
}

interface GraphAd extends GraphRecord {
  id: string;
  name?: string;
  campaign_id?: string;
  adset_id?: string;
  status?: string;
  effective_status?: string;
  creative?: {
    id?: string;
  };
  created_time?: string;
  updated_time?: string;
}

interface GraphCreative extends GraphRecord {
  id: string;
  name?: string;
  object_type?: string;
  image_hash?: string;
  image_url?: string;
  thumbnail_url?: string;
  video_id?: string;
  object_story_id?: string;
  effective_object_story_id?: string;
  object_story_spec?: GraphRecord;
  asset_feed_spec?: GraphRecord;
}

/**
 * The adapter deliberately depends only on MetaGraphClient's GET surface. A
 * narrow interface keeps tests deterministic and prevents Graph mutations from
 * entering the sync implementation.
 */
export interface MetaGraphReadClient {
  request<T>(
    path: string,
    query?: MetaGraphQuery,
    options?: MetaGraphRequestOptions,
  ): Promise<T>;
  getAll<T>(
    path: string,
    query?: MetaGraphQuery,
    options?: MetaGraphPaginationOptions,
  ): Promise<T[]>;
}

export interface PhysicalCreativeAsset {
  input: CreativeAssetInput;
  position: number;
  role: "video" | "image" | "primary";
  source: "creative" | "object_story_spec" | "asset_feed_spec" | "unknown";
}

export interface InsightAllocationCandidate {
  creativeId: DatabaseId;
  creativeAssetId: DatabaseId;
  assetKey: string;
  assetType: "video" | "image" | "unknown";
  metaVideoId?: string | null;
  metaImageHash?: string | null;
}

export interface InsightAllocation {
  metricScope: "ad" | "asset";
  allocationMethod: "exact" | "single_asset" | "unallocated";
  scopeKey: string;
  creativeId: DatabaseId | null;
  creativeAssetId: DatabaseId | null;
}

export interface MetaMarketingApiSyncAdapterOptions {
  client: MetaGraphReadClient;
  expectedMetaUserId?: string | null;
}

export interface StoredMetaSyncAdapterFactoryOptions {
  repository: MetaSyncStageContext["repository"];
  connectionId: DatabaseId;
  decryption?: TokenEncryptionOptions;
  graphClient?: Omit<MetaGraphClientOptions, "accessToken">;
}

export interface RunStoredMetaSyncInput
  extends Omit<RunSyncInput, "adapter"> {
  adapterFactory?: Omit<
    StoredMetaSyncAdapterFactoryOptions,
    "repository" | "connectionId"
  >;
}

interface DiscoveredRelation {
  businessMetaId: string;
  assetMetaId: string;
  relationship: "owned" | "client" | "accessible";
}

interface StoredCreativeAsset extends InsightAllocationCandidate {
  metaCreativeId: string;
}

interface StoredAd {
  metaAdId: string;
  internalId: DatabaseId;
  accountInternalId: DatabaseId;
  campaignInternalId: DatabaseId;
  adSetInternalId: DatabaseId;
  creativeMetaIds: string[];
}

interface StoredAccount {
  graph: GraphAdAccount;
  internalId: DatabaseId;
  ads: Map<string, StoredAd>;
  inventoryComplete: boolean;
}

interface AdAccountInventorySnapshot {
  campaigns: GraphCampaign[];
  adSets: GraphAdSet[];
  ads: GraphAd[];
  accountCreatives: GraphCreative[];
  warnings: SyncWarning[];
}

interface InventoryState {
  syncRunId: DatabaseId;
  accounts: Map<string, StoredAccount>;
  creativeInternalIds: Map<string, DatabaseId>;
  assetsByCreative: Map<string, StoredCreativeAsset[]>;
}

interface MutableAssetStats {
  businesses: number;
  adAccounts: number;
  pages: number;
  apps: number;
  campaigns: number;
  adSets: number;
  ads: number;
  creatives: number;
  creativeAssets: number;
  adCreativeLinks: number;
  creativeAssetLinks: number;
  unresolvedPhysicalAssets: number;
}

function isRecord(value: unknown): value is GraphRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function positiveInteger(value: unknown): number | null {
  const number = optionalNumber(value);
  return number !== undefined && number > 0 ? Math.round(number) : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const number = optionalNumber(value);
  return number !== undefined && number >= 0 ? number : null;
}

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }
  if (isRecord(value)) {
    const result: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      if (
        ![
          "access_token",
          "appsecret_proof",
          "app_secret",
          "client_secret",
        ].includes(key.toLowerCase()) &&
        item !== undefined &&
        typeof item !== "function"
      ) {
        result[key] = toJsonValue(item);
      }
    }
    return result;
  }
  return null;
}

function toJsonObject(value: unknown): JsonObject {
  const converted = toJsonValue(value);
  return isRecord(converted) ? (converted as JsonObject) : {};
}

function appPlatform(app: GraphApp): MetaAppInput["platform"] {
  const platforms = new Set(
    (Array.isArray(app.supported_platforms) ? app.supported_platforms : [])
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.toUpperCase()),
  );
  const hasAndroid =
    platforms.has("ANDROID") ||
    platforms.has("AMAZON") ||
    platforms.has("SAMSUNG") ||
    platforms.has("XIAOMI");
  const hasIos = platforms.has("IPHONE") || platforms.has("IPAD");
  if (hasAndroid && hasIos) return "both";
  if (hasAndroid) return "android";
  if (hasIos) return "ios";
  return "unknown";
}

function graphItemsWithIds<T extends GraphRecord>(
  values: readonly T[],
): T[] {
  return values.filter((value) => Boolean(optionalString(value.id)));
}

function canonicalAdAccountId(account: GraphAdAccount): string {
  const id = optionalString(account.id);
  if (id?.startsWith("act_")) {
    return id;
  }
  const accountId = optionalString(account.account_id) ?? id;
  return accountId?.startsWith("act_")
    ? accountId
    : `act_${accountId ?? "unknown"}`;
}

function numericAdAccountId(account: GraphAdAccount): string {
  return (
    optionalString(account.account_id) ??
    canonicalAdAccountId(account).replace(/^act_/, "")
  );
}

function mergeGraphItem<T extends GraphRecord>(
  map: Map<string, T>,
  key: string,
  value: T,
): void {
  const existing = map.get(key);
  map.set(key, existing ? ({ ...existing, ...value } as T) : value);
}

function mergeAdAccount(
  map: Map<string, GraphAdAccount>,
  account: GraphAdAccount,
): string {
  const key = canonicalAdAccountId(account);
  const normalized = {
    ...account,
    id: key,
    account_id: numericAdAccountId(account),
  };
  mergeGraphItem(map, key, normalized);
  return key;
}

function redactErrorMessage(message: string): string {
  return message
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .slice(0, 500);
}

function describeReadError(error: unknown): string {
  if (error instanceof MetaGraphApiError) {
    const code =
      error.metaCode === null ? "" : `, Meta code ${error.metaCode}`;
    return `Meta denied or could not complete this read (HTTP ${error.httpStatus}${code}).`;
  }
  if (error instanceof MetaGraphRequestError) {
    return `Meta read failed (${error.kind}).`;
  }
  if (error instanceof Error) {
    return redactErrorMessage(error.message || error.name);
  }
  return "Meta read failed for an unknown reason.";
}

function warning(
  code: string,
  resource: string,
  error: unknown,
): SyncWarning {
  return {
    code,
    resource,
    message: describeReadError(error),
  };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason ?? new Error("Sync was aborted.");
  }
}

async function allSettledOrThrow<T extends readonly unknown[]>(
  operations: { [K in keyof T]: Promise<T[K]> },
): Promise<T> {
  const settled = await Promise.allSettled(operations);
  const failure = settled.find(
    (result): result is PromiseRejectedResult =>
      result.status === "rejected",
  );
  if (failure) {
    throw failure.reason;
  }
  return settled.map(
    (result) => (result as PromiseFulfilledResult<unknown>).value,
  ) as unknown as T;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function addUtcDays(date: string, amount: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  if (!year || !month || !day) {
    throw new RangeError("The account timezone did not produce a date.");
  }
  return `${year}-${month}-${day}`;
}

function validateSyncWindow(window: {
  dateFrom: string;
  dateTo: string;
}): { dateFrom: string; dateTo: string } {
  if (
    !validDate(window.dateFrom) ||
    !validDate(window.dateTo) ||
    window.dateFrom > window.dateTo
  ) {
    throw new SyncStageError({
      code: "INVALID_SYNC_WINDOW",
      message: "Sync window must contain inclusive YYYY-MM-DD dates.",
      retryable: false,
    });
  }
  return window;
}

function pageMetaIdFromCreative(creative: GraphCreative): string | null {
  const explicit = optionalString(creative.object_story_spec?.page_id);
  if (explicit) {
    return explicit;
  }
  const storyId =
    optionalString(creative.effective_object_story_id) ??
    optionalString(creative.object_story_id);
  return storyId?.split("_")[0] || null;
}

function creativeAssetName(
  record: GraphRecord,
  creative: GraphCreative,
): string | null {
  return (
    optionalString(record.name) ??
    (isRecord(record.label) ? optionalString(record.label.name) : undefined) ??
    optionalString(creative.name) ??
    null
  );
}

function sourcePriority(source: PhysicalCreativeAsset["source"]): number {
  switch (source) {
    case "asset_feed_spec":
      return 3;
    case "object_story_spec":
      return 2;
    case "creative":
      return 1;
    case "unknown":
      return 0;
  }
}

function assetRecord(
  type: "video" | "image",
  identity: string,
  record: GraphRecord,
  creative: GraphCreative,
  source: PhysicalCreativeAsset["source"],
  position: number,
): PhysicalCreativeAsset {
  const thumbnailUrl =
    optionalString(record.thumbnail_url) ??
    optionalString(record.image_url) ??
    optionalString(record.url) ??
    optionalString(creative.thumbnail_url) ??
    optionalString(creative.image_url) ??
    null;
  const previewUrl =
    optionalString(record.preview_url) ??
    optionalString(record.url) ??
    optionalString(record.image_url) ??
    optionalString(creative.image_url) ??
    null;

  return {
    position,
    role: type,
    source,
    input: {
      assetKey: `${type}:${identity}`,
      assetType: type,
      metaVideoId: type === "video" ? identity : null,
      metaImageHash: type === "image" ? identity : null,
      name: creativeAssetName(record, creative),
      thumbnailUrl,
      previewUrl,
      width: positiveInteger(record.width),
      height: positiveInteger(record.height),
      durationSeconds:
        type === "video"
          ? nonNegativeNumber(
              record.duration_seconds ?? record.duration ?? record.length,
            )
          : null,
      rawPayload: toJsonObject(record),
    },
  };
}

/**
 * Extracts stable physical media identity without treating names or temporary
 * URLs as deduplication keys. A video's thumbnail image hash is intentionally
 * ignored when a video_id is present.
 */
export function extractPhysicalCreativeAssets(
  creative: GraphCreative,
): PhysicalCreativeAsset[] {
  const assets = new Map<string, PhysicalCreativeAsset>();
  let nextPosition = 0;

  const add = (
    type: "video" | "image",
    identityValue: unknown,
    record: GraphRecord,
    source: PhysicalCreativeAsset["source"],
  ): void => {
    const identity = optionalString(identityValue);
    if (!identity) {
      return;
    }
    const candidate = assetRecord(
      type,
      identity,
      record,
      creative,
      source,
      nextPosition,
    );
    const existing = assets.get(candidate.input.assetKey);
    if (
      !existing ||
      sourcePriority(candidate.source) > sourcePriority(existing.source)
    ) {
      assets.set(candidate.input.assetKey, {
        ...candidate,
        position: existing?.position ?? nextPosition,
      });
    }
    if (!existing) {
      nextPosition += 1;
    }
  };

  const visitStoryValue = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visitStoryValue);
      return;
    }
    if (!isRecord(value)) {
      return;
    }

    const videoId = optionalString(value.video_id);
    if (videoId) {
      add("video", videoId, value, "object_story_spec");
    } else {
      add(
        "image",
        value.image_hash ?? value.hash,
        value,
        "object_story_spec",
      );
    }
    Object.values(value).forEach(visitStoryValue);
  };

  const visitFeedValue = (
    value: unknown,
    parentKey: string | null = null,
  ): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isRecord(item) && parentKey === "videos") {
          add("video", item.video_id ?? item.id, item, "asset_feed_spec");
        } else if (isRecord(item) && parentKey === "images") {
          add("image", item.hash ?? item.image_hash, item, "asset_feed_spec");
        }
        visitFeedValue(item, parentKey);
      }
      return;
    }
    if (!isRecord(value)) {
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      visitFeedValue(item, key);
    }
  };

  if (creative.asset_feed_spec) {
    visitFeedValue(creative.asset_feed_spec);
  }
  if (creative.object_story_spec) {
    visitStoryValue(creative.object_story_spec);
  }

  const topLevelVideoId = optionalString(creative.video_id);
  if (topLevelVideoId) {
    add("video", topLevelVideoId, creative, "creative");
  } else {
    add("image", creative.image_hash, creative, "creative");
  }

  if (assets.size === 0) {
    return [
      {
        position: 0,
        role: "primary",
        source: "unknown",
        input: {
          assetKey: `unknown:creative:${creative.id}`,
          assetType: "unknown",
          name: optionalString(creative.name) ?? null,
          thumbnailUrl: optionalString(creative.thumbnail_url) ?? null,
          previewUrl:
            optionalString(creative.image_url) ??
            optionalString(creative.thumbnail_url) ??
            null,
          rawPayload: {
            meta_creative_id: creative.id,
            reason: "physical_identity_unavailable",
          },
        },
      },
    ];
  }

  return [...assets.values()].sort((left, right) => {
    if (left.position !== right.position) {
      return left.position - right.position;
    }
    return left.input.assetKey.localeCompare(right.input.assetKey);
  });
}

function directAssetIdentities(row: MetaInsightRow): {
  videoIds: Set<string>;
  imageHashes: Set<string>;
} {
  const videoIds = new Set<string>();
  const imageHashes = new Set<string>();

  const collect = (
    value: unknown,
    kind: "video" | "image",
  ): void => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return;
      }
      if (
        (trimmed.startsWith("{") || trimmed.startsWith("[")) &&
        trimmed.length < 20_000
      ) {
        try {
          collect(JSON.parse(trimmed), kind);
          return;
        } catch {
          // Meta also returns plain asset labels in these fields.
        }
      }
      (kind === "video" ? videoIds : imageHashes).add(trimmed);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collect(item, kind));
      return;
    }
    if (isRecord(value)) {
      for (const [key, item] of Object.entries(value)) {
        if (key === "video_id") {
          collect(item, "video");
        } else if (key === "image_hash" || key === "hash") {
          collect(item, "image");
        } else if (key === "id" || key === "value" || key === "asset_id") {
          collect(item, kind);
        }
      }
    }
  };

  collect(row.video_id, "video");
  collect(row.video_asset, "video");
  collect(row.image_hash, "image");
  collect(row.image_asset, "image");
  return { videoIds, imageHashes };
}

/**
 * Selects at most one physical asset. Multi-asset rows are intentionally kept
 * at ad scope unless the Insights row itself identifies an exact asset.
 */
export function chooseInsightAllocation(
  row: MetaInsightRow,
  adScopeKey: string,
  candidates: readonly InsightAllocationCandidate[],
): InsightAllocation {
  const uniqueCandidates = new Map<string, InsightAllocationCandidate>();
  for (const candidate of candidates) {
    if (!uniqueCandidates.has(candidate.assetKey)) {
      uniqueCandidates.set(candidate.assetKey, candidate);
    }
  }

  const identities = directAssetIdentities(row);
  const exact = [...uniqueCandidates.values()].filter(
    (candidate) =>
      (candidate.metaVideoId &&
        identities.videoIds.has(candidate.metaVideoId)) ||
      (candidate.metaImageHash &&
        identities.imageHashes.has(candidate.metaImageHash)),
  );

  if (exact.length === 1) {
    return {
      metricScope: "asset",
      allocationMethod: "exact",
      scopeKey: exact[0].assetKey,
      creativeId: exact[0].creativeId,
      creativeAssetId: exact[0].creativeAssetId,
    };
  }

  const knownAssets = [...uniqueCandidates.values()].filter(
    (candidate) => candidate.assetType !== "unknown",
  );
  if (knownAssets.length === 1 && uniqueCandidates.size === 1) {
    return {
      metricScope: "asset",
      allocationMethod: "single_asset",
      scopeKey: knownAssets[0].assetKey,
      creativeId: knownAssets[0].creativeId,
      creativeAssetId: knownAssets[0].creativeAssetId,
    };
  }

  return {
    metricScope: "ad",
    allocationMethod: "unallocated",
    scopeKey: adScopeKey,
    creativeId: null,
    creativeAssetId: null,
  };
}

function normalizeMetaActions(value: unknown): MetaAction[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const actions: MetaAction[] = [];
  for (const rawAction of value) {
    if (!isRecord(rawAction)) {
      continue;
    }
    const actionType = optionalString(rawAction.action_type);
    if (!actionType) {
      continue;
    }
    const action: MetaAction = { action_type: actionType };
    for (const [key, item] of Object.entries(rawAction)) {
      if (
        key !== "action_type" &&
        (typeof item === "string" || typeof item === "number")
      ) {
        action[key] = item;
      }
    }
    actions.push(action);
  }
  return actions;
}

export type ThreeSecondVideoMetricSource =
  | "actions.video_view"
  | "legacy.video_3_sec_watched_actions"
  | "unavailable";

export function resolveThreeSecondVideoActions(
  row: MetaInsightRow,
  normalizedActions = normalizeMetaActions(row.actions),
): {
  actions: MetaAction[];
  source: ThreeSecondVideoMetricSource;
} {
  const supportedActions = normalizedActions.filter(
    (action) => action.action_type === "video_view",
  );
  if (supportedActions.length > 0) {
    return {
      actions: supportedActions,
      source: "actions.video_view",
    };
  }

  const legacyActions = normalizeMetaActions(
    row.video_3_sec_watched_actions,
  );
  if (legacyActions.length > 0) {
    return {
      actions: legacyActions,
      source: "legacy.video_3_sec_watched_actions",
    };
  }

  return {
    actions: [],
    source: "unavailable",
  };
}

export function actionMappingVersion(mapping: MetaActionMapping): string {
  const canonical = JSON.stringify({
    installs: {
      strategy: mapping.installs.strategy,
      actionTypes: [...mapping.installs.actionTypes],
    },
    registrations: {
      strategy: mapping.registrations.strategy,
      actionTypes: [...mapping.registrations.actionTypes],
    },
  });
  const digest = createHash("sha256")
    .update(canonical, "utf8")
    .digest("hex")
    .slice(0, 16);
  return `settings-first-match-v1:${digest}`;
}

function actionsAsJson(actions: readonly MetaAction[]): JsonValue[] {
  return actions.map((action) => toJsonObject(action));
}

function inferredCreativeFormat(
  creative: GraphCreative,
  assets: readonly PhysicalCreativeAsset[],
): CreativeInput["creativeFormat"] {
  if (creative.asset_feed_spec) {
    return "dynamic";
  }
  const objectType = optionalString(creative.object_type)?.toLowerCase();
  if (objectType?.includes("carousel") || assets.length > 1) {
    return "carousel";
  }
  if (
    objectType?.includes("video") ||
    assets.some((asset) => asset.input.assetType === "video")
  ) {
    return "video";
  }
  if (
    objectType?.includes("image") ||
    objectType?.includes("photo") ||
    assets.some((asset) => asset.input.assetType === "image")
  ) {
    return "image";
  }
  return "unknown";
}

function isBreakdownCompatibilityError(error: unknown): boolean {
  return (
    error instanceof MetaGraphApiError &&
    (error.metaCode === 1 || error.metaCode === 100) &&
    !error.isTransient
  );
}

function statsToJson(stats: MutableAssetStats): JsonObject {
  return {
    businesses: stats.businesses,
    ad_accounts: stats.adAccounts,
    pages: stats.pages,
    apps: stats.apps,
    campaigns: stats.campaigns,
    ad_sets: stats.adSets,
    ads: stats.ads,
    creatives: stats.creatives,
    creative_assets: stats.creativeAssets,
    unresolved_physical_assets: stats.unresolvedPhysicalAssets,
    ad_creative_links: stats.adCreativeLinks,
    creative_asset_links: stats.creativeAssetLinks,
  };
}

function dailyMetricNaturalKey(metric: DailyMetricInput): string {
  return [
    metric.metricDate,
    metric.adId,
    metric.scopeKey,
    metric.country ?? "ALL",
    metric.publisherPlatform ?? "ALL",
    metric.platformPosition ?? "ALL",
    metric.impressionDevice ?? "ALL",
    metric.attributionWindow ?? "account_default",
  ].join("\u001f");
}

function insightRowGroupKey(row: MetaInsightRow): string | null {
  const adId = optionalString(row.ad_id);
  const date =
    optionalString(row.date_start) ?? optionalString(row.date_stop);
  if (!adId || !date) return null;
  return [
    adId,
    date,
    optionalString(row.account_currency) ?? "UNKNOWN",
  ].join("\u001f");
}

type ExactCoverageTotals = {
  spend: number;
  impressions: number;
  linkClicks: number;
  installs: number;
  registrations: number;
  purchases: number;
  purchaseValue: number;
  video3sViews: number;
  video100Views: number;
};

const COVERAGE_DIMENSIONS = [
  "country",
  "publisher_platform",
  "platform_position",
  "impression_device",
] as const;

function addCoverageTotals(
  left: ExactCoverageTotals,
  right: ExactCoverageTotals,
): ExactCoverageTotals {
  return {
    spend: left.spend + right.spend,
    impressions: left.impressions + right.impressions,
    linkClicks: left.linkClicks + right.linkClicks,
    installs: left.installs + right.installs,
    registrations: left.registrations + right.registrations,
    purchases: left.purchases + right.purchases,
    purchaseValue: left.purchaseValue + right.purchaseValue,
    video3sViews: left.video3sViews + right.video3sViews,
    video100Views: left.video100Views + right.video100Views,
  };
}

function coverageTotals(
  row: MetaInsightRow,
  mapping: MetaActionMapping,
): ExactCoverageTotals {
  const actions = normalizeMetaActions(row.actions);
  const actionValues = normalizeMetaActions(row.action_values);
  const video3s = resolveThreeSecondVideoActions(row, actions).actions;
  const video100 = normalizeMetaActions(row.video_p100_watched_actions);
  const parsed = parseInsightMetrics(
    {
      ...row,
      actions,
      action_values: actionValues,
      video_3_sec_watched_actions: video3s,
      video_p100_watched_actions: video100,
    },
    mapping,
  );
  const purchases = extractActionMetric(actions, {
    actionTypes: PURCHASE_ACTION_TYPES,
    strategy: "first-match",
  });
  const purchaseValue = extractActionMetric(actionValues, {
    actionTypes: PURCHASE_ACTION_TYPES,
    strategy: "first-match",
  });
  const linkClicks =
    row.inline_link_clicks === undefined
      ? extractActionMetric(actions, {
          actionTypes: ["link_click"],
          strategy: "first-match",
        })
      : parsed.inlineLinkClicks;

  return {
    spend: parsed.spend,
    impressions: parsed.impressions,
    linkClicks,
    installs: parsed.metaAttributedInstalls,
    registrations: parsed.metaAttributedRegistrations,
    purchases,
    purchaseValue,
    video3sViews: parsed.threeSecondVideoViews,
    video100Views: parsed.completedVideoViews,
  };
}

function coverageValueMatches(
  primary: number,
  exact: number,
  absoluteTolerance: number,
) {
  return (
    Math.abs(primary - exact) <=
    Math.max(absoluteTolerance, Math.abs(primary) * 0.001)
  );
}

export function exactCoverageMatches(
  primary: readonly MetaInsightRow[],
  exact: readonly MetaInsightRow[],
  mapping: MetaActionMapping,
): boolean {
  if (primary.length === 0 || exact.length === 0) return false;
  const dimensions = COVERAGE_DIMENSIONS.filter((dimension) =>
    primary.some((row) => optionalString(row[dimension])),
  );
  if (
    dimensions.some((dimension) =>
      exact.some((row) => !optionalString(row[dimension])),
    )
  ) {
    return false;
  }

  const zeroTotals = (): ExactCoverageTotals => ({
    spend: 0,
    impressions: 0,
    linkClicks: 0,
    installs: 0,
    registrations: 0,
    purchases: 0,
    purchaseValue: 0,
    video3sViews: 0,
    video100Views: 0,
  });
  const aggregate = (rows: readonly MetaInsightRow[]) => {
    const values = new Map<string, ExactCoverageTotals>();
    for (const row of rows) {
      const key = dimensions
        .map((dimension) => optionalString(row[dimension]) ?? "ALL")
        .join("\u001f");
      values.set(
        key,
        addCoverageTotals(
          values.get(key) ?? zeroTotals(),
          coverageTotals(row, mapping),
        ),
      );
    }
    return values;
  };

  const primaryByDelivery = aggregate(primary);
  const exactByDelivery = aggregate(exact);
  if (
    primaryByDelivery.size !== exactByDelivery.size ||
    [...primaryByDelivery.keys()].some((key) => !exactByDelivery.has(key))
  ) {
    return false;
  }

  return [...primaryByDelivery].every(([key, primaryTotals]) => {
    const exactTotals = exactByDelivery.get(key);
    return (
      exactTotals !== undefined &&
      coverageValueMatches(primaryTotals.spend, exactTotals.spend, 0.01) &&
      coverageValueMatches(
        primaryTotals.impressions,
        exactTotals.impressions,
        1,
      ) &&
      coverageValueMatches(
        primaryTotals.linkClicks,
        exactTotals.linkClicks,
        0.01,
      ) &&
      coverageValueMatches(
        primaryTotals.installs,
        exactTotals.installs,
        0.01,
      ) &&
      coverageValueMatches(
        primaryTotals.registrations,
        exactTotals.registrations,
        0.01,
      ) &&
      coverageValueMatches(
        primaryTotals.purchases,
        exactTotals.purchases,
        0.01,
      ) &&
      coverageValueMatches(
        primaryTotals.purchaseValue,
        exactTotals.purchaseValue,
        0.01,
      ) &&
      coverageValueMatches(
        primaryTotals.video3sViews,
        exactTotals.video3sViews,
        0.01,
      ) &&
      coverageValueMatches(
        primaryTotals.video100Views,
        exactTotals.video100Views,
        0.01,
      )
    );
  });
}

export class MetaMarketingApiSyncAdapter implements MetaSyncAdapter {
  private readonly client: MetaGraphReadClient;
  private readonly expectedMetaUserId: string | null;
  private inventory: InventoryState | null = null;

  constructor(options: MetaMarketingApiSyncAdapterOptions) {
    this.client = options.client;
    this.expectedMetaUserId = options.expectedMetaUserId ?? null;
  }

  private async readCollection<T extends GraphRecord>(
    context: MetaSyncStageContext,
    warnings: SyncWarning[],
    path: string,
    fields: string,
    warningCode: string,
    extraQuery: MetaGraphQuery = {},
    fallbackWithoutExtraQuery = false,
  ): Promise<T[]> {
    throwIfAborted(context.signal);
    const read = (query: MetaGraphQuery): Promise<T[]> =>
      this.client.getAll<T>(
        path,
        { ...query, fields, limit: 500 },
        {
          signal: context.signal,
          maxPages: 1_000,
          maxItems: 1_000_000,
        },
      );
    try {
      return graphItemsWithIds(await read(extraQuery));
    } catch (error) {
      throwIfAborted(context.signal);
      if (
        fallbackWithoutExtraQuery &&
        Object.keys(extraQuery).length > 0 &&
        isBreakdownCompatibilityError(error)
      ) {
        warnings.push({
          code: "META_RESOURCE_FILTER_FALLBACK",
          resource: path,
          message:
            "Meta rejected the inclusive status filter; this edge was retried with Meta's default listing filter.",
        });
        try {
          return graphItemsWithIds(await read({}));
        } catch (fallbackError) {
          throwIfAborted(context.signal);
          warnings.push(warning(warningCode, path, fallbackError));
          return [];
        }
      }
      warnings.push(warning(warningCode, path, error));
      return [];
    }
  }

  private async readCreative(
    context: MetaSyncStageContext,
    warnings: SyncWarning[],
    metaCreativeId: string,
  ): Promise<GraphCreative | null> {
    throwIfAborted(context.signal);
    try {
      const creative = await this.client.request<GraphCreative>(
        metaCreativeId,
        { fields: CREATIVE_FIELDS },
        { signal: context.signal },
      );
      if (optionalString(creative.id)) {
        return creative;
      }
      warnings.push({
        code: "META_CREATIVE_INACCESSIBLE",
        resource: `creative:${metaCreativeId}`,
        message: "Meta returned no creative identity for this wrapper.",
      });
      return null;
    } catch (error) {
      throwIfAborted(context.signal);
      warnings.push(
        warning(
          "META_CREATIVE_INACCESSIBLE",
          `creative:${metaCreativeId}`,
          error,
        ),
      );
      return null;
    }
  }

  async validate(context: MetaSyncStageContext): Promise<SyncStageResult> {
    throwIfAborted(context.signal);
    let user: GraphUser;
    try {
      user = await this.client.request<GraphUser>(
        "me",
        { fields: USER_FIELDS },
        { signal: context.signal },
      );
      if (!optionalString(user.id)) {
        throw new SyncStageError({
          code: "META_INVALID_TOKEN_RESPONSE",
          message: "Meta token validation returned no user identity.",
          retryable: false,
        });
      }
    } catch (error) {
      throwIfAborted(context.signal);
      const needsReauth =
        error instanceof MetaGraphApiError &&
        (error.metaCode === 102 || error.metaCode === 190);
      await context.repository.updateConnectionHealth({
        connectionId: context.connectionId,
        status: needsReauth ? "needs_reauth" : "error",
        errorCode: needsReauth ? "META_TOKEN_INVALID" : "META_VALIDATION_FAILED",
        errorMessage: describeReadError(error),
      });
      if (error instanceof SyncStageError) {
        throw error;
      }
      throw new SyncStageError({
        code: needsReauth ? "META_TOKEN_INVALID" : "META_VALIDATION_FAILED",
        message: describeReadError(error),
        retryable:
          error instanceof MetaGraphApiError
            ? error.isTransient
            : error instanceof MetaGraphRequestError,
      });
    }

    if (this.expectedMetaUserId && user.id !== this.expectedMetaUserId) {
      await context.repository.updateConnectionHealth({
        connectionId: context.connectionId,
        status: "error",
        errorCode: "META_USER_MISMATCH",
        errorMessage: "The stored token belongs to a different Meta user.",
      });
      throw new SyncStageError({
        code: "META_USER_MISMATCH",
        message: "The stored token belongs to a different Meta user.",
        retryable: false,
      });
    }

    let permissions: GraphPermission[];
    try {
      permissions = await this.client.getAll<GraphPermission>(
        "me/permissions",
        { fields: PERMISSION_FIELDS, limit: 200 },
        { signal: context.signal },
      );
    } catch (error) {
      throwIfAborted(context.signal);
      await context.repository.updateConnectionHealth({
        connectionId: context.connectionId,
        status: "error",
        errorCode: "META_PERMISSIONS_UNAVAILABLE",
        errorMessage: describeReadError(error),
      });
      throw new SyncStageError({
        code: "META_PERMISSIONS_UNAVAILABLE",
        message: describeReadError(error),
        retryable:
          error instanceof MetaGraphApiError
            ? error.isTransient
            : error instanceof MetaGraphRequestError,
      });
    }

    const grantedScopes = permissions
      .filter((permission) => permission.status === "granted")
      .map((permission) => permission.permission);
    const granted = new Set(grantedScopes);
    const missingScopes = missingMetaOAuthScopes(grantedScopes);
    if (missingScopes.length > 0) {
      const errorMessage =
        `Meta no longer grants required read permissions: ${missingScopes.join(
          ", ",
        )}.`;
      await context.repository.updateConnectionHealth({
        connectionId: context.connectionId,
        status: "needs_reauth",
        errorCode: "META_PERMISSIONS_REQUIRED",
        errorMessage,
      });
      throw new SyncStageError({
        code: "META_PERMISSIONS_REQUIRED",
        message: errorMessage,
        retryable: false,
      });
    }

    await context.repository.updateConnectionHealth({
      connectionId: context.connectionId,
      status: "connected",
      errorCode: null,
      errorMessage: null,
      validatedAt: new Date().toISOString(),
    });

    return {
      stats: {
        meta_user_id: user.id,
        granted_permissions: granted.size,
        declined_permissions: permissions.filter(
          (permission) => permission.status !== "granted",
        ).length,
      },
      warnings: [],
    };
  }

  private async discoverInventory(
    context: MetaSyncStageContext,
    warnings: SyncWarning[],
  ): Promise<{
    businesses: Map<string, GraphBusiness>;
    accounts: Map<string, GraphAdAccount>;
    pages: Map<string, GraphPage>;
    apps: Map<string, GraphApp>;
    accountRelations: DiscoveredRelation[];
    pageRelations: DiscoveredRelation[];
    appRelations: DiscoveredRelation[];
  }> {
    const businesses = new Map<string, GraphBusiness>();
    const accounts = new Map<string, GraphAdAccount>();
    const pages = new Map<string, GraphPage>();
    const apps = new Map<string, GraphApp>();
    const accountRelations: DiscoveredRelation[] = [];
    const pageRelations: DiscoveredRelation[] = [];
    const appRelations: DiscoveredRelation[] = [];

    const [
      userBusinesses,
      userAccounts,
      userPages,
    ] = await allSettledOrThrow([
      this.readCollection<GraphBusiness>(
        context,
        warnings,
        "me/businesses",
        BUSINESS_FIELDS,
        "META_BUSINESSES_INACCESSIBLE",
      ),
      this.readCollection<GraphAdAccount>(
        context,
        warnings,
        "me/adaccounts",
        AD_ACCOUNT_FIELDS,
        "META_USER_AD_ACCOUNTS_INACCESSIBLE",
      ),
      this.readCollection<GraphPage>(
        context,
        warnings,
        "me/accounts",
        PAGE_FIELDS,
        "META_USER_PAGES_INACCESSIBLE",
      ),
    ]);

    for (const business of userBusinesses) {
      mergeGraphItem(businesses, business.id, business);
    }
    for (const account of userAccounts) {
      const accountMetaId = mergeAdAccount(accounts, account);
      const businessMetaId = optionalString(account.business?.id);
      if (businessMetaId) {
        mergeGraphItem(businesses, businessMetaId, {
          id: businessMetaId,
          name: optionalString(account.business?.name) ?? businessMetaId,
        });
        accountRelations.push({
          businessMetaId,
          assetMetaId: accountMetaId,
          relationship: "accessible",
        });
      }
    }
    for (const page of userPages) {
      mergeGraphItem(pages, page.id, page);
    }

    const businessAssetJobs: Array<() => Promise<void>> = [];
    for (const business of businesses.values()) {
      const edgeRequests = [
        {
          edge: "owned_ad_accounts",
          fields: AD_ACCOUNT_FIELDS,
          relation: "owned" as const,
          kind: "account" as const,
        },
        {
          edge: "client_ad_accounts",
          fields: AD_ACCOUNT_FIELDS,
          relation: "client" as const,
          kind: "account" as const,
        },
        {
          edge: "owned_pages",
          fields: PAGE_FIELDS,
          relation: "owned" as const,
          kind: "page" as const,
        },
        {
          edge: "client_pages",
          fields: PAGE_FIELDS,
          relation: "client" as const,
          kind: "page" as const,
        },
        {
          edge: "owned_apps",
          fields: APP_FIELDS,
          relation: "owned" as const,
          kind: "app" as const,
        },
        {
          edge: "client_apps",
          fields: APP_FIELDS,
          relation: "client" as const,
          kind: "app" as const,
        },
      ];

      for (const request of edgeRequests) {
        businessAssetJobs.push(async () => {
          throwIfAborted(context.signal);
          const path = `${business.id}/${request.edge}`;
          if (request.kind === "account") {
            const values = await this.readCollection<GraphAdAccount>(
              context,
              warnings,
              path,
              request.fields,
              "META_BUSINESS_ASSET_INACCESSIBLE",
            );
            for (const value of values) {
              const assetMetaId = mergeAdAccount(accounts, value);
              accountRelations.push({
                businessMetaId: business.id,
                assetMetaId,
                relationship: request.relation,
              });
            }
          } else if (request.kind === "page") {
            const values = await this.readCollection<GraphPage>(
              context,
              warnings,
              path,
              request.fields,
              "META_BUSINESS_ASSET_INACCESSIBLE",
            );
            for (const value of values) {
              mergeGraphItem(pages, value.id, value);
              pageRelations.push({
                businessMetaId: business.id,
                assetMetaId: value.id,
                relationship: request.relation,
              });
            }
          } else {
            const values = await this.readCollection<GraphApp>(
              context,
              warnings,
              path,
              request.fields,
              "META_BUSINESS_ASSET_INACCESSIBLE",
            );
            for (const value of values) {
              mergeGraphItem(apps, value.id, value);
              appRelations.push({
                businessMetaId: business.id,
                assetMetaId: value.id,
                relationship: request.relation,
              });
            }
          }
        });
      }
    }
    await mapWithConcurrency(
      businessAssetJobs,
      BUSINESS_ASSET_DISCOVERY_CONCURRENCY,
      (job) => job(),
    );

    return {
      businesses,
      accounts,
      pages,
      apps,
      accountRelations,
      pageRelations,
      appRelations,
    };
  }

  private async readAdAccountInventory(
    context: MetaSyncStageContext,
    account: StoredAccount,
  ): Promise<AdAccountInventorySnapshot> {
    const accountPath = canonicalAdAccountId(account.graph);
    const warnings: SyncWarning[] = [];
    const [campaigns, adSets, ads, accountCreatives] =
      await allSettledOrThrow([
        this.readCollection<GraphCampaign>(
          context,
          warnings,
          `${accountPath}/campaigns`,
          CAMPAIGN_FIELDS,
          "META_ACCOUNT_RESOURCE_INACCESSIBLE",
          {
            effective_status: JSON.stringify(CAMPAIGN_EFFECTIVE_STATUSES),
          },
          true,
        ),
        this.readCollection<GraphAdSet>(
          context,
          warnings,
          `${accountPath}/adsets`,
          AD_SET_FIELDS,
          "META_ACCOUNT_RESOURCE_INACCESSIBLE",
          {
            effective_status: JSON.stringify(AD_SET_EFFECTIVE_STATUSES),
          },
          true,
        ),
        this.readCollection<GraphAd>(
          context,
          warnings,
          `${accountPath}/ads`,
          AD_FIELDS,
          "META_ACCOUNT_RESOURCE_INACCESSIBLE",
          {
            effective_status: JSON.stringify(AD_EFFECTIVE_STATUSES),
          },
          true,
        ),
        this.readCollection<GraphCreative>(
          context,
          warnings,
          `${accountPath}/adcreatives`,
          CREATIVE_FIELDS,
          "META_ACCOUNT_RESOURCE_INACCESSIBLE",
        ),
      ]);

    const creativesByMetaId = new Map<string, GraphCreative>();
    for (const creative of accountCreatives) {
      mergeGraphItem(creativesByMetaId, creative.id, creative);
    }
    const attachedCreativeIds = new Set(
      ads
        .map((ad) => optionalString(ad.creative?.id))
        .filter((id): id is string => Boolean(id)),
    );
    const missingCreativeIds = [...attachedCreativeIds].filter(
      (metaCreativeId) => !creativesByMetaId.has(metaCreativeId),
    );
    const missingCreatives = await mapWithConcurrency(
      missingCreativeIds,
      CREATIVE_DETAIL_CONCURRENCY,
      (metaCreativeId) =>
        this.readCreative(context, warnings, metaCreativeId),
    );
    for (const creative of missingCreatives) {
      if (creative) {
        creativesByMetaId.set(creative.id, creative);
      }
    }

    return {
      campaigns,
      adSets,
      ads,
      accountCreatives: [...creativesByMetaId.values()],
      warnings,
    };
  }

  private async syncAdAccount(
    context: MetaSyncStageContext,
    stageWarnings: SyncWarning[],
    state: InventoryState,
    account: StoredAccount,
    pageInternalIds: Map<string, DatabaseId>,
    stats: MutableAssetStats,
    snapshot: AdAccountInventorySnapshot,
  ): Promise<void> {
    const accountPath = canonicalAdAccountId(account.graph);
    const {
      campaigns,
      adSets,
      ads,
      accountCreatives,
      warnings,
    } = snapshot;
    throwIfAborted(context.signal);

    const campaignInputs: CampaignInput[] = campaigns.map((campaign) => ({
      metaCampaignId: campaign.id,
      name: optionalString(campaign.name) ?? campaign.id,
      objective: optionalString(campaign.objective) ?? null,
      status: optionalString(campaign.status) ?? null,
      effectiveStatus: optionalString(campaign.effective_status) ?? null,
      buyingType: optionalString(campaign.buying_type) ?? null,
      startTime: optionalString(campaign.start_time) ?? null,
      stopTime: optionalString(campaign.stop_time) ?? null,
      metaCreatedTime: optionalString(campaign.created_time) ?? null,
      metaUpdatedTime: optionalString(campaign.updated_time) ?? null,
      rawPayload: toJsonObject(campaign),
    }));
    throwIfAborted(context.signal);
    const campaignInternalIds = await context.repository.upsertCampaigns(
      account.internalId,
      campaignInputs,
    );
    stats.campaigns += campaignInternalIds.size;

    let missingCampaignLinks = 0;
    const adSetInputs: AdSetInput[] = [];
    for (const adSet of adSets) {
      const campaignId = optionalString(adSet.campaign_id);
      const campaignInternalId = campaignId
        ? campaignInternalIds.get(campaignId)
        : undefined;
      if (!campaignInternalId) {
        missingCampaignLinks += 1;
        continue;
      }
      adSetInputs.push({
        metaAdSetId: adSet.id,
        campaignId: campaignInternalId,
        name: optionalString(adSet.name) ?? adSet.id,
        status: optionalString(adSet.status) ?? null,
        effectiveStatus: optionalString(adSet.effective_status) ?? null,
        optimizationGoal: optionalString(adSet.optimization_goal) ?? null,
        billingEvent: optionalString(adSet.billing_event) ?? null,
        promotedObject: isRecord(adSet.promoted_object)
          ? toJsonObject(adSet.promoted_object)
          : {},
        startTime: optionalString(adSet.start_time) ?? null,
        endTime: optionalString(adSet.end_time) ?? null,
        metaCreatedTime: optionalString(adSet.created_time) ?? null,
        metaUpdatedTime: optionalString(adSet.updated_time) ?? null,
        rawPayload: toJsonObject(adSet),
      });
    }
    if (missingCampaignLinks > 0) {
      warnings.push({
        code: "META_AD_SET_PARENT_UNAVAILABLE",
        resource: accountPath,
        message: `${missingCampaignLinks} ad sets were skipped because their campaign was inaccessible.`,
      });
    }
    throwIfAborted(context.signal);
    const adSetInternalIds = await context.repository.upsertAdSets(
      account.internalId,
      adSetInputs,
    );
    stats.adSets += adSetInternalIds.size;

    let missingAdLinks = 0;
    const eligibleAds: GraphAd[] = [];
    const adInputs: AdInput[] = [];
    for (const ad of ads) {
      const campaignId = optionalString(ad.campaign_id);
      const adSetId = optionalString(ad.adset_id);
      const campaignInternalId = campaignId
        ? campaignInternalIds.get(campaignId)
        : undefined;
      const adSetInternalId = adSetId
        ? adSetInternalIds.get(adSetId)
        : undefined;
      if (!campaignInternalId || !adSetInternalId) {
        missingAdLinks += 1;
        continue;
      }
      eligibleAds.push(ad);
      const adName = optionalString(ad.name) ?? ad.id;
      const adAlias = normalizeCreativeCode(adName);
      adInputs.push({
        metaAdId: ad.id,
        campaignId: campaignInternalId,
        adSetId: adSetInternalId,
        name: adName,
        creativeCode: adAlias.code,
        status: optionalString(ad.status) ?? null,
        effectiveStatus: optionalString(ad.effective_status) ?? null,
        metaCreatedTime: optionalString(ad.created_time) ?? null,
        metaUpdatedTime: optionalString(ad.updated_time) ?? null,
        rawPayload: {
          ...toJsonObject(ad),
          tracker_alias: {
            raw_name: adAlias.rawName,
            normalized_name: adAlias.normalizedName,
            code: adAlias.code,
            reason: adAlias.reason,
            normalizer_version: adAlias.normalizerVersion,
          },
        },
      });
    }
    if (missingAdLinks > 0) {
      warnings.push({
        code: "META_AD_PARENT_UNAVAILABLE",
        resource: accountPath,
        message: `${missingAdLinks} ads were skipped because their campaign or ad set was inaccessible.`,
      });
    }
    throwIfAborted(context.signal);
    const adInternalIds = await context.repository.upsertAds(
      account.internalId,
      adInputs,
    );
    stats.ads += adInternalIds.size;

    const creativesByMetaId = new Map<string, GraphCreative>();
    for (const creative of accountCreatives) {
      mergeGraphItem(creativesByMetaId, creative.id, creative);
    }
    const adAliasByCreativeId = new Map<string, string>();
    for (const ad of eligibleAds) {
      const metaCreativeId = optionalString(ad.creative?.id);
      const adName = optionalString(ad.name);
      if (
        metaCreativeId &&
        adName &&
        !adAliasByCreativeId.has(metaCreativeId)
      ) {
        adAliasByCreativeId.set(metaCreativeId, adName);
      }
    }
    const extractedByCreative = new Map<
      string,
      PhysicalCreativeAsset[]
    >();
    const creativeInputs: CreativeInput[] = [];
    for (const creative of creativesByMetaId.values()) {
      const assets = extractPhysicalCreativeAssets(creative);
      if (assets.every((asset) => asset.input.assetType === "unknown")) {
        stats.unresolvedPhysicalAssets += 1;
        warnings.push({
          code: "META_CREATIVE_PHYSICAL_ASSET_UNRESOLVED",
          resource: `creative:${creative.id}`,
          message:
            "Meta exposed the creative wrapper but no stable video_id or image_hash; metrics will remain at ad scope.",
        });
      }
      extractedByCreative.set(creative.id, assets);
      const pageMetaId = pageMetaIdFromCreative(creative);
      const alias = normalizeCreativeCode(
        adAliasByCreativeId.get(creative.id) ??
          optionalString(creative.name) ??
          creative.id,
      );
      creativeInputs.push({
        metaCreativeId: creative.id,
        pageId: pageMetaId
          ? pageInternalIds.get(pageMetaId) ?? null
          : null,
        name: optionalString(creative.name) ?? null,
        creativeCode: alias.code,
        creativeFormat: inferredCreativeFormat(creative, assets),
        objectStoryId: optionalString(creative.object_story_id) ?? null,
        effectiveObjectStoryId:
          optionalString(creative.effective_object_story_id) ?? null,
        thumbnailUrl: optionalString(creative.thumbnail_url) ?? null,
        previewUrl:
          optionalString(creative.image_url) ??
          optionalString(creative.thumbnail_url) ??
          null,
        rawPayload: {
          ...toJsonObject(creative),
          tracker_alias: {
            raw_name: alias.rawName,
            normalized_name: alias.normalizedName,
            code: alias.code,
            reason: alias.reason,
            normalizer_version: alias.normalizerVersion,
          },
        },
      });
    }
    throwIfAborted(context.signal);
    const creativeInternalIds = await context.repository.upsertCreatives(
      context.connectionId,
      creativeInputs,
    );
    for (const [metaId, internalId] of creativeInternalIds) {
      state.creativeInternalIds.set(metaId, internalId);
    }
    stats.creatives += creativeInternalIds.size;

    const assetInputsByKey = new Map<string, CreativeAssetInput>();
    for (const assets of extractedByCreative.values()) {
      for (const asset of assets) {
        if (!assetInputsByKey.has(asset.input.assetKey)) {
          assetInputsByKey.set(asset.input.assetKey, asset.input);
        }
      }
    }
    throwIfAborted(context.signal);
    const assetInternalIds = await context.repository.upsertCreativeAssets(
      context.connectionId,
      [...assetInputsByKey.values()],
    );
    stats.creativeAssets += assetInternalIds.size;

    const creativeAssetLinks: CreativeAssetLinkInput[] = [];
    for (const [metaCreativeId, extractedAssets] of extractedByCreative) {
      const creativeInternalId = creativeInternalIds.get(metaCreativeId);
      if (!creativeInternalId) {
        continue;
      }
      const storedAssets: StoredCreativeAsset[] = [];
      for (const extracted of extractedAssets) {
        const creativeAssetId = assetInternalIds.get(
          extracted.input.assetKey,
        );
        if (!creativeAssetId) {
          continue;
        }
        creativeAssetLinks.push({
          creativeId: creativeInternalId,
          creativeAssetId,
          position: extracted.position,
          role: extracted.role,
          source: extracted.source,
        });
        storedAssets.push({
          metaCreativeId,
          creativeId: creativeInternalId,
          creativeAssetId,
          assetKey: extracted.input.assetKey,
          assetType: extracted.input.assetType,
          metaVideoId: extracted.input.metaVideoId,
          metaImageHash: extracted.input.metaImageHash,
        });
      }
      state.assetsByCreative.set(metaCreativeId, storedAssets);
    }
    throwIfAborted(context.signal);
    await context.repository.replaceCreativeAssetLinks(
      [...creativeInternalIds.values()],
      creativeAssetLinks,
    );
    stats.creativeAssetLinks += creativeAssetLinks.length;

    const adCreativeLinks: AdCreativeLinkInput[] = [];
    // Only replace an ad whose referenced creative was fully resolved in this
    // snapshot. A partial creative read must preserve its last known link.
    const replaceableAdIds: DatabaseId[] = [];
    for (const ad of eligibleAds) {
      const adInternalId = adInternalIds.get(ad.id);
      const metaCreativeId = optionalString(ad.creative?.id);
      const creativeInternalId = metaCreativeId
        ? creativeInternalIds.get(metaCreativeId)
        : undefined;
      if (adInternalId && creativeInternalId) {
        replaceableAdIds.push(adInternalId);
        adCreativeLinks.push({
          adId: adInternalId,
          creativeId: creativeInternalId,
          relationship: "primary",
        });
      }
    }
    throwIfAborted(context.signal);
    await context.repository.replaceAdCreativeLinks(
      replaceableAdIds,
      adCreativeLinks,
    );
    stats.adCreativeLinks += adCreativeLinks.length;

    for (const ad of eligibleAds) {
      const internalId = adInternalIds.get(ad.id);
      const campaignId = optionalString(ad.campaign_id);
      const adSetId = optionalString(ad.adset_id);
      const campaignInternalId = campaignId
        ? campaignInternalIds.get(campaignId)
        : undefined;
      const adSetInternalId = adSetId
        ? adSetInternalIds.get(adSetId)
        : undefined;
      if (!internalId || !campaignInternalId || !adSetInternalId) {
        continue;
      }
      const metaCreativeId = optionalString(ad.creative?.id);
      account.ads.set(ad.id, {
        metaAdId: ad.id,
        internalId,
        accountInternalId: account.internalId,
        campaignInternalId,
        adSetInternalId,
        creativeMetaIds:
          metaCreativeId && creativeInternalIds.has(metaCreativeId)
            ? [metaCreativeId]
            : [],
      });
    }
    const incompleteInventoryCodes = new Set([
      "META_ACCOUNT_RESOURCE_INACCESSIBLE",
      "META_AD_SET_PARENT_UNAVAILABLE",
      "META_AD_PARENT_UNAVAILABLE",
      "META_CREATIVE_INACCESSIBLE",
    ]);
    account.inventoryComplete = !warnings.some((item) =>
      incompleteInventoryCodes.has(item.code),
    );
    stageWarnings.push(...warnings);
    if (account.inventoryComplete) {
      throwIfAborted(context.signal);
      await context.repository.reconcileAdAccountInventory({
        adAccountId: account.internalId,
        campaignMetaIds: campaignInputs.map(
          (item) => item.metaCampaignId,
        ),
        adSetMetaIds: adSetInputs.map((item) => item.metaAdSetId),
        adMetaIds: eligibleAds.map((item) => item.id),
      });
    }
  }

  private async performAssetSync(
    context: MetaSyncStageContext,
  ): Promise<{
    result: SyncStageResult;
    state: InventoryState;
  }> {
    const warnings: SyncWarning[] = [];
    const settings = await context.repository.getSettings();
    const discovered = await this.discoverInventory(context, warnings);
    const discoveryComplete = warnings.length === 0;

    const businessInputs: BusinessInput[] = [
      ...discovered.businesses.values(),
    ].map((business) => ({
      metaBusinessId: business.id,
      name: optionalString(business.name) ?? business.id,
      verificationStatus:
        optionalString(business.verification_status) ?? null,
      rawPayload: toJsonObject(business),
    }));
    const accountInputs: AdAccountInput[] = [
      ...discovered.accounts.values(),
    ].map((account) => ({
      metaAdAccountId: canonicalAdAccountId(account),
      accountId: numericAdAccountId(account),
      name: optionalString(account.name) ?? canonicalAdAccountId(account),
      accountStatus: optionalNumber(account.account_status) ?? null,
      disableReason: optionalNumber(account.disable_reason) ?? null,
      currency:
        optionalString(account.currency) ??
        settings.reportingCurrency ??
        "UNKNOWN",
      timezoneName:
        optionalString(account.timezone_name) ?? settings.reportingTimezone,
      timezoneOffsetHoursUtc:
        optionalNumber(account.timezone_offset_hours_utc) ?? null,
      businessName: optionalString(account.business?.name) ?? null,
      rawPayload: toJsonObject(account),
    }));
    const pageInputs: PageInput[] = [...discovered.pages.values()].map(
      (page) => ({
        metaPageId: page.id,
        name: optionalString(page.name) ?? page.id,
        category: optionalString(page.category) ?? null,
        pictureUrl: optionalString(page.picture?.data?.url) ?? null,
        rawPayload: toJsonObject(page),
      }),
    );
    const appInputs: MetaAppInput[] = [...discovered.apps.values()].map(
      (app) => ({
        metaAppId: app.id,
        name: optionalString(app.name) ?? app.id,
        namespace: optionalString(app.namespace) ?? null,
        platform: appPlatform(app),
        storeUrl: optionalString(app.link) ?? null,
        rawPayload: toJsonObject(app),
      }),
    );

    throwIfAborted(context.signal);
    const [
      businessInternalIds,
      accountInternalIds,
      pageInternalIds,
      appInternalIds,
    ] = await allSettledOrThrow([
      context.repository.upsertBusinesses(context.connectionId, businessInputs),
      context.repository.upsertAdAccounts(context.connectionId, accountInputs),
      context.repository.upsertPages(context.connectionId, pageInputs),
      context.repository.upsertApps(context.connectionId, appInputs),
    ]);

    const mapRelations = (
      relations: readonly DiscoveredRelation[],
      assetIds: Map<string, DatabaseId>,
    ): AssetRelationshipInput[] => {
      const unique = new Map<string, AssetRelationshipInput>();
      const relationshipPriority: Record<
        DiscoveredRelation["relationship"],
        number
      > = {
        owned: 3,
        client: 2,
        accessible: 1,
      };
      for (const relation of relations) {
        const businessId = businessInternalIds.get(relation.businessMetaId);
        const assetId = assetIds.get(relation.assetMetaId);
        if (!businessId || !assetId) {
          continue;
        }
        const key = `${businessId}:${assetId}`;
        const existing = unique.get(key);
        if (
          !existing ||
          relationshipPriority[relation.relationship] >
            relationshipPriority[
              existing.relationship as DiscoveredRelation["relationship"]
            ]
        ) {
          unique.set(key, {
            businessId,
            assetId,
            relationship: relation.relationship,
          });
        }
      }
      return [...unique.values()];
    };

    const accountLinks = mapRelations(
      discovered.accountRelations,
      accountInternalIds,
    );
    const pageLinks = mapRelations(
      discovered.pageRelations,
      pageInternalIds,
    );
    const appLinks = mapRelations(
      discovered.appRelations,
      appInternalIds,
    );
    throwIfAborted(context.signal);
    if (discoveryComplete) {
      await context.repository.reconcileConnectionInventory({
        connectionId: context.connectionId,
        businessMetaIds: [...discovered.businesses.keys()],
        adAccountMetaIds: [...discovered.accounts.keys()],
        pageMetaIds: [...discovered.pages.keys()],
        appMetaIds: [...discovered.apps.keys()],
        accountLinks,
        pageLinks,
        appLinks,
      });
    } else {
      await allSettledOrThrow([
        context.repository.linkBusinessAdAccounts(accountLinks),
        context.repository.linkBusinessPages(pageLinks),
        context.repository.linkBusinessApps(appLinks),
      ]);
    }

    const state: InventoryState = {
      syncRunId: context.syncRunId,
      accounts: new Map(),
      creativeInternalIds: new Map(),
      assetsByCreative: new Map(),
    };
    for (const [metaAccountId, accountGraph] of discovered.accounts) {
      const internalId = accountInternalIds.get(metaAccountId);
      if (internalId) {
        state.accounts.set(metaAccountId, {
          graph: accountGraph,
          internalId,
          ads: new Map(),
          inventoryComplete: true,
        });
      }
    }

    const stats: MutableAssetStats = {
      businesses: businessInternalIds.size,
      adAccounts: accountInternalIds.size,
      pages: pageInternalIds.size,
      apps: appInternalIds.size,
      campaigns: 0,
      adSets: 0,
      ads: 0,
      creatives: 0,
      creativeAssets: 0,
      adCreativeLinks: 0,
      creativeAssetLinks: 0,
      unresolvedPhysicalAssets: 0,
    };

    const accounts = [...state.accounts.values()];
    let current = 0;
    await context.reportProgress({
      current,
      total: accounts.length,
      message: `Reading ${accounts.length} Meta ad accounts`,
    });
    const accountSnapshots = await mapWithConcurrency(
      accounts,
      AD_ACCOUNT_ASSET_READ_CONCURRENCY,
      (account) => this.readAdAccountInventory(context, account),
    );
    for (const [index, account] of accounts.entries()) {
      throwIfAborted(context.signal);
      await this.syncAdAccount(
        context,
        warnings,
        state,
        account,
        pageInternalIds,
        stats,
        accountSnapshots[index],
      );
      current += 1;
      await context.reportProgress({
        current,
        total: accounts.length,
        message: `Stored ${canonicalAdAccountId(account.graph)}`,
      });
    }
    const accountInventoriesComplete = [...state.accounts.values()].every(
      (account) => account.inventoryComplete,
    );
    if (discoveryComplete && accountInventoriesComplete) {
      const creativeAssetIds = new Set<DatabaseId>();
      for (const assets of state.assetsByCreative.values()) {
        for (const asset of assets) {
          creativeAssetIds.add(asset.creativeAssetId);
        }
      }
      throwIfAborted(context.signal);
      await context.repository.reconcileConnectionCreativeInventory({
        connectionId: context.connectionId,
        creativeIds: [...state.creativeInternalIds.values()],
        creativeAssetIds: [...creativeAssetIds],
      });
    }
    await context.reportProgress({
      current,
      total: accounts.length,
      message: "Meta asset discovery complete",
    });

    this.inventory = state;
    return {
      state,
      result: {
        stats: statsToJson(stats),
        warnings,
        checkpoint:
          discoveryComplete && accountInventoriesComplete
            ? {
                resourceKey: "meta:assets",
                cursorState: {
                  completed_accounts: current,
                  account_count: state.accounts.size,
                },
                highWaterMark: new Date().toISOString(),
              }
            : undefined,
      },
    };
  }

  async syncAssets(context: MetaSyncStageContext): Promise<SyncStageResult> {
    return (await this.performAssetSync(context)).result;
  }

  private insightWindow(
    context: MetaSyncStageContext,
    account: StoredAccount,
    lookbackDays: number,
    fallbackTimeZone: string,
    warnings: SyncWarning[],
  ): { dateFrom: string; dateTo: string } {
    if (context.window) {
      return validateSyncWindow(context.window);
    }

    const accountTimeZone =
      optionalString(account.graph.timezone_name) ?? fallbackTimeZone;
    let dateTo: string;
    try {
      dateTo = dateInTimeZone(new Date(), accountTimeZone);
    } catch {
      warnings.push({
        code: "META_ACCOUNT_TIMEZONE_INVALID",
        resource: canonicalAdAccountId(account.graph),
        message:
          "The account timezone was invalid; this window used the reporting timezone.",
      });
      try {
        dateTo = dateInTimeZone(new Date(), fallbackTimeZone);
      } catch {
        dateTo = new Date().toISOString().slice(0, 10);
      }
    }
    return {
      dateFrom: addUtcDays(dateTo, -(lookbackDays - 1)),
      dateTo,
    };
  }

  private async readInsightsWithFallback(
    context: MetaSyncStageContext,
    account: StoredAccount,
    dateFrom: string,
    dateTo: string,
    warnings: SyncWarning[],
  ): Promise<{
    rows: MetaInsightRow[];
    breakdownMode: string;
  }> {
    const path = `${canonicalAdAccountId(account.graph)}/insights`;
    let lastError: unknown;

    for (let index = 0; index < BREAKDOWN_ATTEMPTS.length; index += 1) {
      const attempt = BREAKDOWN_ATTEMPTS[index];
      const query: Record<
        string,
        string | number | boolean | readonly string[]
      > = {
        fields: INSIGHT_FIELDS,
        level: "ad",
        time_increment: 1,
        time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
        use_account_attribution_setting: true,
        limit: 500,
      };
      if (attempt.values.length > 0) {
        query.breakdowns = attempt.values;
      }

      try {
        const rows = await this.client.getAll<MetaInsightRow>(
          path,
          query,
          {
            signal: context.signal,
            maxPages: 2_000,
            maxItems: 1_000_000,
          },
        );
        if (index > 0) {
          warnings.push({
            code: "META_INSIGHT_BREAKDOWN_FALLBACK",
            resource: canonicalAdAccountId(account.graph),
            message: `Insights used ${attempt.label} because a richer breakdown combination was unavailable.`,
          });
        }
        return { rows, breakdownMode: attempt.label };
      } catch (error) {
        throwIfAborted(context.signal);
        lastError = error;
        if (
          !isBreakdownCompatibilityError(error) ||
          index === BREAKDOWN_ATTEMPTS.length - 1
        ) {
          throw error;
        }
      }
    }

    throw lastError ?? new Error("No Insights breakdown could be read.");
  }

  /**
   * Supplementary reports for Meta's documented image_asset/video_asset
   * breakdowns. These rows are never trusted on their own: the caller only
   * replaces ad-scope delivery only when every primary delivery dimension and
   * additive KPI reconcile to the primary report for the same ad/day.
   */
  private async readExactAssetInsights(
    context: MetaSyncStageContext,
    account: StoredAccount,
    dateFrom: string,
    dateTo: string,
    warnings: SyncWarning[],
  ): Promise<{ rows: MetaInsightRow[]; modes: string[] }> {
    const path = `${canonicalAdAccountId(account.graph)}/insights`;
    const rows: MetaInsightRow[] = [];
    const modes: string[] = [];

    for (const assetBreakdown of ASSET_BREAKDOWN_FIELDS) {
      for (
        let index = 0;
        index < ASSET_DELIVERY_BREAKDOWN_ATTEMPTS.length;
        index += 1
      ) {
        const deliveryBreakdowns =
          ASSET_DELIVERY_BREAKDOWN_ATTEMPTS[index];
        const breakdowns = [
          assetBreakdown,
          ...deliveryBreakdowns,
        ] as const;
        try {
          const result = await this.client.getAll<MetaInsightRow>(
            path,
            {
              fields: ASSET_INSIGHT_FIELDS,
              level: "ad",
              time_increment: 1,
              time_range: JSON.stringify({
                since: dateFrom,
                until: dateTo,
              }),
              use_account_attribution_setting: true,
              breakdowns,
              limit: 500,
            },
            {
              signal: context.signal,
              maxPages: 2_000,
              maxItems: 1_000_000,
            },
          );
          rows.push(...result);
          modes.push(breakdowns.join(","));
          if (index > 0) {
            warnings.push({
              code: "META_ASSET_BREAKDOWN_FALLBACK",
              resource: canonicalAdAccountId(account.graph),
              message: `${assetBreakdown} used a simpler delivery breakdown combination.`,
            });
          }
          break;
        } catch (error) {
          throwIfAborted(context.signal);
          const hasFallback =
            index < ASSET_DELIVERY_BREAKDOWN_ATTEMPTS.length - 1;
          if (isBreakdownCompatibilityError(error) && hasFallback) {
            continue;
          }
          warnings.push({
            code: "META_ASSET_BREAKDOWN_UNAVAILABLE",
            resource: canonicalAdAccountId(account.graph),
            message: `${assetBreakdown} was unavailable; multi-asset delivery remains safely unallocated.`,
          });
          break;
        }
      }
    }

    return { rows, modes };
  }

  async syncInsights(context: MetaSyncStageContext): Promise<SyncStageResult> {
    const warnings: SyncWarning[] = [];
    let state = this.inventory;
    let implicitAssetStats: JsonObject | null = null;
    if (!state || state.syncRunId !== context.syncRunId) {
      const assetSync = await this.performAssetSync(context);
      state = assetSync.state;
      implicitAssetStats = assetSync.result.stats ?? {};
      warnings.push(...(assetSync.result.warnings ?? []));
    }

    const settings = await context.repository.getSettings();
    const explicitWindow = context.window
      ? validateSyncWindow(context.window)
      : null;
    const actionMapping = {
      installs: {
        actionTypes: settings.installActionTypes,
        strategy: "first-match" as const,
      },
      registrations: {
        actionTypes: settings.registrationActionTypes,
        strategy: "first-match" as const,
      },
    };
    const currentActionMappingVersion =
      actionMappingVersion(actionMapping);

    let accountsSucceeded = 0;
    let rowsFetched = 0;
    let assetBreakdownRowsFetched = 0;
    let exactCoverageGroups = 0;
    let discardedExactCoverageGroups = 0;
    let metricsUpserted = 0;
    let exactRows = 0;
    let singleAssetRows = 0;
    let unallocatedRows = 0;
    let unmappedRows = 0;
    let duplicateRows = 0;
    let conflictingDuplicateRows = 0;
    let accountsSkippedForMapping = 0;
    const video3sSourceRows: Record<ThreeSecondVideoMetricSource, number> = {
      "actions.video_view": 0,
      "legacy.video_3_sec_watched_actions": 0,
      unavailable: 0,
    };
    const breakdownModes: JsonObject = {};
    const accountWindows: JsonObject = {};
    const coveredDateTos: string[] = [];
    const insightAccounts = [...state.accounts.values()];
    let current = 0;
    let insightProgressUpdates = Promise.resolve();
    const markInsightAccountComplete = async (
      account: StoredAccount,
      dateFrom: string,
      dateTo: string,
    ) => {
      current += 1;
      const completed = current;
      insightProgressUpdates = insightProgressUpdates.then(() =>
        context.reportProgress({
          current: completed,
          total: insightAccounts.length,
          message: `Stored insights for ${canonicalAdAccountId(account.graph)}`,
          details: { date_from: dateFrom, date_to: dateTo },
        }),
      );
      await insightProgressUpdates;
    };
    await context.reportProgress({
      current,
      total: insightAccounts.length,
      message: `Reading insights for ${insightAccounts.length} Meta ad accounts`,
    });

    const syncInsightAccount = async (account: StoredAccount) => {
      throwIfAborted(context.signal);
      const { dateFrom, dateTo } =
        explicitWindow ??
        this.insightWindow(
          context,
          account,
          settings.syncLookbackDays,
          settings.reportingTimezone,
          warnings,
        );
      accountWindows[canonicalAdAccountId(account.graph)] = {
        date_from: dateFrom,
        date_to: dateTo,
        account_timezone:
          optionalString(account.graph.timezone_name) ??
          settings.reportingTimezone,
      };

      let result: {
        rows: MetaInsightRow[];
        breakdownMode: string;
      };
      try {
        result = await this.readInsightsWithFallback(
          context,
          account,
          dateFrom,
          dateTo,
          warnings,
        );
      } catch (error) {
        throwIfAborted(context.signal);
        warnings.push(
          warning(
            "META_ACCOUNT_INSIGHTS_INACCESSIBLE",
            canonicalAdAccountId(account.graph),
            error,
          ),
        );
        await markInsightAccountComplete(account, dateFrom, dateTo);
        return;
      }

      const assetResult = await this.readExactAssetInsights(
        context,
        account,
        dateFrom,
        dateTo,
        warnings,
      );
      breakdownModes[canonicalAdAccountId(account.graph)] = {
        delivery: result.breakdownMode,
        asset: assetResult.modes,
      };
      rowsFetched += result.rows.length + assetResult.rows.length;
      assetBreakdownRowsFetched += assetResult.rows.length;

      const primaryByGroup = new Map<string, MetaInsightRow[]>();
      const primaryWithoutGroup: MetaInsightRow[] = [];
      for (const row of result.rows) {
        const key = insightRowGroupKey(row);
        if (!key) {
          primaryWithoutGroup.push(row);
          continue;
        }
        const group = primaryByGroup.get(key) ?? [];
        group.push(row);
        primaryByGroup.set(key, group);
      }

      const exactByGroup = new Map<string, MetaInsightRow[]>();
      const exactNaturalRows = new Map<string, MetaInsightRow>();
      const conflictingExactGroups = new Set<string>();
      for (const row of assetResult.rows) {
        const groupKey = insightRowGroupKey(row);
        const metaAdId = optionalString(row.ad_id);
        const storedAd = metaAdId
          ? account.ads.get(metaAdId)
          : undefined;
        if (!groupKey || !storedAd) continue;
        const candidates = storedAd.creativeMetaIds.flatMap(
          (metaCreativeId) =>
            state.assetsByCreative.get(metaCreativeId) ?? [],
        );
        const allocation = chooseInsightAllocation(
          row,
          `ad:${storedAd.metaAdId}`,
          candidates,
        );
        if (allocation.allocationMethod !== "exact") continue;
        const naturalKey = [
          groupKey,
          allocation.scopeKey,
          optionalString(row.country) ?? "ALL",
          optionalString(row.publisher_platform) ?? "ALL",
          optionalString(row.platform_position) ?? "ALL",
          optionalString(row.impression_device) ?? "ALL",
        ].join("\u001f");
        const existing = exactNaturalRows.get(naturalKey);
        if (existing) {
          if (JSON.stringify(existing) !== JSON.stringify(row)) {
            conflictingExactGroups.add(groupKey);
          }
          continue;
        }
        exactNaturalRows.set(naturalKey, row);
        const group = exactByGroup.get(groupKey) ?? [];
        group.push(row);
        exactByGroup.set(groupKey, group);
      }

      const selectedRows = [...primaryWithoutGroup];
      let discardedForAccount = 0;
      for (const [groupKey, primaryRows] of primaryByGroup) {
        const metaAdId = optionalString(primaryRows[0]?.ad_id);
        const storedAd = metaAdId
          ? account.ads.get(metaAdId)
          : undefined;
        const candidates = storedAd
          ? storedAd.creativeMetaIds.flatMap(
              (metaCreativeId) =>
                state.assetsByCreative.get(metaCreativeId) ?? [],
            )
          : [];
        const candidateCount = new Set(
          candidates
            .filter((candidate) => candidate.assetType !== "unknown")
            .map((candidate) => candidate.assetKey),
        ).size;
        const exactRows = exactByGroup.get(groupKey) ?? [];
        const canUseExact =
          candidateCount > 1 &&
          !conflictingExactGroups.has(groupKey) &&
          exactCoverageMatches(primaryRows, exactRows, actionMapping);
        if (canUseExact) {
          selectedRows.push(...exactRows);
          exactCoverageGroups += 1;
        } else {
          selectedRows.push(...primaryRows);
          if (exactRows.length > 0) {
            discardedForAccount += 1;
            discardedExactCoverageGroups += 1;
          }
        }
      }
      if (discardedForAccount > 0) {
        warnings.push({
          code: "META_ASSET_BREAKDOWN_NOT_RECONCILED",
          resource: canonicalAdAccountId(account.graph),
          message: `${discardedForAccount} ad/day asset groups did not reconcile to delivery totals and remained at ad scope.`,
        });
      }

      const dailyMetrics: DailyMetricInput[] = [];
      let accountUnmappedRows = 0;

      for (const row of selectedRows) {
        const metaAdId = optionalString(row.ad_id);
        const storedAd = metaAdId ? account.ads.get(metaAdId) : undefined;
        const metricDate =
          optionalString(row.date_start) ?? optionalString(row.date_stop);
        if (!storedAd || !metricDate || !validDate(metricDate)) {
          unmappedRows += 1;
          accountUnmappedRows += 1;
          continue;
        }

        const candidates = storedAd.creativeMetaIds.flatMap(
          (metaCreativeId) =>
            state.assetsByCreative.get(metaCreativeId) ?? [],
        );
        const allocation = chooseInsightAllocation(
          row,
          `ad:${storedAd.metaAdId}`,
          candidates,
        );
        if (allocation.allocationMethod === "exact") {
          exactRows += 1;
        } else if (allocation.allocationMethod === "single_asset") {
          singleAssetRows += 1;
        } else {
          unallocatedRows += 1;
        }

        const actions = normalizeMetaActions(row.actions);
        const actionValues = normalizeMetaActions(row.action_values);
        const video3s = resolveThreeSecondVideoActions(
          row,
          actions,
        );
        video3sSourceRows[video3s.source] += 1;
        const video100Actions = normalizeMetaActions(
          row.video_p100_watched_actions,
        );
        const parsed = parseInsightMetrics(
          {
            ...row,
            actions,
            action_values: actionValues,
            video_3_sec_watched_actions: video3s.actions,
            video_p100_watched_actions: video100Actions,
          },
          actionMapping,
        );
        const purchases = extractActionMetric(actions, {
          actionTypes: PURCHASE_ACTION_TYPES,
          strategy: "first-match",
        });
        const purchaseValue = extractActionMetric(actionValues, {
          actionTypes: PURCHASE_ACTION_TYPES,
          strategy: "first-match",
        });
        const linkClicks =
          row.inline_link_clicks === undefined
            ? extractActionMetric(actions, {
                actionTypes: ["link_click"],
                strategy: "first-match",
              })
            : parsed.inlineLinkClicks;

        dailyMetrics.push({
          metricDate,
          adAccountId: storedAd.accountInternalId,
          campaignId: storedAd.campaignInternalId,
          adSetId: storedAd.adSetInternalId,
          adId: storedAd.internalId,
          creativeId: allocation.creativeId,
          creativeAssetId: allocation.creativeAssetId,
          metricScope: allocation.metricScope,
          scopeKey: allocation.scopeKey,
          allocationMethod: allocation.allocationMethod,
          country: optionalString(row.country) ?? "ALL",
          publisherPlatform:
            optionalString(row.publisher_platform) ?? "ALL",
          platformPosition:
            optionalString(row.platform_position) ?? "ALL",
          impressionDevice:
            optionalString(row.impression_device) ?? "ALL",
          attributionWindow:
            optionalString(row.attribution_setting) ??
            optionalString(row.attribution_window) ??
            "account_default",
          accountTimezone:
            optionalString(account.graph.timezone_name) ??
            settings.reportingTimezone,
          currency:
            optionalString(row.account_currency) ??
            optionalString(account.graph.currency) ??
            settings.reportingCurrency ??
            "UNKNOWN",
          spend: parsed.spend,
          impressions: parsed.impressions,
          reportedReach: parsed.reach,
          linkClicks,
          installs: parsed.metaAttributedInstalls,
          registrations: parsed.metaAttributedRegistrations,
          purchases,
          purchaseValue,
          video3sViews: parsed.threeSecondVideoViews,
          video100Views: parsed.completedVideoViews,
          rawActions: actionsAsJson(actions),
          rawActionValues: actionsAsJson(actionValues),
          rawPayload: toJsonObject(row),
          actionMappingVersion: currentActionMappingVersion,
        });
      }

      if (!account.inventoryComplete || accountUnmappedRows > 0) {
        accountsSkippedForMapping += 1;
        warnings.push({
          code: "META_ACCOUNT_METRICS_PRESERVED",
          resource: canonicalAdAccountId(account.graph),
          message:
            "The current asset snapshot could not map every insight row, so previously stored metrics for this window were preserved.",
        });
        await markInsightAccountComplete(account, dateFrom, dateTo);
        return;
      }

      const uniqueDailyMetrics = new Map<string, DailyMetricInput>();
      let accountHasConflictingDuplicate = false;
      for (const metric of dailyMetrics) {
        const naturalKey = dailyMetricNaturalKey(metric);
        const existing = uniqueDailyMetrics.get(naturalKey);
        if (existing) {
          duplicateRows += 1;
          if (
            JSON.stringify(toJsonValue(existing)) !==
            JSON.stringify(toJsonValue(metric))
          ) {
            conflictingDuplicateRows += 1;
            accountHasConflictingDuplicate = true;
          }
          continue;
        }
        uniqueDailyMetrics.set(naturalKey, metric);
      }
      if (accountHasConflictingDuplicate) {
        accountsSkippedForMapping += 1;
        warnings.push({
          code: "META_CONFLICTING_INSIGHT_ROW",
          resource: canonicalAdAccountId(account.graph),
          message:
            "Meta returned conflicting rows for the same metric grain, so the previous account window was preserved.",
        });
        await markInsightAccountComplete(account, dateFrom, dateTo);
        return;
      }
      throwIfAborted(context.signal);
      const storedMetrics =
        await context.repository.replaceDailyMetricsWindow({
          adAccountId: account.internalId,
          dateFrom,
          dateTo,
          metrics: [...uniqueDailyMetrics.values()],
        });
      metricsUpserted += storedMetrics;
      accountsSucceeded += 1;
      coveredDateTos.push(dateTo);
      await markInsightAccountComplete(account, dateFrom, dateTo);
    };

    await mapWithConcurrency(
      insightAccounts,
      AD_ACCOUNT_INSIGHT_SYNC_CONCURRENCY,
      syncInsightAccount,
    );

    if (unmappedRows > 0) {
      warnings.push({
        code: "META_INSIGHT_ROW_UNMAPPED",
        resource: "insights",
        message: `${unmappedRows} insight rows were skipped because their ad or metric date could not be mapped.`,
      });
    }
    if (duplicateRows > 0) {
      warnings.push({
        code: "META_DUPLICATE_INSIGHT_ROW",
        resource: "insights",
        message: `${duplicateRows} duplicate insight rows were detected at the database natural key.`,
      });
    }

    await context.reportProgress({
      current,
      total: state.accounts.size,
      message: "Meta daily insights complete",
    });

    const allAccountsCovered =
      state.accounts.size > 0 &&
      accountsSucceeded === state.accounts.size;
    const coveredThrough = allAccountsCovered
      ? [...coveredDateTos].sort()[0]
      : null;

    return {
      stats: {
        date_from: explicitWindow?.dateFrom ?? null,
        date_to: explicitWindow?.dateTo ?? null,
        account_windows: accountWindows,
        accounts_attempted: state.accounts.size,
        accounts_succeeded: accountsSucceeded,
        accounts_preserved_on_partial_mapping: accountsSkippedForMapping,
        rows_fetched: rowsFetched,
        asset_breakdown_rows_fetched: assetBreakdownRowsFetched,
        exact_asset_coverage_groups: exactCoverageGroups,
        discarded_exact_asset_coverage_groups:
          discardedExactCoverageGroups,
        metrics_upserted: metricsUpserted,
        exact_asset_rows: exactRows,
        single_asset_rows: singleAssetRows,
        unallocated_ad_rows: unallocatedRows,
        unmapped_rows: unmappedRows,
        duplicate_rows: duplicateRows,
        conflicting_duplicate_rows: conflictingDuplicateRows,
        video_3s_source_rows: {
          actions_video_view:
            video3sSourceRows["actions.video_view"],
          legacy_direct_field:
            video3sSourceRows["legacy.video_3_sec_watched_actions"],
          unavailable: video3sSourceRows.unavailable,
        },
        breakdown_modes: breakdownModes,
        ...(implicitAssetStats
          ? { implicit_asset_sync: implicitAssetStats }
          : {}),
      },
      warnings,
      checkpoint:
        coveredThrough
          ? {
              resourceKey: "meta:insights",
              cursorState: {
                account_windows: accountWindows,
                accounts_completed: current,
              },
              highWaterMark: `${coveredThrough}T23:59:59.999Z`,
            }
          : undefined,
    };
  }
}

export function createMetaSyncAdapter(
  options: MetaMarketingApiSyncAdapterOptions,
): MetaMarketingApiSyncAdapter {
  return new MetaMarketingApiSyncAdapter(options);
}

/**
 * Server-side factory for a repository-backed connection. The plaintext token
 * exists only long enough to construct the GET-only MetaGraphClient and is
 * never returned to callers.
 */
export async function createStoredMetaSyncAdapter(
  options: StoredMetaSyncAdapterFactoryOptions,
): Promise<MetaMarketingApiSyncAdapter> {
  const connection = await options.repository.getConnectionSecret();
  if (!connection || connection.connectionId !== options.connectionId) {
    throw new SyncStageError({
      code: "META_CONNECTION_NOT_FOUND",
      message: "The requested Meta connection is not available.",
      retryable: false,
    });
  }

  const accessToken = decryptMetaToken(
    connection.encryptedAccessToken,
    {
      ...options.decryption,
      binding: options.decryption?.binding ?? connection.metaUserId,
    },
  );
  const client = new MetaGraphClient({
    ...options.graphClient,
    appSecret: options.graphClient?.appSecret ?? process.env.META_APP_SECRET,
    accessToken,
  });
  return createMetaSyncAdapter({
    client,
    expectedMetaUserId: connection.metaUserId,
  });
}

/** Convenience entry point that keeps run orchestration in runMetaSync. */
export async function runStoredMetaSync(
  input: RunStoredMetaSyncInput,
): Promise<RunSyncResult> {
  const { adapterFactory, ...runInput } = input;
  const adapter = await createStoredMetaSyncAdapter({
    repository: runInput.repository,
    connectionId: runInput.connectionId,
    ...adapterFactory,
  });
  return runMetaSync({ ...runInput, adapter });
}
