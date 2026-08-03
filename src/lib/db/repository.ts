import type postgres from "postgres";

import type { DatabaseClient } from "./client";
import { getDatabase, getOptionalDatabase } from "./client";
import { SettingsUpdateConflictError } from "./errors";
import { computeResultMappingVersion } from "./result-mapping-version";
import { sanitizeMetricDisplayPresets } from "@/lib/reporting/metric-preset";
import type {
  ActionMetricDailyInput,
  ActionValueDailyInput,
  AdAccountInput,
  AdCreativeLinkInput,
  AdInventoryFilters,
  AdInventoryPage,
  AdInput,
  AdSetInput,
  AssetRelationshipInput,
  BusinessInput,
  CampaignInventoryFilters,
  CampaignHierarchy,
  CampaignInventoryItem,
  CampaignInventoryPage,
  CampaignInput,
  CanonicalCampaignResultTotals,
  CanonicalCreativeFamilyResultTotals,
  CanonicalResultTrend,
  CanonicalResultTotals,
  CanonicalResultTotalsFilters,
  ConnectionCoverage,
  ConnectionStatus,
  CreateSyncRunInput,
  CreativeAssetInput,
  CreativeAssetLinkInput,
  CreativeInput,
  CreativeLibraryFilters,
  CreativeLibraryItem,
  CreativePerformanceFilters,
  CreativePerformanceItem,
  CreativeTrackerFilters,
  CreativeTrackerItem,
  CreativeTrackerPage,
  DailyMetricInput,
  DatabaseId,
  DeliveryPerformanceFilters,
  DeliveryPerformanceItem,
  DeliveryTrendFilters,
  DeliveryTrendItem,
  JsonObject,
  InsightsFreshnessRecord,
  LiveDeliveryAccountFreshness,
  LiveDeliveryMetricState,
  LiveDeliverySnapshotMetric,
  LiveDeliverySummary,
  LiveDeliverySummaryFilters,
  MetaAppInput,
  MetaAssetInventory,
  MetaBreakdownFilters,
  MetaBreakdownMetricRow,
  MetaConnectionInput,
  MetaConnectionRecord,
  MetaConnectionSecretRecord,
  PageInput,
  PeriodReachFilters,
  PeriodReachResult,
  PeriodReachSnapshotInput,
  SettingsAuditRecord,
  SyncRunRecord,
  TrackerSettings,
  TrackerSettingsUpdate,
} from "./types";

type DatabaseRow = Record<string, unknown>;
const MAX_CREATIVE_LIBRARY_ROWS = 5_001;
const MAX_CREATIVE_PERFORMANCE_ROWS = 5_001;

interface IdRow extends DatabaseRow {
  internal_id: unknown;
  meta_id: string;
}

function asId(value: unknown): DatabaseId {
  return String(value);
}

function asNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : asNumber(value);
}

function asIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function asNullableIso(value: unknown): string | null {
  return value === null || value === undefined ? null : asIso(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function normalizeSelectedAdAccountMetaIds(
  values: readonly string[],
): string[] {
  const normalized = [
    ...new Set(values.map((value) => value.trim()).filter(Boolean)),
  ];
  if (normalized.length > 250) {
    throw new RangeError(
      "A reporting scope cannot contain more than 250 Ad Accounts.",
    );
  }
  return normalized;
}

function asJsonObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }

  return {};
}

function trackerSettingsFromRow(row: DatabaseRow): TrackerSettings {
  return {
    ownerId: asNumber(row.owner_id),
    reportingTimezone: String(row.reporting_timezone),
    reportingCurrency:
      row.reporting_currency === null ? null : String(row.reporting_currency),
    syncLookbackDays: asNumber(row.sync_lookback_days),
    minimumInstallThreshold: asNumber(row.minimum_install_threshold),
    minimumRegistrationThreshold: asNumber(
      row.minimum_registration_threshold,
    ),
    benchmarkMode: row.benchmark_mode as TrackerSettings["benchmarkMode"],
    benchmarkWindowDays: asNumber(row.benchmark_window_days),
    benchmarkByOs: Boolean(row.benchmark_by_os),
    benchmarkByFormat: Boolean(row.benchmark_by_format),
    numberFormat: row.number_format as TrackerSettings["numberFormat"],
    compareDefault:
      row.compare_default as TrackerSettings["compareDefault"],
    scoringWeights: {
      cpi: asNumber(row.scoring_weight_cpi),
      cpa: asNumber(row.scoring_weight_cpa),
      hook: asNumber(row.scoring_weight_hook),
      hold: asNumber(row.scoring_weight_hold),
    },
    syncCadence: row.sync_cadence as TrackerSettings["syncCadence"],
    alertChannel: row.alert_channel as TrackerSettings["alertChannel"],
    installActionTypes: asStringArray(row.install_action_types),
    registrationActionTypes: asStringArray(row.registration_action_types),
    metricDisplayPresets: sanitizeMetricDisplayPresets(
      asJsonObject(row.metric_display_presets),
    ),
    lastInitialSyncAt: asNullableIso(row.last_initial_sync_at),
    updatedAt: asIso(row.updated_at),
  };
}

function asJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function asLiveDeliveryAccountState(
  value: unknown,
): LiveDeliveryAccountFreshness["inventoryState"] {
  return value === "ready" || value === "stale" || value === "unavailable"
    ? value
    : "unavailable";
}

function mapLiveDeliveryAccounts(
  value: unknown,
): LiveDeliveryAccountFreshness[] {
  return asJsonArray(value).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as DatabaseRow;
    const metaAdAccountId = row.metaAdAccountId;
    if (typeof metaAdAccountId !== "string" || !metaAdAccountId.trim()) {
      return [];
    }
    return [
      {
        metaAdAccountId,
        accountTimezone:
          typeof row.accountTimezone === "string"
            ? row.accountTimezone
            : null,
        isOperational: Boolean(row.isOperational),
        deliveryEligible: Boolean(row.deliveryEligible),
        inventoryObservedAt:
          typeof row.inventoryObservedAt === "string"
            ? row.inventoryObservedAt
            : null,
        latestMetricDate:
          typeof row.latestMetricDate === "string"
            ? row.latestMetricDate
            : null,
        inventoryState: asLiveDeliveryAccountState(row.inventoryState),
        deliveryState: asLiveDeliveryAccountState(row.deliveryState),
      },
    ];
  });
}

function liveDeliveryMetric(input: {
  count: unknown;
  state: LiveDeliveryMetricState;
  includedAccounts: number;
  selectedAccounts: number;
}): LiveDeliverySnapshotMetric {
  return {
    value: input.state === "unavailable" ? null : asNumber(input.count),
    state: input.state,
    coverage: {
      includedAccounts: input.includedAccounts,
      selectedAccounts: input.selectedAccounts,
    },
  };
}

function jsonPayload(
  value: unknown,
): postgres.ParameterOrJSON<never> {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError("Database JSON payload must be serializable.");
  }

  // postgres.js applies the JSON/JSONB serializer selected by PostgreSQL for
  // `$n::jsonb` parameters. Passing an already-stringified value would make
  // that serializer encode it a second time as a JSON string.
  return JSON.parse(serialized) as postgres.ParameterOrJSON<never>;
}

function creativeAssetLinkPayload(
  links: readonly CreativeAssetLinkInput[],
) {
  const uniqueLinks = new Map<
    string,
    {
      creative_id: DatabaseId;
      creative_asset_id: DatabaseId;
      position: number;
      role: string;
      source: string;
    }
  >();

  for (const link of links) {
    const normalized = {
      creative_id: link.creativeId,
      creative_asset_id: link.creativeAssetId,
      position: link.position ?? 0,
      role: link.role ?? "primary",
      source: link.source ?? "creative",
    };
    uniqueLinks.set(
      JSON.stringify([
        normalized.creative_id,
        normalized.creative_asset_id,
        normalized.position,
        normalized.role,
      ]),
      normalized,
    );
  }

  return [...uniqueLinks.values()];
}

function adCreativeLinkPayload(
  links: readonly AdCreativeLinkInput[],
) {
  const uniqueLinks = new Map<
    string,
    {
      ad_id: DatabaseId;
      creative_id: DatabaseId;
      relationship: string;
    }
  >();

  for (const link of links) {
    const normalized = {
      ad_id: link.adId,
      creative_id: link.creativeId,
      relationship: link.relationship ?? "primary",
    };
    uniqueLinks.set(
      JSON.stringify([normalized.ad_id, normalized.creative_id]),
      normalized,
    );
  }

  return [...uniqueLinks.values()];
}

function mapConnection(
  row: DatabaseRow,
  includeToken: false,
): MetaConnectionRecord;
function mapConnection(
  row: DatabaseRow,
  includeToken: true,
): MetaConnectionSecretRecord;
function mapConnection(
  row: DatabaseRow,
  includeToken: boolean,
): MetaConnectionRecord | MetaConnectionSecretRecord {
  const base: MetaConnectionRecord = {
    connectionId: asId(row.connection_id),
    ownerId: asNumber(row.owner_id),
    metaUserId: String(row.meta_user_id),
    metaUserName:
      row.meta_user_name === null ? null : String(row.meta_user_name),
    grantedScopes: asStringArray(row.granted_scopes),
    declinedScopes: asStringArray(row.declined_scopes),
    tokenExpiresAt: asNullableIso(row.token_expires_at),
    dataAccessExpiresAt: asNullableIso(row.data_access_expires_at),
    status: row.status as MetaConnectionRecord["status"],
    lastValidatedAt: asNullableIso(row.last_validated_at),
    lastErrorCode:
      row.last_error_code === null ? null : String(row.last_error_code),
    lastErrorMessage:
      row.last_error_message === null ? null : String(row.last_error_message),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };

  if (!includeToken) {
    return base;
  }

  return {
    ...base,
    encryptedAccessToken: String(row.encrypted_access_token),
  };
}

function mapSyncRun(row: DatabaseRow): SyncRunRecord {
  return {
    syncRunId: asId(row.sync_run_id),
    connectionId: asId(row.connection_id),
    requestKey: row.request_key === null ? null : String(row.request_key),
    syncKind: row.sync_kind as SyncRunRecord["syncKind"],
    triggerSource: row.trigger_source as SyncRunRecord["triggerSource"],
    status: row.status as SyncRunRecord["status"],
    windowStart:
      row.window_start === null ? null : String(row.window_start),
    windowEnd: row.window_end === null ? null : String(row.window_end),
    startedAt: asNullableIso(row.started_at),
    finishedAt: asNullableIso(row.finished_at),
    currentStage:
      row.current_stage === null ? null : String(row.current_stage),
    progress: asJsonObject(row.progress),
    stats: asJsonObject(row.stats),
    errorCode: row.error_code === null ? null : String(row.error_code),
    errorMessage:
      row.error_message === null ? null : String(row.error_message),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

const CANONICAL_RESULT_KEY_PATTERN =
  /^[a-z0-9][a-z0-9._-]*$/;
const ACCOUNT_DEFAULT_ATTRIBUTION_WINDOW = "account_default";

function canonicalResultFactKey(
  metric: DailyMetricInput,
  canonicalResultKey: string,
): string {
  return [
    metric.adId,
    metric.metricDate,
    canonicalResultKey,
    metric.attributionWindow ?? ACCOUNT_DEFAULT_ATTRIBUTION_WINDOW,
    metric.actionReportTime,
  ].join("\u001f");
}

function normalizedDailyAttributionWindow(
  metric: DailyMetricInput,
): string {
  return (
    metric.attributionWindow?.trim() ||
    ACCOUNT_DEFAULT_ATTRIBUTION_WINDOW
  );
}

function addConcreteAttributionWindow(
  attributionByAccount: Map<DatabaseId, string>,
  adAccountId: DatabaseId,
  attributionWindow: string,
  conflictMessage: string,
): void {
  if (attributionWindow === ACCOUNT_DEFAULT_ATTRIBUTION_WINDOW) {
    return;
  }
  const existing = attributionByAccount.get(adAccountId);
  if (existing !== undefined && existing !== attributionWindow) {
    throw new TypeError(conflictMessage);
  }
  attributionByAccount.set(adAccountId, attributionWindow);
}

function assertSingleDailyMetricAttributionWindow(
  metrics: readonly DailyMetricInput[],
): Map<DatabaseId, string> {
  const attributionByAccount = new Map<DatabaseId, string>();
  for (const metric of metrics) {
    const attributionWindow = normalizedDailyAttributionWindow(metric);
    addConcreteAttributionWindow(
      attributionByAccount,
      metric.adAccountId,
      attributionWindow,
      "Atomic daily metric publish cannot include multiple concrete attribution windows for one ad account.",
    );
  }
  return attributionByAccount;
}

function assertSinglePeriodReachAttributionWindow(
  snapshots: readonly PeriodReachSnapshotInput[],
): Map<DatabaseId, string> {
  const attributionByAccount = new Map<DatabaseId, string>();
  for (const snapshot of snapshots) {
    const attributionWindow = snapshot.attributionWindow.trim();
    if (!attributionWindow) {
      throw new TypeError(
        "Atomic daily metric publish requires a period Reach attribution window.",
      );
    }
    addConcreteAttributionWindow(
      attributionByAccount,
      snapshot.adAccountId,
      attributionWindow,
      "Atomic daily metric publish cannot include multiple concrete period Reach attribution windows for one ad account.",
    );
  }
  return attributionByAccount;
}

function canonicalResultFacts(
  metrics: readonly DailyMetricInput[],
): {
  actionMetrics: ActionMetricDailyInput[];
  actionValues: ActionValueDailyInput[];
} {
  type MetricAccumulator = Omit<
    ActionMetricDailyInput,
    "value" | "selectedActionTypes"
  > & {
    value: number;
    selectedActionTypes: Set<string>;
  };
  type ValueAccumulator = Omit<
    ActionValueDailyInput,
    "value" | "selectedActionTypes"
  > & {
    value: number;
    selectedActionTypes: Set<string>;
  };

  const actionMetrics = new Map<string, MetricAccumulator>();
  const actionValues = new Map<string, ValueAccumulator>();

  for (const metric of metrics) {
    const currency = metric.currency.trim().toUpperCase();
    const resultMappingVersion =
      metric.resultMappingVersion?.trim() ?? "";
    const hasCanonicalFacts =
      (metric.canonicalResultMetrics?.length ?? 0) > 0 ||
      (metric.canonicalResultValues?.length ?? 0) > 0;
    if (!currency) {
      throw new TypeError(
        "Canonical result facts require a source currency.",
      );
    }
    if (hasCanonicalFacts && !resultMappingVersion) {
      throw new TypeError(
        "Canonical result facts require a result mapping version.",
      );
    }
    const base = {
      metricDate: metric.metricDate,
      adAccountId: metric.adAccountId,
      campaignId: metric.campaignId,
      adId: metric.adId,
      attributionWindow:
        metric.attributionWindow ?? "account_default",
      actionReportTime: metric.actionReportTime,
      currency,
      syncVersion: metric.syncVersion,
      resultMappingVersion,
      fetchedAt: metric.fetchedAt,
    };

    for (const fact of metric.canonicalResultMetrics ?? []) {
      const canonicalResultKey = fact.canonicalResultKey.trim();
      const selectedActionType = fact.selectedActionType.trim();
      if (
        !CANONICAL_RESULT_KEY_PATTERN.test(canonicalResultKey) ||
        !selectedActionType ||
        !Number.isFinite(fact.value) ||
        fact.value < 0
      ) {
        throw new TypeError(
          "Canonical action metric fact is invalid.",
        );
      }
      const key = canonicalResultFactKey(
        metric,
        canonicalResultKey,
      );
      const existing = actionMetrics.get(key);
      if (existing) {
        if (existing.currency !== currency) {
          throw new TypeError(
            "Canonical action metric fact cannot mix currencies.",
          );
        }
        existing.value += fact.value;
        existing.selectedActionTypes.add(selectedActionType);
      } else {
        actionMetrics.set(key, {
          ...base,
          canonicalResultKey,
          value: fact.value,
          selectedActionTypes: new Set([selectedActionType]),
        });
      }
    }

    for (const fact of metric.canonicalResultValues ?? []) {
      const canonicalResultKey = fact.canonicalResultKey.trim();
      const selectedActionType = fact.selectedActionType.trim();
      if (
        !CANONICAL_RESULT_KEY_PATTERN.test(canonicalResultKey) ||
        !selectedActionType ||
        !currency ||
        !Number.isFinite(fact.value) ||
        fact.value < 0
      ) {
        throw new TypeError(
          "Canonical action value fact is invalid.",
        );
      }
      const key = canonicalResultFactKey(
        metric,
        canonicalResultKey,
      );
      const existing = actionValues.get(key);
      if (existing) {
        if (existing.currency !== currency) {
          throw new TypeError(
            "Canonical action value fact cannot mix currencies.",
          );
        }
        existing.value += fact.value;
        existing.selectedActionTypes.add(selectedActionType);
      } else {
        actionValues.set(key, {
          ...base,
          canonicalResultKey,
          currency,
          value: fact.value,
          selectedActionTypes: new Set([selectedActionType]),
        });
      }
    }
  }

  return {
    actionMetrics: [...actionMetrics.values()].map((fact) => ({
      ...fact,
      selectedActionTypes: [...fact.selectedActionTypes].sort(),
    })),
    actionValues: [...actionValues.values()].map((fact) => ({
      ...fact,
      selectedActionTypes: [...fact.selectedActionTypes].sort(),
    })),
  };
}

type CanonicalResultEntityGrain = "campaign" | "creative_family";

function normalizeCanonicalEntityResultFilters(
  input: CanonicalResultTotalsFilters,
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.dateFrom) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.dateTo) ||
    input.dateFrom > input.dateTo ||
    !input.attributionWindow.trim() ||
    !input.syncVersion.trim() ||
    !input.resultMappingVersion.trim()
  ) {
    throw new TypeError(
      "Canonical entity result filters are invalid.",
    );
  }

  const objectiveOwners = new Map<string, string>();
  for (const mapping of input.objectiveMappings) {
    const objectiveKey = mapping.objectiveKey
      .trim()
      .toLowerCase();
    if (!objectiveKey) continue;
    for (const rawKey of [
      mapping.objectiveKey,
      ...mapping.rawObjectiveKeys,
    ]) {
      const normalizedRawKey = rawKey.trim().toUpperCase();
      if (!normalizedRawKey) continue;
      const owner = objectiveOwners.get(normalizedRawKey);
      if (owner && owner !== objectiveKey) {
        throw new TypeError(
          "One raw objective cannot map to multiple canonical objectives.",
        );
      }
      objectiveOwners.set(normalizedRawKey, objectiveKey);
    }
  }

  return {
    adAccountIds: [
      ...new Set(
        (input.adAccountIds ?? [])
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ],
    campaignMetaIds: [
      ...new Set(
        (input.campaignMetaIds ?? [])
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ],
    objectiveKeys: [
      ...new Set(
        (input.objectiveKeys ?? [])
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean),
      ),
    ],
    objectiveMappingPayload: [...objectiveOwners].map(
      ([rawObjectiveKey, objectiveKey]) => ({
        objective_key: objectiveKey,
        raw_objective_key: rawObjectiveKey,
      }),
    ),
    currency: input.currency?.trim().toUpperCase() || null,
    attributionWindow: input.attributionWindow.trim(),
    syncVersion: input.syncVersion.trim(),
    resultMappingVersion: input.resultMappingVersion.trim(),
  };
}

export class TrackerRepository {
  constructor(readonly database: DatabaseClient) {}

  private async query<T extends DatabaseRow>(
    query: string,
    parameters: postgres.ParameterOrJSON<never>[] = [],
  ): Promise<T[]> {
    return (await this.database.unsafe(
      query,
      parameters,
    )) as unknown as T[];
  }

  /**
   * Atomically claims the single-owner deployment or refreshes the existing
   * connection for the same Meta user. A different Meta user receives null
   * without changing the owner row.
   */
  async claimOrRefreshConnection(
    input: MetaConnectionInput,
  ): Promise<MetaConnectionRecord | null> {
    const rows = await this.query<DatabaseRow>(
      `
        insert into tracker.meta_connections as current_connection (
          owner_id,
          meta_user_id,
          meta_user_name,
          encrypted_access_token,
          granted_scopes,
          declined_scopes,
          token_expires_at,
          data_access_expires_at,
          status,
          last_validated_at,
          last_error_code,
          last_error_message
        ) values (
          1,
          $1,
          $2,
          $3,
          $4::text[],
          $5::text[],
          $6::timestamptz,
          $7::timestamptz,
          $8,
          now(),
          null,
          null
        )
        on conflict (owner_id) do update set
          meta_user_id = excluded.meta_user_id,
          meta_user_name = excluded.meta_user_name,
          encrypted_access_token = excluded.encrypted_access_token,
          granted_scopes = excluded.granted_scopes,
          declined_scopes = excluded.declined_scopes,
          token_expires_at = excluded.token_expires_at,
          data_access_expires_at = excluded.data_access_expires_at,
          status = excluded.status,
          last_validated_at = now(),
          last_error_code = null,
          last_error_message = null
        where current_connection.meta_user_id = excluded.meta_user_id
        returning *
      `,
      [
        input.metaUserId,
        input.metaUserName ?? null,
        input.encryptedAccessToken,
        input.grantedScopes ?? [],
        input.declinedScopes ?? [],
        input.tokenExpiresAt ?? null,
        input.dataAccessExpiresAt ?? null,
        input.status ?? "connected",
      ],
    );

    return rows[0] ? mapConnection(rows[0], false) : null;
  }

  async getConnection(): Promise<MetaConnectionRecord | null> {
    const rows = await this.query<DatabaseRow>(
      "select * from tracker.meta_connections where owner_id = 1 limit 1",
    );
    return rows[0] ? mapConnection(rows[0], false) : null;
  }

  /**
   * Server-only sync/auth code may decrypt this opaque envelope. Never return
   * this record from a route or a client component.
   */
  async getConnectionSecret(): Promise<MetaConnectionSecretRecord | null> {
    const rows = await this.query<DatabaseRow>(
      "select * from tracker.meta_connections where owner_id = 1 limit 1",
    );
    return rows[0] ? mapConnection(rows[0], true) : null;
  }

  async updateConnectionHealth(input: {
    connectionId: DatabaseId;
    status: ConnectionStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
    validatedAt?: string | null;
  }): Promise<void> {
    await this.query(
      `
        update tracker.meta_connections
        set
          status = $2,
          last_error_code = $3,
          last_error_message = $4,
          last_validated_at = coalesce($5::timestamptz, last_validated_at)
        where connection_id = $1
      `,
      [
        input.connectionId,
        input.status,
        input.errorCode ?? null,
        input.errorMessage ?? null,
        input.validatedAt ?? null,
      ],
    );
  }

  /**
   * Deletes one owner connection and every dependent Meta/sync record through
   * declared foreign-key cascades. The migration ledger and app settings stay.
   */
  async deleteConnectionCascade(
    connectionId: DatabaseId,
  ): Promise<boolean> {
    const rows = await this.query<DatabaseRow>(
      `
        delete from tracker.meta_connections
        where connection_id = $1
          and owner_id = 1
        returning connection_id
      `,
      [connectionId],
    );
    return rows.length > 0;
  }

  /**
   * Data-deletion endpoint primitive for the single-owner deployment. It
   * removes all Meta-derived data and restores non-secret settings defaults.
   */
  async deleteAllOwnerData(): Promise<{ connectionsDeleted: number }> {
    let connectionsDeleted = 0;

    await this.database.begin(async (transaction) => {
      const rows = (await transaction.unsafe(
        `
          delete from tracker.meta_connections
          where owner_id = 1
          returning connection_id
        `,
      )) as unknown as DatabaseRow[];
      connectionsDeleted = rows.length;

      await transaction.unsafe(`
        update tracker.app_settings
        set
          reporting_timezone = 'Asia/Ho_Chi_Minh',
          reporting_currency = null,
          sync_lookback_days = 30,
          minimum_install_threshold = 20,
          minimum_registration_threshold = 10,
          benchmark_mode = 'os',
          benchmark_window_days = 30,
          benchmark_by_os = true,
          benchmark_by_format = true,
          number_format = 'vi-VN',
          compare_default = 'previous_period',
          scoring_weight_cpi = 40,
          scoring_weight_cpa = 40,
          scoring_weight_hook = 10,
          scoring_weight_hold = 10,
          sync_cadence = 'deployment',
          alert_channel = 'none',
          metric_display_presets = '{"version":1,"presets":{}}'::jsonb,
          install_action_types = array[
            'mobile_app_install',
            'omni_app_install',
            'app_install'
          ],
          registration_action_types = array[
            'complete_registration',
            'omni_complete_registration',
            'mobile_app_complete_registration'
          ],
          last_initial_sync_at = null
        where owner_id = 1
      `);
    });

    return { connectionsDeleted };
  }

  async getSettings(): Promise<TrackerSettings> {
    const rows = await this.query<DatabaseRow>(
      "select * from tracker.app_settings where owner_id = 1",
    );
    const row = rows[0];
    return trackerSettingsFromRow(row);
  }

  async listSettingsAuditLog(): Promise<SettingsAuditRecord[]> {
    const rows = await this.query<DatabaseRow>(
      `
        select
          settings_audit_id,
          changed_at,
          changed_by,
          before_state,
          after_state
        from tracker.settings_audit_log
        where owner_id = 1
        order by changed_at desc, settings_audit_id desc
      `,
    );

    return rows.map((row) => ({
      settingsAuditId: asId(row.settings_audit_id),
      changedAt: asIso(row.changed_at),
      changedBy: String(row.changed_by),
      beforeState: asJsonObject(row.before_state),
      afterState: asJsonObject(row.after_state),
    }));
  }

  async updateSettings(
    update: TrackerSettingsUpdate,
  ): Promise<TrackerSettings> {
    const {
      expectedUpdatedAt,
      installActionTypes,
      registrationActionTypes,
      ...settingsUpdate
    } = update;
    const row = await this.database.begin(async (transaction) => {
      const lockedRows = (await transaction.unsafe(
        "select * from tracker.app_settings where owner_id = 1 for update",
      )) as unknown as DatabaseRow[];
      const lockedRow = lockedRows[0];
      if (!lockedRow) {
        throw new Error("Owner settings row was not found.");
      }
      const current = trackerSettingsFromRow(lockedRow);
      if (expectedUpdatedAt && current.updatedAt !== expectedUpdatedAt) {
        throw new SettingsUpdateConflictError();
      }
      const next: TrackerSettings = {
        ...current,
        ...settingsUpdate,
        ...(installActionTypes
          ? { installActionTypes: [...installActionTypes] }
          : {}),
        ...(registrationActionTypes
          ? {
              registrationActionTypes: [
                ...registrationActionTypes,
              ],
            }
          : {}),
        ...(settingsUpdate.metricDisplayPresets
          ? {
              metricDisplayPresets: sanitizeMetricDisplayPresets(
                settingsUpdate.metricDisplayPresets,
              ),
            }
          : {}),
      };
      const updated = (await transaction.unsafe(
        `
          update tracker.app_settings
          set
            reporting_timezone = $1,
            reporting_currency = $2,
            sync_lookback_days = $3,
            minimum_install_threshold = $4,
            minimum_registration_threshold = $5,
            benchmark_mode = $6,
            benchmark_window_days = $7,
            benchmark_by_os = $8,
            benchmark_by_format = $9,
            number_format = $10,
            compare_default = $11,
            scoring_weight_cpi = $12,
            scoring_weight_cpa = $13,
            scoring_weight_hook = $14,
            scoring_weight_hold = $15,
            sync_cadence = $16,
            alert_channel = $17,
            install_action_types = $18::text[],
            registration_action_types = $19::text[],
            last_initial_sync_at = $20::timestamptz,
            metric_display_presets = $21::jsonb
          where owner_id = 1
          returning *
        `,
        [
          next.reportingTimezone,
          next.reportingCurrency,
          next.syncLookbackDays,
          next.minimumInstallThreshold,
          next.minimumRegistrationThreshold,
          next.benchmarkMode,
          next.benchmarkWindowDays,
          next.benchmarkByOs,
          next.benchmarkByFormat,
          next.numberFormat,
          next.compareDefault,
          next.scoringWeights.cpi,
          next.scoringWeights.cpa,
          next.scoringWeights.hook,
          next.scoringWeights.hold,
          next.syncCadence,
          next.alertChannel,
          next.installActionTypes,
          next.registrationActionTypes,
          next.lastInitialSyncAt,
          jsonPayload(next.metricDisplayPresets),
        ],
      )) as unknown as DatabaseRow[];
      await transaction.unsafe(
        `
          insert into tracker.settings_audit_log (
            owner_id,
            changed_by,
            before_state,
            after_state
          ) values (1, 'owner', $1::jsonb, $2::jsonb)
        `,
        [jsonPayload(current), jsonPayload(next)],
      );
      const updatedRow = updated[0];
      if (!updatedRow) {
        throw new Error("Owner settings update did not return a row.");
      }
      return updatedRow;
    });
    return trackerSettingsFromRow(row);
  }

  async upsertBusinesses(
    connectionId: DatabaseId,
    businesses: readonly BusinessInput[],
  ): Promise<Map<string, DatabaseId>> {
    if (businesses.length === 0) {
      return new Map();
    }

    const payload = businesses.map((business) => ({
      meta_business_id: business.metaBusinessId,
      name: business.name,
      verification_status: business.verificationStatus ?? null,
      raw_payload: business.rawPayload ?? {},
    }));
    const rows = await this.query<IdRow>(
      `
        with input as (
          select *
          from jsonb_to_recordset($2::jsonb) as item(
            meta_business_id text,
            name text,
            verification_status text,
            raw_payload jsonb
          )
        )
        insert into tracker.meta_businesses (
          connection_id,
          meta_business_id,
          name,
          verification_status,
          is_active,
          last_seen_at,
          raw_payload
        )
        select
          $1,
          meta_business_id,
          name,
          verification_status,
          true,
          now(),
          coalesce(raw_payload, '{}'::jsonb)
        from input
        on conflict (connection_id, meta_business_id) do update set
          name = excluded.name,
          verification_status = excluded.verification_status,
          is_active = true,
          last_seen_at = now(),
          raw_payload = excluded.raw_payload
        returning business_id as internal_id, meta_business_id as meta_id
      `,
      [connectionId, jsonPayload(payload)],
    );

    return new Map(rows.map((row) => [row.meta_id, asId(row.internal_id)]));
  }

  async upsertAdAccounts(
    connectionId: DatabaseId,
    accounts: readonly AdAccountInput[],
  ): Promise<Map<string, DatabaseId>> {
    if (accounts.length === 0) {
      return new Map();
    }

    const payload = accounts.map((account) => ({
      meta_ad_account_id: account.metaAdAccountId,
      account_id: account.accountId,
      name: account.name,
      account_status: account.accountStatus ?? null,
      disable_reason: account.disableReason ?? null,
      currency: account.currency,
      timezone_name: account.timezoneName,
      timezone_offset_hours_utc: account.timezoneOffsetHoursUtc ?? null,
      business_name: account.businessName ?? null,
      raw_payload: account.rawPayload ?? {},
    }));
    const rows = await this.query<IdRow>(
      `
        with input as (
          select *
          from jsonb_to_recordset($2::jsonb) as item(
            meta_ad_account_id text,
            account_id text,
            name text,
            account_status integer,
            disable_reason integer,
            currency text,
            timezone_name text,
            timezone_offset_hours_utc numeric,
            business_name text,
            raw_payload jsonb
          )
        )
        insert into tracker.meta_ad_accounts (
          connection_id,
          meta_ad_account_id,
          account_id,
          name,
          account_status,
          disable_reason,
          currency,
          timezone_name,
          timezone_offset_hours_utc,
          business_name,
          is_active,
          last_seen_at,
          raw_payload
        )
        select
          $1,
          meta_ad_account_id,
          account_id,
          name,
          account_status,
          disable_reason,
          currency,
          timezone_name,
          timezone_offset_hours_utc,
          business_name,
          true,
          now(),
          coalesce(raw_payload, '{}'::jsonb)
        from input
        on conflict (connection_id, meta_ad_account_id) do update set
          account_id = excluded.account_id,
          name = excluded.name,
          account_status = excluded.account_status,
          disable_reason = excluded.disable_reason,
          currency = excluded.currency,
          timezone_name = excluded.timezone_name,
          timezone_offset_hours_utc = excluded.timezone_offset_hours_utc,
          business_name = excluded.business_name,
          is_active = true,
          last_seen_at = now(),
          raw_payload = excluded.raw_payload
        returning ad_account_id as internal_id, meta_ad_account_id as meta_id
      `,
      [connectionId, jsonPayload(payload)],
    );

    return new Map(rows.map((row) => [row.meta_id, asId(row.internal_id)]));
  }

  async upsertPages(
    connectionId: DatabaseId,
    pages: readonly PageInput[],
  ): Promise<Map<string, DatabaseId>> {
    if (pages.length === 0) {
      return new Map();
    }

    const payload = pages.map((page) => ({
      meta_page_id: page.metaPageId,
      name: page.name,
      category: page.category ?? null,
      picture_url: page.pictureUrl ?? null,
      raw_payload: page.rawPayload ?? {},
    }));
    const rows = await this.query<IdRow>(
      `
        with input as (
          select *
          from jsonb_to_recordset($2::jsonb) as item(
            meta_page_id text,
            name text,
            category text,
            picture_url text,
            raw_payload jsonb
          )
        )
        insert into tracker.meta_pages (
          connection_id,
          meta_page_id,
          name,
          category,
          picture_url,
          is_active,
          last_seen_at,
          raw_payload
        )
        select
          $1,
          meta_page_id,
          name,
          category,
          picture_url,
          true,
          now(),
          coalesce(raw_payload, '{}'::jsonb)
        from input
        on conflict (connection_id, meta_page_id) do update set
          name = excluded.name,
          category = excluded.category,
          picture_url = excluded.picture_url,
          is_active = true,
          last_seen_at = now(),
          raw_payload = excluded.raw_payload
        returning page_id as internal_id, meta_page_id as meta_id
      `,
      [connectionId, jsonPayload(payload)],
    );

    return new Map(rows.map((row) => [row.meta_id, asId(row.internal_id)]));
  }

  async upsertApps(
    connectionId: DatabaseId,
    apps: readonly MetaAppInput[],
  ): Promise<Map<string, DatabaseId>> {
    if (apps.length === 0) {
      return new Map();
    }

    const payload = apps.map((app) => ({
      meta_app_id: app.metaAppId,
      name: app.name,
      namespace: app.namespace ?? null,
      platform: app.platform ?? "unknown",
      store_url: app.storeUrl ?? null,
      raw_payload: app.rawPayload ?? {},
    }));
    const rows = await this.query<IdRow>(
      `
        with input as (
          select *
          from jsonb_to_recordset($2::jsonb) as item(
            meta_app_id text,
            name text,
            namespace text,
            platform text,
            store_url text,
            raw_payload jsonb
          )
        )
        insert into tracker.meta_apps (
          connection_id,
          meta_app_id,
          name,
          namespace,
          platform,
          store_url,
          is_active,
          last_seen_at,
          raw_payload
        )
        select
          $1,
          meta_app_id,
          name,
          namespace,
          platform,
          store_url,
          true,
          now(),
          coalesce(raw_payload, '{}'::jsonb)
        from input
        on conflict (connection_id, meta_app_id) do update set
          name = excluded.name,
          namespace = excluded.namespace,
          platform = excluded.platform,
          store_url = excluded.store_url,
          is_active = true,
          last_seen_at = now(),
          raw_payload = excluded.raw_payload
        returning app_id as internal_id, meta_app_id as meta_id
      `,
      [connectionId, jsonPayload(payload)],
    );

    return new Map(rows.map((row) => [row.meta_id, asId(row.internal_id)]));
  }

  async upsertCampaigns(
    adAccountId: DatabaseId,
    campaigns: readonly CampaignInput[],
  ): Promise<Map<string, DatabaseId>> {
    if (campaigns.length === 0) {
      return new Map();
    }

    const payload = campaigns.map((campaign) => ({
      meta_campaign_id: campaign.metaCampaignId,
      name: campaign.name,
      objective: campaign.objective ?? null,
      status: campaign.status ?? null,
      effective_status: campaign.effectiveStatus ?? null,
      buying_type: campaign.buyingType ?? null,
      start_time: campaign.startTime ?? null,
      stop_time: campaign.stopTime ?? null,
      meta_created_time: campaign.metaCreatedTime ?? null,
      meta_updated_time: campaign.metaUpdatedTime ?? null,
      raw_payload: campaign.rawPayload ?? {},
    }));
    const rows = await this.query<IdRow>(
      `
        with input as (
          select *
          from jsonb_to_recordset($2::jsonb) as item(
            meta_campaign_id text,
            name text,
            objective text,
            status text,
            effective_status text,
            buying_type text,
            start_time timestamptz,
            stop_time timestamptz,
            meta_created_time timestamptz,
            meta_updated_time timestamptz,
            raw_payload jsonb
          )
        )
        insert into tracker.meta_campaigns (
          ad_account_id,
          meta_campaign_id,
          name,
          objective,
          status,
          effective_status,
          buying_type,
          start_time,
          stop_time,
          meta_created_time,
          meta_updated_time,
          is_active,
          last_seen_at,
          raw_payload
        )
        select
          $1,
          meta_campaign_id,
          name,
          objective,
          status,
          effective_status,
          buying_type,
          start_time,
          stop_time,
          meta_created_time,
          meta_updated_time,
          true,
          now(),
          coalesce(raw_payload, '{}'::jsonb)
        from input
        on conflict (ad_account_id, meta_campaign_id) do update set
          name = excluded.name,
          objective = excluded.objective,
          status = excluded.status,
          effective_status = excluded.effective_status,
          buying_type = excluded.buying_type,
          start_time = excluded.start_time,
          stop_time = excluded.stop_time,
          meta_created_time = excluded.meta_created_time,
          meta_updated_time = excluded.meta_updated_time,
          is_active = true,
          last_seen_at = now(),
          raw_payload = excluded.raw_payload
        returning campaign_id as internal_id, meta_campaign_id as meta_id
      `,
      [adAccountId, jsonPayload(payload)],
    );

    return new Map(rows.map((row) => [row.meta_id, asId(row.internal_id)]));
  }

  async upsertAdSets(
    adAccountId: DatabaseId,
    adSets: readonly AdSetInput[],
  ): Promise<Map<string, DatabaseId>> {
    if (adSets.length === 0) {
      return new Map();
    }

    const payload = adSets.map((adSet) => ({
      meta_ad_set_id: adSet.metaAdSetId,
      campaign_id: adSet.campaignId,
      name: adSet.name,
      status: adSet.status ?? null,
      effective_status: adSet.effectiveStatus ?? null,
      optimization_goal: adSet.optimizationGoal ?? null,
      billing_event: adSet.billingEvent ?? null,
      promoted_object: adSet.promotedObject ?? {},
      start_time: adSet.startTime ?? null,
      end_time: adSet.endTime ?? null,
      meta_created_time: adSet.metaCreatedTime ?? null,
      meta_updated_time: adSet.metaUpdatedTime ?? null,
      raw_payload: adSet.rawPayload ?? {},
    }));
    const rows = await this.query<IdRow>(
      `
        with input as (
          select *
          from jsonb_to_recordset($2::jsonb) as item(
            meta_ad_set_id text,
            campaign_id bigint,
            name text,
            status text,
            effective_status text,
            optimization_goal text,
            billing_event text,
            promoted_object jsonb,
            start_time timestamptz,
            end_time timestamptz,
            meta_created_time timestamptz,
            meta_updated_time timestamptz,
            raw_payload jsonb
          )
        )
        insert into tracker.meta_ad_sets (
          ad_account_id,
          campaign_id,
          meta_ad_set_id,
          name,
          status,
          effective_status,
          optimization_goal,
          billing_event,
          promoted_object,
          start_time,
          end_time,
          meta_created_time,
          meta_updated_time,
          is_active,
          last_seen_at,
          raw_payload
        )
        select
          $1,
          campaign_id,
          meta_ad_set_id,
          name,
          status,
          effective_status,
          optimization_goal,
          billing_event,
          coalesce(promoted_object, '{}'::jsonb),
          start_time,
          end_time,
          meta_created_time,
          meta_updated_time,
          true,
          now(),
          coalesce(raw_payload, '{}'::jsonb)
        from input
        on conflict (ad_account_id, meta_ad_set_id) do update set
          campaign_id = excluded.campaign_id,
          name = excluded.name,
          status = excluded.status,
          effective_status = excluded.effective_status,
          optimization_goal = excluded.optimization_goal,
          billing_event = excluded.billing_event,
          promoted_object = excluded.promoted_object,
          start_time = excluded.start_time,
          end_time = excluded.end_time,
          meta_created_time = excluded.meta_created_time,
          meta_updated_time = excluded.meta_updated_time,
          is_active = true,
          last_seen_at = now(),
          raw_payload = excluded.raw_payload
        returning ad_set_id as internal_id, meta_ad_set_id as meta_id
      `,
      [adAccountId, jsonPayload(payload)],
    );

    return new Map(rows.map((row) => [row.meta_id, asId(row.internal_id)]));
  }

  async upsertAds(
    adAccountId: DatabaseId,
    ads: readonly AdInput[],
  ): Promise<Map<string, DatabaseId>> {
    if (ads.length === 0) {
      return new Map();
    }

    const payload = ads.map((ad) => ({
      meta_ad_id: ad.metaAdId,
      campaign_id: ad.campaignId,
      ad_set_id: ad.adSetId,
      name: ad.name,
      creative_code: ad.creativeCode ?? null,
      status: ad.status ?? null,
      effective_status: ad.effectiveStatus ?? null,
      meta_created_time: ad.metaCreatedTime ?? null,
      meta_updated_time: ad.metaUpdatedTime ?? null,
      raw_payload: ad.rawPayload ?? {},
    }));
    const rows = await this.query<IdRow>(
      `
        with input as (
          select *
          from jsonb_to_recordset($2::jsonb) as item(
            meta_ad_id text,
            campaign_id bigint,
            ad_set_id bigint,
            name text,
            creative_code text,
            status text,
            effective_status text,
            meta_created_time timestamptz,
            meta_updated_time timestamptz,
            raw_payload jsonb
          )
        )
        insert into tracker.meta_ads (
          ad_account_id,
          campaign_id,
          ad_set_id,
          meta_ad_id,
          name,
          creative_code,
          status,
          effective_status,
          meta_created_time,
          meta_updated_time,
          is_active,
          last_seen_at,
          raw_payload
        )
        select
          $1,
          campaign_id,
          ad_set_id,
          meta_ad_id,
          name,
          creative_code,
          status,
          effective_status,
          meta_created_time,
          meta_updated_time,
          true,
          now(),
          coalesce(raw_payload, '{}'::jsonb)
        from input
        on conflict (ad_account_id, meta_ad_id) do update set
          campaign_id = excluded.campaign_id,
          ad_set_id = excluded.ad_set_id,
          name = excluded.name,
          creative_code = excluded.creative_code,
          status = excluded.status,
          effective_status = excluded.effective_status,
          meta_created_time = excluded.meta_created_time,
          meta_updated_time = excluded.meta_updated_time,
          is_active = true,
          last_seen_at = now(),
          raw_payload = excluded.raw_payload
        returning ad_id as internal_id, meta_ad_id as meta_id
      `,
      [adAccountId, jsonPayload(payload)],
    );

    return new Map(rows.map((row) => [row.meta_id, asId(row.internal_id)]));
  }

  async upsertCreatives(
    connectionId: DatabaseId,
    creatives: readonly CreativeInput[],
  ): Promise<Map<string, DatabaseId>> {
    if (creatives.length === 0) {
      return new Map();
    }

    const payload = creatives.map((creative) => ({
      meta_creative_id: creative.metaCreativeId,
      page_id: creative.pageId ?? null,
      name: creative.name ?? null,
      creative_code: creative.creativeCode ?? null,
      creative_format: creative.creativeFormat ?? "unknown",
      object_story_id: creative.objectStoryId ?? null,
      effective_object_story_id: creative.effectiveObjectStoryId ?? null,
      thumbnail_url: creative.thumbnailUrl ?? null,
      preview_url: creative.previewUrl ?? null,
      meta_created_time: creative.metaCreatedTime ?? null,
      meta_updated_time: creative.metaUpdatedTime ?? null,
      raw_payload: creative.rawPayload ?? {},
    }));
    const rows = await this.query<IdRow>(
      `
        with input as (
          select *
          from jsonb_to_recordset($2::jsonb) as item(
            meta_creative_id text,
            page_id bigint,
            name text,
            creative_code text,
            creative_format text,
            object_story_id text,
            effective_object_story_id text,
            thumbnail_url text,
            preview_url text,
            meta_created_time timestamptz,
            meta_updated_time timestamptz,
            raw_payload jsonb
          )
        )
        insert into tracker.meta_creatives (
          connection_id,
          page_id,
          meta_creative_id,
          name,
          creative_code,
          creative_format,
          object_story_id,
          effective_object_story_id,
          thumbnail_url,
          preview_url,
          meta_created_time,
          meta_updated_time,
          is_active,
          last_seen_at,
          raw_payload
        )
        select
          $1,
          page_id,
          meta_creative_id,
          name,
          creative_code,
          creative_format,
          object_story_id,
          effective_object_story_id,
          thumbnail_url,
          preview_url,
          meta_created_time,
          meta_updated_time,
          true,
          now(),
          coalesce(raw_payload, '{}'::jsonb)
        from input
        on conflict (connection_id, meta_creative_id) do update set
          page_id = excluded.page_id,
          name = excluded.name,
          creative_code = excluded.creative_code,
          creative_format = excluded.creative_format,
          object_story_id = excluded.object_story_id,
          effective_object_story_id = excluded.effective_object_story_id,
          thumbnail_url = excluded.thumbnail_url,
          preview_url = excluded.preview_url,
          meta_created_time = excluded.meta_created_time,
          meta_updated_time = excluded.meta_updated_time,
          is_active = true,
          last_seen_at = now(),
          raw_payload = excluded.raw_payload
        returning creative_id as internal_id, meta_creative_id as meta_id
      `,
      [connectionId, jsonPayload(payload)],
    );

    return new Map(rows.map((row) => [row.meta_id, asId(row.internal_id)]));
  }

  async upsertCreativeAssets(
    connectionId: DatabaseId,
    assets: readonly CreativeAssetInput[],
  ): Promise<Map<string, DatabaseId>> {
    if (assets.length === 0) {
      return new Map();
    }

    const payload = assets.map((asset) => ({
      asset_key: asset.assetKey,
      asset_type: asset.assetType,
      meta_video_id: asset.metaVideoId ?? null,
      meta_image_hash: asset.metaImageHash ?? null,
      name: asset.name ?? null,
      thumbnail_url: asset.thumbnailUrl ?? null,
      preview_url: asset.previewUrl ?? null,
      width: asset.width ?? null,
      height: asset.height ?? null,
      duration_seconds: asset.durationSeconds ?? null,
      raw_payload: asset.rawPayload ?? {},
    }));
    const rows = await this.query<IdRow>(
      `
        with input as (
          select *
          from jsonb_to_recordset($2::jsonb) as item(
            asset_key text,
            asset_type text,
            meta_video_id text,
            meta_image_hash text,
            name text,
            thumbnail_url text,
            preview_url text,
            width integer,
            height integer,
            duration_seconds numeric,
            raw_payload jsonb
          )
        )
        insert into tracker.creative_assets (
          connection_id,
          asset_key,
          asset_type,
          meta_video_id,
          meta_image_hash,
          name,
          thumbnail_url,
          preview_url,
          width,
          height,
          duration_seconds,
          is_active,
          last_seen_at,
          raw_payload
        )
        select
          $1,
          asset_key,
          asset_type,
          meta_video_id,
          meta_image_hash,
          name,
          thumbnail_url,
          preview_url,
          width,
          height,
          duration_seconds,
          true,
          now(),
          coalesce(raw_payload, '{}'::jsonb)
        from input
        on conflict (connection_id, asset_key) do update set
          asset_type = excluded.asset_type,
          meta_video_id = excluded.meta_video_id,
          meta_image_hash = excluded.meta_image_hash,
          name = excluded.name,
          thumbnail_url = excluded.thumbnail_url,
          preview_url = excluded.preview_url,
          width = excluded.width,
          height = excluded.height,
          duration_seconds = excluded.duration_seconds,
          is_active = true,
          last_seen_at = now(),
          raw_payload = excluded.raw_payload
        returning creative_asset_id as internal_id, asset_key as meta_id
      `,
      [connectionId, jsonPayload(payload)],
    );

    return new Map(rows.map((row) => [row.meta_id, asId(row.internal_id)]));
  }

  private async linkBusinessAssets(
    relation: "ad_accounts" | "pages" | "apps",
    links: readonly AssetRelationshipInput[],
  ): Promise<void> {
    if (links.length === 0) {
      return;
    }

    const config = {
      ad_accounts: {
        table: "business_ad_accounts",
        assetColumn: "ad_account_id",
      },
      pages: { table: "business_pages", assetColumn: "page_id" },
      apps: { table: "business_apps", assetColumn: "app_id" },
    }[relation];
    const payload = links.map((link) => ({
      business_id: link.businessId,
      asset_id: link.assetId,
      relationship: link.relationship ?? "accessible",
    }));

    await this.query(
      `
        with input as (
          select *
          from jsonb_to_recordset($1::jsonb) as item(
            business_id bigint,
            asset_id bigint,
            relationship text
          )
        )
        insert into tracker.${config.table} (
          business_id,
          ${config.assetColumn},
          relationship,
          last_seen_at
        )
        select business_id, asset_id, relationship, now()
        from input
        on conflict (business_id, ${config.assetColumn}) do update set
          relationship = excluded.relationship,
          last_seen_at = now()
      `,
      [jsonPayload(payload)],
    );
  }

  linkBusinessAdAccounts(
    links: readonly AssetRelationshipInput[],
  ): Promise<void> {
    return this.linkBusinessAssets("ad_accounts", links);
  }

  linkBusinessPages(links: readonly AssetRelationshipInput[]): Promise<void> {
    return this.linkBusinessAssets("pages", links);
  }

  linkBusinessApps(links: readonly AssetRelationshipInput[]): Promise<void> {
    return this.linkBusinessAssets("apps", links);
  }

  /**
   * Applies a complete top-level Meta asset snapshot. Only call this after all
   * user/business discovery edges succeeded; partial snapshots must keep the
   * previous active flags and relationships.
   */
  async reconcileConnectionInventory(input: {
    connectionId: DatabaseId;
    businessMetaIds: readonly string[];
    adAccountMetaIds: readonly string[];
    pageMetaIds: readonly string[];
    appMetaIds: readonly string[];
    accountLinks: readonly AssetRelationshipInput[];
    pageLinks: readonly AssetRelationshipInput[];
    appLinks: readonly AssetRelationshipInput[];
  }): Promise<void> {
    await this.database.begin(async (transaction) => {
      await transaction.unsafe(
        `
          update tracker.meta_businesses
          set is_active = meta_business_id = any($2::text[])
          where connection_id = $1
        `,
        [input.connectionId, [...input.businessMetaIds]],
      );
      await transaction.unsafe(
        `
          update tracker.meta_ad_accounts
          set is_active = meta_ad_account_id = any($2::text[])
          where connection_id = $1
        `,
        [input.connectionId, [...input.adAccountMetaIds]],
      );
      await transaction.unsafe(
        `
          update tracker.meta_pages
          set is_active = meta_page_id = any($2::text[])
          where connection_id = $1
        `,
        [input.connectionId, [...input.pageMetaIds]],
      );
      await transaction.unsafe(
        `
          update tracker.meta_apps
          set is_active = meta_app_id = any($2::text[])
          where connection_id = $1
        `,
        [input.connectionId, [...input.appMetaIds]],
      );
      await transaction.unsafe(
        `
          delete from tracker.business_ad_accounts relation
          using tracker.meta_businesses business
          where relation.business_id = business.business_id
            and business.connection_id = $1
        `,
        [input.connectionId],
      );
      await transaction.unsafe(
        `
          delete from tracker.business_pages relation
          using tracker.meta_businesses business
          where relation.business_id = business.business_id
            and business.connection_id = $1
        `,
        [input.connectionId],
      );
      await transaction.unsafe(
        `
          delete from tracker.business_apps relation
          using tracker.meta_businesses business
          where relation.business_id = business.business_id
            and business.connection_id = $1
        `,
        [input.connectionId],
      );

      const transactionRepository = new TrackerRepository(
        transaction as unknown as DatabaseClient,
      );
      await transactionRepository.linkBusinessAdAccounts(input.accountLinks);
      await transactionRepository.linkBusinessPages(input.pageLinks);
      await transactionRepository.linkBusinessApps(input.appLinks);
    });
  }

  /**
   * Marks campaigns/ad sets/ads absent from one complete account snapshot
   * inactive, while retaining their history for audit and old date ranges.
   */
  async reconcileAdAccountInventory(input: {
    adAccountId: DatabaseId;
    campaignMetaIds: readonly string[];
    adSetMetaIds: readonly string[];
    adMetaIds: readonly string[];
  }): Promise<void> {
    await this.database.begin(async (transaction) => {
      await transaction.unsafe(
        `
          update tracker.meta_campaigns
          set is_active = meta_campaign_id = any($2::text[])
          where ad_account_id = $1
        `,
        [input.adAccountId, [...input.campaignMetaIds]],
      );
      await transaction.unsafe(
        `
          update tracker.meta_ad_sets
          set is_active = meta_ad_set_id = any($2::text[])
          where ad_account_id = $1
        `,
        [input.adAccountId, [...input.adSetMetaIds]],
      );
      await transaction.unsafe(
        `
          update tracker.meta_ads
          set is_active = meta_ad_id = any($2::text[])
          where ad_account_id = $1
        `,
        [input.adAccountId, [...input.adMetaIds]],
      );
    });
  }

  /**
   * Hides creative wrappers/assets that vanished from a fully successful
   * connection snapshot without deleting historical metric rows.
   */
  async reconcileConnectionCreativeInventory(input: {
    connectionId: DatabaseId;
    creativeIds: readonly DatabaseId[];
    creativeAssetIds: readonly DatabaseId[];
  }): Promise<void> {
    await this.database.begin(async (transaction) => {
      await transaction.unsafe(
        `
          update tracker.meta_creatives
          set is_active = creative_id = any($2::bigint[])
          where connection_id = $1
        `,
        [input.connectionId, [...input.creativeIds]],
      );
      await transaction.unsafe(
        `
          update tracker.creative_assets
          set is_active = creative_asset_id = any($2::bigint[])
          where connection_id = $1
        `,
        [input.connectionId, [...input.creativeAssetIds]],
      );
    });
  }

  async linkCreativeAssets(
    links: readonly CreativeAssetLinkInput[],
  ): Promise<void> {
    if (links.length === 0) {
      return;
    }

    const payload = creativeAssetLinkPayload(links);

    await this.query(
      `
        with input as (
          select *
          from jsonb_to_recordset($1::jsonb) as item(
            creative_id bigint,
            creative_asset_id bigint,
            position integer,
            role text,
            source text
          )
        )
        insert into tracker.creative_asset_links (
          creative_id,
          creative_asset_id,
          position,
          role,
          source
        )
        select
          creative_id,
          creative_asset_id,
          position,
          role,
          source
        from input
        on conflict (creative_id, creative_asset_id, position, role)
        do update set source = excluded.source
      `,
      [jsonPayload(payload)],
    );
  }

  /**
   * Reconciles the complete set of physical assets for the supplied creative
   * wrappers in one SQL statement. This removes links that disappeared in a
   * later Meta snapshot instead of accumulating stale dynamic assets forever.
   */
  async replaceCreativeAssetLinks(
    creativeIds: readonly DatabaseId[],
    links: readonly CreativeAssetLinkInput[],
  ): Promise<void> {
    if (creativeIds.length === 0) return;
    const uniqueCreativeIds = [...new Set(creativeIds)];
    const allowed = new Set(uniqueCreativeIds);
    if (links.some((link) => !allowed.has(link.creativeId))) {
      throw new TypeError("Creative asset links exceed replacement scope.");
    }

    // PostgreSQL data-modifying CTEs share one snapshot, so deleting and
    // reinserting an unchanged primary key in the same statement can still
    // collide. Use two ordered statements inside one transaction instead.
    await this.database.begin(async (transaction) => {
      await transaction.unsafe(
        `
          delete from tracker.creative_asset_links
          where creative_id = any($1::bigint[])
        `,
        [uniqueCreativeIds],
      );

      const transactionRepository = new TrackerRepository(
        transaction as unknown as DatabaseClient,
      );
      await transactionRepository.linkCreativeAssets(links);
    });
  }

  async linkAdsToCreatives(
    links: readonly AdCreativeLinkInput[],
  ): Promise<void> {
    if (links.length === 0) {
      return;
    }

    const payload = adCreativeLinkPayload(links);

    await this.query(
      `
        with input as (
          select *
          from jsonb_to_recordset($1::jsonb) as item(
            ad_id bigint,
            creative_id bigint,
            relationship text
          )
        )
        insert into tracker.ad_creative_links (
          ad_id,
          creative_id,
          relationship,
          last_seen_at
        )
        select ad_id, creative_id, relationship, now()
        from input
        on conflict (ad_id, creative_id) do update set
          relationship = excluded.relationship,
          last_seen_at = now()
      `,
      [jsonPayload(payload)],
    );
  }

  /**
   * Replaces current ad→creative links for a known ad snapshot so creative
   * reassignment cannot leave stale attribution candidates behind.
   */
  async replaceAdCreativeLinks(
    adIds: readonly DatabaseId[],
    links: readonly AdCreativeLinkInput[],
  ): Promise<void> {
    if (adIds.length === 0) return;
    const uniqueAdIds = [...new Set(adIds)];
    const allowed = new Set(uniqueAdIds);
    if (links.some((link) => !allowed.has(link.adId))) {
      throw new TypeError("Ad creative links exceed replacement scope.");
    }

    await this.database.begin(async (transaction) => {
      await transaction.unsafe(
        `
          delete from tracker.ad_creative_links
          where ad_id = any($1::bigint[])
        `,
        [uniqueAdIds],
      );

      const transactionRepository = new TrackerRepository(
        transaction as unknown as DatabaseClient,
      );
      await transactionRepository.linkAdsToCreatives(links);
    });
  }

  async upsertDailyMetrics(
    metrics: readonly DailyMetricInput[],
  ): Promise<number> {
    if (metrics.length === 0) {
      return 0;
    }

    const payload = metrics.map((metric) => ({
      metric_date: metric.metricDate,
      ad_account_id: metric.adAccountId,
      campaign_id: metric.campaignId,
      ad_set_id: metric.adSetId,
      ad_id: metric.adId,
      creative_id: metric.creativeId ?? null,
      creative_asset_id: metric.creativeAssetId ?? null,
      metric_scope: metric.metricScope,
      scope_key: metric.scopeKey,
      allocation_method: metric.allocationMethod,
      country: metric.country ?? "ALL",
      publisher_platform: metric.publisherPlatform ?? "ALL",
      platform_position: metric.platformPosition ?? "ALL",
      impression_device: metric.impressionDevice ?? "ALL",
      attribution_window: metric.attributionWindow ?? "account_default",
      action_report_time: metric.actionReportTime ?? "mixed",
      sync_version: metric.syncVersion ?? "legacy",
      account_timezone: metric.accountTimezone,
      currency: metric.currency,
      spend: metric.spend ?? 0,
      impressions: metric.impressions ?? 0,
      reported_reach: metric.reportedReach ?? 0,
      link_clicks: metric.linkClicks ?? 0,
      installs: metric.installs ?? 0,
      registrations: metric.registrations ?? 0,
      purchases: metric.purchases ?? 0,
      purchase_value: metric.purchaseValue ?? 0,
      video_3s_views: metric.video3sViews ?? 0,
      video_100_views: metric.video100Views ?? 0,
      raw_actions: metric.rawActions ?? [],
      raw_action_values: metric.rawActionValues ?? [],
      raw_payload: metric.rawPayload ?? {},
      action_mapping_version: metric.actionMappingVersion ?? "default",
      fetched_at: metric.fetchedAt ?? new Date().toISOString(),
    }));
    const rows = await this.query<DatabaseRow>(
      `
        with input as (
          select *
          from jsonb_to_recordset($1::jsonb) as item(
            metric_date date,
            ad_account_id bigint,
            campaign_id bigint,
            ad_set_id bigint,
            ad_id bigint,
            creative_id bigint,
            creative_asset_id bigint,
            metric_scope text,
            scope_key text,
            allocation_method text,
            country text,
            publisher_platform text,
            platform_position text,
            impression_device text,
            attribution_window text,
            action_report_time text,
            sync_version text,
            account_timezone text,
            currency text,
            spend numeric,
            impressions bigint,
            reported_reach bigint,
            link_clicks bigint,
            installs numeric,
            registrations numeric,
            purchases numeric,
            purchase_value numeric,
            video_3s_views numeric,
            video_100_views numeric,
            raw_actions jsonb,
            raw_action_values jsonb,
            raw_payload jsonb,
            action_mapping_version text,
            fetched_at timestamptz
          )
        ),
        upserted as (
          insert into tracker.daily_metrics (
            metric_date,
            ad_account_id,
            campaign_id,
            ad_set_id,
            ad_id,
            creative_id,
            creative_asset_id,
            metric_scope,
            scope_key,
            allocation_method,
            country,
            publisher_platform,
            platform_position,
            impression_device,
            attribution_window,
            action_report_time,
            sync_version,
            account_timezone,
            currency,
            spend,
            impressions,
            reported_reach,
            link_clicks,
            installs,
            registrations,
            purchases,
            purchase_value,
            video_3s_views,
            video_100_views,
            raw_actions,
            raw_action_values,
            raw_payload,
            action_mapping_version,
            fetched_at
          )
          select
            metric_date,
            ad_account_id,
            campaign_id,
            ad_set_id,
            ad_id,
            creative_id,
            creative_asset_id,
            metric_scope,
            scope_key,
            allocation_method,
            country,
            publisher_platform,
            platform_position,
            impression_device,
            attribution_window,
            action_report_time,
            sync_version,
            account_timezone,
            currency,
            spend,
            impressions,
            reported_reach,
            link_clicks,
            installs,
            registrations,
            purchases,
            purchase_value,
            video_3s_views,
            video_100_views,
            coalesce(raw_actions, '[]'::jsonb),
            coalesce(raw_action_values, '[]'::jsonb),
            coalesce(raw_payload, '{}'::jsonb),
            action_mapping_version,
            fetched_at
          from input
          on conflict (
            metric_date,
            ad_id,
            scope_key,
            country,
            publisher_platform,
            platform_position,
            impression_device,
            attribution_window,
            action_report_time
          ) do update set
            ad_account_id = excluded.ad_account_id,
            campaign_id = excluded.campaign_id,
            ad_set_id = excluded.ad_set_id,
            creative_id = excluded.creative_id,
            creative_asset_id = excluded.creative_asset_id,
            metric_scope = excluded.metric_scope,
            allocation_method = excluded.allocation_method,
            sync_version = excluded.sync_version,
            account_timezone = excluded.account_timezone,
            currency = excluded.currency,
            spend = excluded.spend,
            impressions = excluded.impressions,
            reported_reach = excluded.reported_reach,
            link_clicks = excluded.link_clicks,
            installs = excluded.installs,
            registrations = excluded.registrations,
            purchases = excluded.purchases,
            purchase_value = excluded.purchase_value,
            video_3s_views = excluded.video_3s_views,
            video_100_views = excluded.video_100_views,
            raw_actions = excluded.raw_actions,
            raw_action_values = excluded.raw_action_values,
            raw_payload = excluded.raw_payload,
            action_mapping_version = excluded.action_mapping_version,
            fetched_at = excluded.fetched_at
          returning 1
        )
        select count(*)::integer as affected_count
        from upserted
      `,
      [jsonPayload(payload)],
    );

    return asNumber(rows[0]?.affected_count);
  }

  async upsertActionMetricDaily(
    facts: readonly ActionMetricDailyInput[],
  ): Promise<number> {
    if (facts.length === 0) return 0;
    const payload = facts.map((fact) => ({
      metric_date: fact.metricDate,
      ad_account_id: fact.adAccountId,
      campaign_id: fact.campaignId,
      ad_id: fact.adId,
      canonical_result_key: fact.canonicalResultKey,
      attribution_window: fact.attributionWindow,
      action_report_time: fact.actionReportTime,
      currency: fact.currency,
      value: fact.value,
      selected_action_types: [...fact.selectedActionTypes],
      sync_version: fact.syncVersion,
      result_mapping_version: fact.resultMappingVersion,
      fetched_at: fact.fetchedAt ?? new Date().toISOString(),
    }));
    const rows = await this.query<DatabaseRow>(
      `
        with input as (
          select *
          from jsonb_to_recordset($1::jsonb) as item(
            metric_date date,
            ad_account_id bigint,
            campaign_id bigint,
            ad_id bigint,
            canonical_result_key text,
            attribution_window text,
            action_report_time text,
            currency text,
            value numeric,
            selected_action_types text[],
            sync_version text,
            result_mapping_version text,
            fetched_at timestamptz
          )
        ),
        upserted as (
          insert into tracker.action_metric_daily (
            metric_date,
            ad_account_id,
            campaign_id,
            ad_id,
            canonical_result_key,
            attribution_window,
            action_report_time,
            currency,
            value,
            selected_action_types,
            sync_version,
            result_mapping_version,
            fetched_at
          )
          select
            metric_date,
            ad_account_id,
            campaign_id,
            ad_id,
            canonical_result_key,
            attribution_window,
            action_report_time,
            currency,
            value,
            selected_action_types,
            sync_version,
            result_mapping_version,
            fetched_at
          from input
          on conflict (
            ad_id,
            metric_date,
            canonical_result_key,
            attribution_window,
            action_report_time
          ) do update set
            ad_account_id = excluded.ad_account_id,
            campaign_id = excluded.campaign_id,
            currency = excluded.currency,
            value = excluded.value,
            selected_action_types = excluded.selected_action_types,
            sync_version = excluded.sync_version,
            result_mapping_version =
              excluded.result_mapping_version,
            fetched_at = excluded.fetched_at
          returning 1
        )
        select count(*)::integer as affected_count
        from upserted
      `,
      [jsonPayload(payload)],
    );
    return asNumber(rows[0]?.affected_count);
  }

  async upsertActionValueDaily(
    facts: readonly ActionValueDailyInput[],
  ): Promise<number> {
    if (facts.length === 0) return 0;
    const payload = facts.map((fact) => ({
      metric_date: fact.metricDate,
      ad_account_id: fact.adAccountId,
      campaign_id: fact.campaignId,
      ad_id: fact.adId,
      canonical_result_key: fact.canonicalResultKey,
      attribution_window: fact.attributionWindow,
      action_report_time: fact.actionReportTime,
      currency: fact.currency,
      value: fact.value,
      selected_action_types: [...fact.selectedActionTypes],
      sync_version: fact.syncVersion,
      result_mapping_version: fact.resultMappingVersion,
      fetched_at: fact.fetchedAt ?? new Date().toISOString(),
    }));
    const rows = await this.query<DatabaseRow>(
      `
        with input as (
          select *
          from jsonb_to_recordset($1::jsonb) as item(
            metric_date date,
            ad_account_id bigint,
            campaign_id bigint,
            ad_id bigint,
            canonical_result_key text,
            attribution_window text,
            action_report_time text,
            currency text,
            value numeric,
            selected_action_types text[],
            sync_version text,
            result_mapping_version text,
            fetched_at timestamptz
          )
        ),
        upserted as (
          insert into tracker.action_value_daily (
            metric_date,
            ad_account_id,
            campaign_id,
            ad_id,
            canonical_result_key,
            attribution_window,
            action_report_time,
            currency,
            value,
            selected_action_types,
            sync_version,
            result_mapping_version,
            fetched_at
          )
          select
            metric_date,
            ad_account_id,
            campaign_id,
            ad_id,
            canonical_result_key,
            attribution_window,
            action_report_time,
            currency,
            value,
            selected_action_types,
            sync_version,
            result_mapping_version,
            fetched_at
          from input
          on conflict (
            ad_id,
            metric_date,
            canonical_result_key,
            attribution_window,
            action_report_time
          ) do update set
            ad_account_id = excluded.ad_account_id,
            campaign_id = excluded.campaign_id,
            currency = excluded.currency,
            value = excluded.value,
            selected_action_types = excluded.selected_action_types,
            sync_version = excluded.sync_version,
            result_mapping_version =
              excluded.result_mapping_version,
            fetched_at = excluded.fetched_at
          returning 1
        )
        select count(*)::integer as affected_count
        from upserted
      `,
      [jsonPayload(payload)],
    );
    return asNumber(rows[0]?.affected_count);
  }

  async upsertPeriodReachSnapshots(
    connectionId: DatabaseId,
    snapshots: readonly PeriodReachSnapshotInput[],
  ): Promise<number> {
    if (snapshots.length === 0) return 0;
    const naturalKeys = new Set<string>();
    for (const snapshot of snapshots) {
      const campaignId = snapshot.campaignId ?? null;
      const naturalKey = [
        snapshot.scopeLevel,
        snapshot.adAccountId,
        campaignId ?? "",
        snapshot.dateFrom,
        snapshot.dateTo,
        snapshot.attributionWindow,
        snapshot.actionReportTime,
        snapshot.syncVersion,
      ].join("\u001f");
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.dateFrom) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.dateTo) ||
        snapshot.dateFrom > snapshot.dateTo ||
        !snapshot.attributionWindow.trim() ||
        !snapshot.syncVersion.trim() ||
        !Number.isSafeInteger(snapshot.reach) ||
        snapshot.reach < 0 ||
        (snapshot.scopeLevel === "account" && campaignId !== null) ||
        (snapshot.scopeLevel === "campaign" && campaignId === null) ||
        naturalKeys.has(naturalKey)
      ) {
        throw new TypeError("Period Reach snapshot is invalid.");
      }
      naturalKeys.add(naturalKey);
    }

    const store = async (
      scopeLevel: "account" | "campaign",
      values: readonly PeriodReachSnapshotInput[],
    ) => {
      if (values.length === 0) return 0;
      const campaignColumn =
        scopeLevel === "campaign" ? "campaign_id," : "";
      const campaignSelect =
        scopeLevel === "campaign" ? "campaign_id," : "";
      const campaignInput =
        scopeLevel === "campaign" ? "campaign_id bigint," : "";
      const campaignConflict =
        scopeLevel === "campaign" ? "campaign_id," : "";
      const payload = values.map((snapshot) => ({
        ad_account_id: snapshot.adAccountId,
        campaign_id: snapshot.campaignId ?? null,
        date_from: snapshot.dateFrom,
        date_to: snapshot.dateTo,
        attribution_window: snapshot.attributionWindow.trim(),
        action_report_time: snapshot.actionReportTime,
        sync_version: snapshot.syncVersion.trim(),
        reach: snapshot.reach,
        fetched_at: snapshot.fetchedAt ?? new Date().toISOString(),
      }));
      const rows = await this.query<DatabaseRow>(
        `
          with input as (
            select *
            from jsonb_to_recordset($2::jsonb) as item(
              ad_account_id bigint,
              ${campaignInput}
              date_from date,
              date_to date,
              attribution_window text,
              action_report_time text,
              sync_version text,
              reach numeric,
              fetched_at timestamptz
            )
          ),
          scoped as (
            select input.*
            from input
            join tracker.meta_ad_accounts account
              on account.ad_account_id = input.ad_account_id
              and account.connection_id = $1
            ${
              scopeLevel === "campaign"
                ? `
                  join tracker.meta_campaigns campaign
                    on campaign.campaign_id = input.campaign_id
                    and campaign.ad_account_id =
                      input.ad_account_id
                `
                : ""
            }
          ),
          upserted as (
            insert into tracker.period_reach_snapshots (
              connection_id,
              ad_account_id,
              ${campaignColumn}
              scope_level,
              date_from,
              date_to,
              attribution_window,
              action_report_time,
              sync_version,
              reach,
              fetched_at
            )
            select
              $1,
              ad_account_id,
              ${campaignSelect}
              '${scopeLevel}',
              date_from,
              date_to,
              attribution_window,
              action_report_time,
              sync_version,
              reach,
              fetched_at
            from scoped
            on conflict (
              connection_id,
              ad_account_id,
              ${campaignConflict}
              date_from,
              date_to,
              attribution_window,
              action_report_time,
              sync_version
            )
            where scope_level = '${scopeLevel}'
            do update set
              reach = excluded.reach,
              fetched_at = excluded.fetched_at
            returning 1
          )
          select count(*)::integer as affected_count
          from upserted
        `,
        [connectionId, jsonPayload(payload)],
      );
      const stored = asNumber(rows[0]?.affected_count);
      if (stored !== values.length) {
        throw new TypeError(
          "Period Reach snapshot scope does not match its connection.",
        );
      }
      return stored;
    };

    return (
      (await store(
        "account",
        snapshots.filter(
          (snapshot) => snapshot.scopeLevel === "account",
        ),
      )) +
      (await store(
        "campaign",
        snapshots.filter(
          (snapshot) => snapshot.scopeLevel === "campaign",
        ),
      ))
    );
  }

  /**
   * Atomically replaces one account's inclusive Insights window. This prevents
   * old rows from surviving when Meta changes a supported breakdown set or a
   * dynamic creative moves between exact, single-asset and unallocated scope.
   */
  async replaceDailyMetricsWindow(input: {
    adAccountId: DatabaseId;
    dateFrom: string;
    dateTo: string;
    metrics: readonly DailyMetricInput[];
  }): Promise<number> {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.dateFrom) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.dateTo) ||
      input.dateFrom > input.dateTo ||
      input.metrics.some(
        (metric) =>
          metric.adAccountId !== input.adAccountId ||
          metric.metricDate < input.dateFrom ||
          metric.metricDate > input.dateTo,
      )
    ) {
      throw new TypeError("Daily metric replacement scope is invalid.");
    }
    const facts = canonicalResultFacts(input.metrics);

    return this.database.begin(async (transaction) => {
      await transaction.unsafe(
        `
          delete from tracker.action_metric_daily
          where ad_account_id = $1
            and metric_date between $2::date and $3::date
        `,
        [input.adAccountId, input.dateFrom, input.dateTo],
      );
      await transaction.unsafe(
        `
          delete from tracker.action_value_daily
          where ad_account_id = $1
            and metric_date between $2::date and $3::date
        `,
        [input.adAccountId, input.dateFrom, input.dateTo],
      );
      await transaction.unsafe(
        `
          delete from tracker.daily_metrics
          where ad_account_id = $1
            and metric_date between $2::date and $3::date
        `,
        [input.adAccountId, input.dateFrom, input.dateTo],
      );
      const transactionRepository = new TrackerRepository(
        transaction as unknown as DatabaseClient,
      );
      const stored = await transactionRepository.upsertDailyMetrics(
        input.metrics,
      );
      await transactionRepository.upsertActionMetricDaily(
        facts.actionMetrics,
      );
      await transactionRepository.upsertActionValueDaily(
        facts.actionValues,
      );
      return stored;
    });
  }

  /**
   * Publishes every successfully fetched account window in one transaction and
   * advances the reporting snapshot pointer only after all replacements are
   * durable. Readers therefore observe either the previous snapshot or the
   * complete new publish, never a per-account half state.
   */
  async publishDailyMetricWindows(input: {
    connectionId: DatabaseId;
    syncRunId: DatabaseId;
    resultMappingVersion: string;
    periodReachSnapshots: readonly PeriodReachSnapshotInput[];
    replacements: readonly {
      adAccountId: DatabaseId;
      dateFrom: string;
      dateTo: string;
      metrics: readonly DailyMetricInput[];
    }[];
  }): Promise<number> {
    const resultMappingVersion = input.resultMappingVersion.trim();
    if (!resultMappingVersion) {
      throw new TypeError(
        "Atomic daily metric publish requires a result mapping version.",
      );
    }
    const accountIds = new Set<DatabaseId>();
    const dailyAttributionByAccount = new Map<DatabaseId, string>();
    for (const replacement of input.replacements) {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(replacement.dateFrom) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(replacement.dateTo) ||
        replacement.dateFrom > replacement.dateTo ||
        accountIds.has(replacement.adAccountId) ||
        replacement.metrics.some(
          (metric) =>
            metric.adAccountId !== replacement.adAccountId ||
            metric.metricDate < replacement.dateFrom ||
            metric.metricDate > replacement.dateTo,
        )
      ) {
        throw new TypeError(
          "Atomic daily metric publish scope is invalid.",
        );
      }
      accountIds.add(replacement.adAccountId);
      const replacementAttribution =
        assertSingleDailyMetricAttributionWindow(replacement.metrics).get(
          replacement.adAccountId,
        );
      if (replacementAttribution !== undefined) {
        dailyAttributionByAccount.set(
          replacement.adAccountId,
          replacementAttribution,
        );
      }
    }

    if (input.replacements.length === 0) {
      if (input.periodReachSnapshots.length > 0) {
        throw new TypeError(
          "Period Reach cannot publish without a metric replacement.",
        );
      }
      return 0;
    }
    const replacementsByAccount = new Map(
      input.replacements.map((replacement) => [
        replacement.adAccountId,
        replacement,
      ]),
    );
    const rawPeriodReachSnapshots = input.periodReachSnapshots.map(
      (snapshot) => ({
        ...snapshot,
        attributionWindow: snapshot.attributionWindow.trim(),
        syncVersion: input.syncRunId,
      }),
    );
    const reachAttributionByAccount =
      assertSinglePeriodReachAttributionWindow(
        rawPeriodReachSnapshots,
      );
    const resolvedAttributionByAccount = new Map(
      dailyAttributionByAccount,
    );
    for (const [adAccountId, reachAttribution] of
      reachAttributionByAccount) {
      const dailyAttribution = resolvedAttributionByAccount.get(
        adAccountId,
      );
      if (
        dailyAttribution !== undefined &&
        dailyAttribution !== reachAttribution
      ) {
        throw new TypeError(
          "Period Reach attribution window does not match its daily metrics.",
        );
      }
      resolvedAttributionByAccount.set(
        adAccountId,
        reachAttribution,
      );
    }
    const periodReachSnapshots = rawPeriodReachSnapshots.map(
      (snapshot) => ({
        ...snapshot,
        attributionWindow:
          resolvedAttributionByAccount.get(snapshot.adAccountId) ??
          ACCOUNT_DEFAULT_ATTRIBUTION_WINDOW,
      }),
    );
    for (const snapshot of periodReachSnapshots) {
      const replacement = replacementsByAccount.get(
        snapshot.adAccountId,
      );
      if (
        !replacement ||
        snapshot.dateFrom !== replacement.dateFrom ||
        snapshot.dateTo !== replacement.dateTo
      ) {
        throw new TypeError(
          "Period Reach snapshot does not match its publish window.",
        );
      }
    }
    for (const replacement of input.replacements) {
      const accountSnapshots = periodReachSnapshots.filter(
        (snapshot) =>
          snapshot.adAccountId === replacement.adAccountId &&
          snapshot.scopeLevel === "account",
      );
      if (accountSnapshots.length !== 1) {
        throw new TypeError(
          "Each published account requires one exact-period Reach snapshot.",
        );
      }
    }
    const windowStart = [...input.replacements]
      .map((replacement) => replacement.dateFrom)
      .sort()
      .at(-1)!;
    const windowEnd = [...input.replacements]
      .map((replacement) => replacement.dateTo)
      .sort()[0];
    const metrics = input.replacements.flatMap((replacement) =>
      replacement.metrics.map((metric) => ({
        ...metric,
        attributionWindow:
          resolvedAttributionByAccount.get(metric.adAccountId) ??
          ACCOUNT_DEFAULT_ATTRIBUTION_WINDOW,
        actionReportTime: metric.actionReportTime ?? "mixed",
        syncVersion: input.syncRunId,
        resultMappingVersion,
      })),
    );
    const facts = canonicalResultFacts(metrics);

    return this.database.begin(async (transaction) => {
      const lockedConnections = await transaction.unsafe(
        `
          select connection_id
          from tracker.meta_connections
          where connection_id = $1
            and owner_id = 1
          for update
        `,
        [input.connectionId],
      );
      if (lockedConnections.length !== 1) {
        throw new TypeError(
          "Atomic daily metric publish connection scope is invalid.",
        );
      }
      const transactionRepository = new TrackerRepository(
        transaction as unknown as DatabaseClient,
      );
      const currentResultMappingVersion = computeResultMappingVersion(
        await transactionRepository.listResultMappings(),
      );
      if (currentResultMappingVersion !== resultMappingVersion) {
        throw new TypeError(
          "Result mappings changed while Insights were syncing; the reporting snapshot was preserved.",
        );
      }

      for (const replacement of input.replacements) {
        await transaction.unsafe(
          `
            delete from tracker.period_reach_snapshots
            where connection_id = $1
              and ad_account_id = $2
              and date_from = $3::date
              and date_to = $4::date
          `,
          [
            input.connectionId,
            replacement.adAccountId,
            replacement.dateFrom,
            replacement.dateTo,
          ],
        );
        await transaction.unsafe(
          `
            delete from tracker.action_metric_daily
            where ad_account_id = $1
              and metric_date between $2::date and $3::date
          `,
          [
            replacement.adAccountId,
            replacement.dateFrom,
            replacement.dateTo,
          ],
        );
        await transaction.unsafe(
          `
            delete from tracker.action_value_daily
            where ad_account_id = $1
              and metric_date between $2::date and $3::date
          `,
          [
            replacement.adAccountId,
            replacement.dateFrom,
            replacement.dateTo,
          ],
        );
        await transaction.unsafe(
          `
            delete from tracker.daily_metrics
            where ad_account_id = $1
              and metric_date between $2::date and $3::date
          `,
          [
            replacement.adAccountId,
            replacement.dateFrom,
            replacement.dateTo,
          ],
        );
      }

      const stored = await transactionRepository.upsertDailyMetrics(
        metrics,
      );
      await transactionRepository.upsertActionMetricDaily(
        facts.actionMetrics,
      );
      await transactionRepository.upsertActionValueDaily(
        facts.actionValues,
      );
      await transactionRepository.upsertPeriodReachSnapshots(
        input.connectionId,
        periodReachSnapshots,
      );
      await transaction.unsafe(
        `
          insert into tracker.reporting_snapshots (
            connection_id,
            sync_run_id,
            sync_version,
            result_mapping_version,
            window_start,
            window_end,
            data_through_at,
            normalized_results_require_resync,
            result_mapping_invalidated_at,
            published_at
          ) values (
            $1,
            $2,
            $3,
            $4,
            $5::date,
            $6::date,
            ($6::date + interval '1 day' - interval '1 millisecond'),
            false,
            null,
            now()
          )
          on conflict (connection_id) do update set
            sync_run_id = excluded.sync_run_id,
            sync_version = excluded.sync_version,
            result_mapping_version =
              excluded.result_mapping_version,
            window_start = excluded.window_start,
            window_end = excluded.window_end,
            data_through_at = excluded.data_through_at,
            normalized_results_require_resync = false,
            result_mapping_invalidated_at = null,
            published_at = excluded.published_at
        `,
        [
          input.connectionId,
          input.syncRunId,
          input.syncRunId,
          resultMappingVersion,
          windowStart,
          windowEnd,
        ],
      );
      return stored;
    });
  }

  async getCoverage(
    connectionId: DatabaseId,
  ): Promise<ConnectionCoverage | null> {
    const rows = await this.query<DatabaseRow>(
      `
        select *
        from tracker.connection_coverage
        where connection_id = $1
      `,
      [connectionId],
    );
    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      connectionId: asId(row.connection_id),
      connectionStatus: row.connection_status as ConnectionStatus,
      lastValidatedAt: asNullableIso(row.last_validated_at),
      businessCount: asNumber(row.business_count),
      adAccountCount: asNumber(row.ad_account_count),
      pageCount: asNumber(row.page_count),
      appCount: asNumber(row.app_count),
      creativeContainerCount: asNumber(row.creative_container_count),
      creativeAssetCount: asNumber(row.creative_asset_count),
      campaignCount: asNumber(row.campaign_count),
      adCount: asNumber(row.ad_count),
      lastSyncAt: asNullableIso(row.last_sync_at),
    };
  }

  async getInsightsFreshness(
    connectionId: DatabaseId,
  ): Promise<InsightsFreshnessRecord> {
    const rows = await this.query<DatabaseRow>(
      `
        select
          checkpoint.last_successful_sync_at,
          coalesce(
            snapshot.data_through_at,
            checkpoint.high_water_mark
          ) as high_water_mark,
          snapshot.sync_version,
          run.status as latest_status,
          run.trigger_source
        from (select $1::bigint as connection_id) input
        left join tracker.sync_checkpoints checkpoint
          on checkpoint.connection_id = input.connection_id
         and checkpoint.resource_key = 'meta:insights'
        left join tracker.reporting_snapshots snapshot
          on snapshot.connection_id = input.connection_id
        left join lateral (
          select status, trigger_source
          from tracker.sync_runs
          where connection_id = input.connection_id
            and sync_kind in ('insights', 'incremental', 'full')
            and status in ('succeeded', 'partial', 'failed')
          order by coalesce(finished_at, created_at) desc
          limit 1
        ) run on true
      `,
      [connectionId],
    );
    const row = rows[0] ?? {};
    const latestStatus =
      row.latest_status === null || row.latest_status === undefined
        ? null
        : String(row.latest_status);
    const syncStatus: InsightsFreshnessRecord["syncStatus"] =
      latestStatus === "partial"
        ? "partial"
        : latestStatus === "failed"
          ? "error"
          : row.high_water_mark
            ? "healthy"
            : "warning";
    const trigger = String(row.trigger_source ?? "manual");
    return {
      lastSyncedAt: asNullableIso(row.last_successful_sync_at),
      dataThroughAt: asNullableIso(row.high_water_mark),
      syncVersion:
        row.sync_version === null || row.sync_version === undefined
          ? null
          : String(row.sync_version),
      syncStatus,
      syncMode: trigger === "cron" ? "scheduled" : "manual",
    };
  }

  /**
   * Current delivery is intentionally independent from the historical
   * reporting date range. The query reads the published reporting snapshot,
   * resolves one latest metric date per selected account, then rolls all
   * reconciliation-selected ad/asset rows up to one `(account, ad, day)`
   * record before counting distinct Ads.
   */
  async getLiveDeliverySummary(
    filters: LiveDeliverySummaryFilters,
  ): Promise<LiveDeliverySummary> {
    const selectedAdAccountMetaIds = normalizeSelectedAdAccountMetaIds(
      filters.selectedAdAccountMetaIds,
    );
    const freshnessThresholdDays = Math.min(
      Math.max(Math.floor(filters.freshnessThresholdDays ?? 2), 0),
      30,
    );
    const asOf = filters.asOf ? new Date(filters.asOf) : new Date();
    if (!Number.isFinite(asOf.getTime())) {
      throw new TypeError("Live delivery asOf must be a valid timestamp.");
    }
    if (selectedAdAccountMetaIds.length === 0) {
      const unavailableMetric: LiveDeliverySnapshotMetric = {
        value: null,
        state: "unavailable",
        coverage: { includedAccounts: 0, selectedAccounts: 0 },
      };
      return {
        inventoryObservedAt: null,
        reportingSnapshot: {
          syncVersion: null,
          publishedAt: null,
          state: "unavailable",
        },
        latestRun: { status: null, finishedAt: null },
        state: "unavailable",
        metricDateMin: null,
        metricDateMax: null,
        selectedAccountCount: 0,
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

    const rows = await this.query<DatabaseRow>(
      `
        with selected_accounts as (
          select
            account.ad_account_id,
            account.meta_ad_account_id,
            account.timezone_name,
            account.is_active as account_is_active,
            account.account_status,
            account.last_seen_at as inventory_observed_at,
            coalesce(
              account.is_active and account.account_status = 1,
              false
            ) as is_operational
          from tracker.meta_ad_accounts account
          where account.connection_id = $1
            and account.meta_ad_account_id = any($2::text[])
        ),
        reporting_snapshot as (
          select snapshot.sync_version, snapshot.published_at
          from tracker.reporting_snapshots snapshot
          where snapshot.connection_id = $1
          limit 1
        ),
        latest_run as (
          select run.status, run.finished_at
          from tracker.sync_runs run
          where run.connection_id = $1
            and run.sync_kind in ('insights', 'incremental', 'full')
            and run.status in (
              'queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled'
            )
          order by coalesce(run.finished_at, run.created_at) desc
          limit 1
        ),
        active_inventory as (
          select
            account.ad_account_id,
            ad.campaign_id,
            ad.ad_set_id,
            ad.ad_id
          from selected_accounts account
          join tracker.meta_ads ad
            on ad.ad_account_id = account.ad_account_id
          where account.is_operational
            and ad.is_active
            and coalesce(ad.effective_status, ad.status) = 'ACTIVE'
        ),
        active_inventory_by_account as (
          select
            active.ad_account_id,
            count(distinct active.ad_id) as active_ad_count
          from active_inventory active
          group by active.ad_account_id
        ),
        inventory_observation_by_account as (
          select
            account.ad_account_id,
            max(ad.last_seen_at) as ads_observed_at
          from selected_accounts account
          left join tracker.meta_ads ad
            on ad.ad_account_id = account.ad_account_id
          group by account.ad_account_id
        ),
        metric_ad_day as (
          select
            metric.ad_account_id,
            metric.ad_id,
            metric.metric_date,
            bool_or(metric.spend > 0 or metric.impressions > 0) as has_delivery
          from tracker.daily_metrics metric
          join selected_accounts account
            on account.ad_account_id = metric.ad_account_id
          join reporting_snapshot snapshot
            on snapshot.sync_version = metric.sync_version
          where metric.ad_id is not null
            and metric.metric_scope in ('ad', 'asset')
            and metric.action_report_time = 'mixed'
          group by metric.ad_account_id, metric.ad_id, metric.metric_date
        ),
        latest_metric_by_account as (
          select
            account.ad_account_id,
            max(metric.metric_date) as latest_metric_date
          from selected_accounts account
          left join metric_ad_day metric
            on metric.ad_account_id = account.ad_account_id
          group by account.ad_account_id
        ),
        account_inventory_state as (
          select
            account.ad_account_id,
            account.meta_ad_account_id,
            account.timezone_name,
            account.is_operational,
            coalesce(
              observation.ads_observed_at,
              account.inventory_observed_at
            ) as inventory_observed_at,
            coalesce(inventory.active_ad_count, 0) as active_ad_count,
            latest.latest_metric_date,
            case
              when coalesce(
                observation.ads_observed_at,
                account.inventory_observed_at
              ) is null then 'unavailable'
              when (
                (coalesce(
                  observation.ads_observed_at,
                  account.inventory_observed_at
                ) at time zone
                  coalesce(nullif(account.timezone_name, ''), 'UTC'))::date
                <
                (($4::timestamptz at time zone
                  coalesce(nullif(account.timezone_name, ''), 'UTC'))::date
                  - $3::integer)
              ) then 'stale'
              else 'ready'
            end as inventory_state
          from selected_accounts account
          left join active_inventory_by_account inventory
            on inventory.ad_account_id = account.ad_account_id
          left join inventory_observation_by_account observation
            on observation.ad_account_id = account.ad_account_id
          left join latest_metric_by_account latest
            on latest.ad_account_id = account.ad_account_id
        ),
        account_state as (
          select
            inventory.*,
            case
              when not inventory.is_operational
                or inventory.active_ad_count = 0
                then 'unavailable'
              when inventory.inventory_state = 'unavailable'
                or inventory.latest_metric_date is null
                then 'unavailable'
              when inventory.inventory_state = 'stale'
                or inventory.latest_metric_date < (
                  ($4::timestamptz at time zone
                    coalesce(nullif(inventory.timezone_name, ''), 'UTC'))::date
                    - $3::integer
                )
                then 'stale'
              else 'ready'
            end as delivery_state
          from account_inventory_state inventory
        ),
        inventory_ready_active_ads as (
          select active.*
          from active_inventory active
          join account_state account
            on account.ad_account_id = active.ad_account_id
          where account.inventory_state = 'ready'
        ),
        comparable_active_ads as (
          select active.*
          from inventory_ready_active_ads active
          join account_state account
            on account.ad_account_id = active.ad_account_id
          where account.delivery_state = 'ready'
        ),
        active_delivering_ads as (
          select distinct active.ad_id
          from comparable_active_ads active
          join account_state account
            on account.ad_account_id = active.ad_account_id
          join metric_ad_day metric
            on metric.ad_account_id = active.ad_account_id
            and metric.ad_id = active.ad_id
            and metric.metric_date = account.latest_metric_date
          where metric.has_delivery
        ),
        mapped_active_creatives as (
          select
            count(distinct active.ad_id) as active_ads_with_creative_family,
            count(distinct asset.creative_family_id)
              as mapped_active_creative_families
          from inventory_ready_active_ads active
          join tracker.ad_creative_links ad_link
            on ad_link.ad_id = active.ad_id
          join tracker.creative_asset_links asset_link
            on asset_link.creative_id = ad_link.creative_id
          join tracker.creative_assets asset
            on asset.creative_asset_id = asset_link.creative_asset_id
          where asset.is_active
            and asset.asset_type in ('video', 'image')
            and asset.creative_family_id is not null
        )
        select
          (select max(account.inventory_observed_at) from account_state account)
            as inventory_observed_at,
          (select snapshot.sync_version from reporting_snapshot snapshot)
            as snapshot_sync_version,
          (select snapshot.published_at from reporting_snapshot snapshot)
            as snapshot_published_at,
          (select run.status from latest_run run) as latest_run_status,
          (select run.finished_at from latest_run run) as latest_run_finished_at,
          (select min(account.latest_metric_date) from account_state account
            where account.is_operational
              and account.active_ad_count > 0
              and account.latest_metric_date is not null) as metric_date_min,
          (select max(account.latest_metric_date) from account_state account
            where account.is_operational
              and account.active_ad_count > 0
              and account.latest_metric_date is not null) as metric_date_max,
          (select count(*) from account_state) as selected_account_count,
          (select count(*) from account_state account
            where account.inventory_state = 'ready') as inventory_ready_account_count,
          (select count(*) from account_state account
            where account.is_operational and account.active_ad_count > 0)
            as delivery_eligible_account_count,
          (select count(*) from account_state account
            where account.delivery_state = 'ready') as delivery_ready_account_count,
          (select count(distinct active.campaign_id)
            from inventory_ready_active_ads active) as active_campaign_count,
          (select count(distinct active.ad_set_id)
            from inventory_ready_active_ads active) as active_ad_set_count,
          (select count(distinct active.ad_id)
            from inventory_ready_active_ads active) as active_ad_count,
          (select count(distinct active.ad_id)
            from comparable_active_ads active) as comparable_active_ad_count,
          (select count(*) from active_delivering_ads) as active_delivering_ad_count,
          coalesce(mapping.mapped_active_creative_families, 0)
            as mapped_active_creative_family_count,
          coalesce(mapping.active_ads_with_creative_family, 0)
            as active_ads_with_creative_family,
          coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'metaAdAccountId', account.meta_ad_account_id,
                  'accountTimezone', nullif(account.timezone_name, ''),
                  'isOperational', account.is_operational,
                  'deliveryEligible', (
                    account.is_operational and account.active_ad_count > 0
                  ),
                  'inventoryObservedAt', account.inventory_observed_at,
                  'latestMetricDate', account.latest_metric_date,
                  'inventoryState', account.inventory_state,
                  'deliveryState', account.delivery_state
                )
                order by account.meta_ad_account_id
              )
              from account_state account
            ),
            '[]'::jsonb
          ) as accounts
        from mapped_active_creatives mapping
      `,
      [
        filters.connectionId,
        selectedAdAccountMetaIds,
        freshnessThresholdDays,
        asOf.toISOString(),
      ],
    );

    const row = rows[0] ?? {};
    const selectedAccountCount = asNumber(row.selected_account_count);
    const inventoryReadyAccountCount = asNumber(
      row.inventory_ready_account_count,
    );
    const deliveryEligibleAccountCount = asNumber(
      row.delivery_eligible_account_count,
    );
    const deliveryReadyAccountCount = asNumber(
      row.delivery_ready_account_count,
    );
    const metricDateMin =
      asNullableIso(row.metric_date_min)?.slice(0, 10) ?? null;
    const metricDateMax =
      asNullableIso(row.metric_date_max)?.slice(0, 10) ?? null;
    const deliveryDatesAligned =
      deliveryEligibleAccountCount === 0 ||
      (metricDateMin !== null && metricDateMin === metricDateMax);
    const inventoryState: LiveDeliveryMetricState =
      selectedAccountCount === 0 || inventoryReadyAccountCount === 0
        ? "unavailable"
        : inventoryReadyAccountCount < selectedAccountCount
          ? "partial"
          : "ready";
    const deliveryState: LiveDeliveryMetricState =
      deliveryEligibleAccountCount === 0
        ? inventoryState
        : deliveryReadyAccountCount === 0
          ? "unavailable"
          : deliveryReadyAccountCount < deliveryEligibleAccountCount ||
              inventoryState !== "ready" ||
              !deliveryDatesAligned
            ? "partial"
            : "ready";
    const inventoryMetric = (count: unknown) =>
      liveDeliveryMetric({
        count,
        state: inventoryState,
        includedAccounts: inventoryReadyAccountCount,
        selectedAccounts: selectedAccountCount,
      });
    const deliveryMetric = (count: unknown) =>
      liveDeliveryMetric({
        count,
        state: deliveryState,
        includedAccounts: deliveryReadyAccountCount,
        selectedAccounts: deliveryEligibleAccountCount,
      });
    const activeAds = inventoryMetric(row.active_ad_count);
    const activeAdsWithCreativeFamily = asNumber(
      row.active_ads_with_creative_family,
    );
    const activeAdsTotal = activeAds.value ?? 0;

    return {
      inventoryObservedAt: asNullableIso(row.inventory_observed_at),
      reportingSnapshot: {
        syncVersion:
          row.snapshot_sync_version === null ||
          row.snapshot_sync_version === undefined
            ? null
            : String(row.snapshot_sync_version),
        publishedAt: asNullableIso(row.snapshot_published_at),
        state:
          row.snapshot_sync_version === null ||
          row.snapshot_sync_version === undefined
            ? "unavailable"
            : "available",
      },
      latestRun: {
        status: (() => {
          const status = row.latest_run_status;
          return status === "queued" ||
            status === "running" ||
            status === "succeeded" ||
            status === "partial" ||
            status === "failed" ||
            status === "cancelled"
            ? status
            : null;
        })(),
        finishedAt: asNullableIso(row.latest_run_finished_at),
      },
      state: deliveryState,
      metricDateMin,
      metricDateMax,
      selectedAccountCount,
      inventoryReadyAccountCount,
      deliveryEligibleAccountCount,
      deliveryReadyAccountCount,
      accounts: mapLiveDeliveryAccounts(row.accounts),
      activeCampaigns: inventoryMetric(row.active_campaign_count),
      activeAdSets: inventoryMetric(row.active_ad_set_count),
      activeAds,
      activeAdsComparableForDelivery: deliveryMetric(
        row.comparable_active_ad_count,
      ),
      activeDeliveringAds: deliveryMetric(row.active_delivering_ad_count),
      activeWithoutDelivery: deliveryMetric(
        Math.max(
          0,
          asNumber(row.comparable_active_ad_count) -
            asNumber(row.active_delivering_ad_count),
        ),
      ),
      mappedActiveCreativeFamilies: inventoryMetric(
        row.mapped_active_creative_family_count,
      ),
      mappingCoverage: {
        activeAdsTotal,
        activeAdsWithCreativeFamily:
          inventoryState === "unavailable" ? 0 : activeAdsWithCreativeFamily,
        percent:
          inventoryState === "unavailable" || activeAdsTotal === 0
            ? null
            : (activeAdsWithCreativeFamily / activeAdsTotal) * 100,
      },
    };
  }

  async getCanonicalResultTotals(
    input: CanonicalResultTotalsFilters,
  ): Promise<CanonicalResultTotals> {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.dateFrom) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.dateTo) ||
      input.dateFrom > input.dateTo ||
      !input.attributionWindow.trim() ||
      !input.syncVersion.trim() ||
      !input.resultMappingVersion.trim()
    ) {
      throw new TypeError(
        "Canonical result total filters are invalid.",
      );
    }

    const objectiveOwners = new Map<string, string>();
    for (const mapping of input.objectiveMappings) {
      const objectiveKey = mapping.objectiveKey.trim().toLowerCase();
      if (!objectiveKey) continue;
      for (const rawKey of [
        mapping.objectiveKey,
        ...mapping.rawObjectiveKeys,
      ]) {
        const normalizedRawKey = rawKey.trim().toUpperCase();
        if (!normalizedRawKey) continue;
        const owner = objectiveOwners.get(normalizedRawKey);
        if (owner && owner !== objectiveKey) {
          throw new TypeError(
            "One raw objective cannot map to multiple canonical objectives.",
          );
        }
        objectiveOwners.set(normalizedRawKey, objectiveKey);
      }
    }
    const objectiveMappingPayload = [...objectiveOwners].map(
      ([rawObjectiveKey, objectiveKey]) => ({
        objective_key: objectiveKey,
        raw_objective_key: rawObjectiveKey,
      }),
    );
    const adAccountIds = [
      ...new Set(
        (input.adAccountIds ?? [])
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    const objectiveKeys = [
      ...new Set(
        (input.objectiveKeys ?? [])
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    const campaignMetaIds = [
      ...new Set(
        (input.campaignMetaIds ?? [])
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    const currency = input.currency?.trim().toUpperCase() || null;

    const rows = await this.query<DatabaseRow>(
      `
        with snapshot_status as (
          select
            case
              when snapshot.connection_id is null
                then 'reporting_snapshot_unavailable'
              when snapshot.sync_version <> $10
                or snapshot.result_mapping_version <> $11
                or snapshot.normalized_results_require_resync
                then 'reporting_snapshot_stale'
              else 'available'
            end as snapshot_status,
            snapshot.sync_version,
            snapshot.result_mapping_version,
            snapshot.normalized_results_require_resync
          from (select $1::bigint as connection_id) input
          left join tracker.reporting_snapshots snapshot
            on snapshot.connection_id = input.connection_id
        ),
        snapshot_scope as (
          select *
          from snapshot_status
          where snapshot_status = 'available'
        ),
        objective_mapping as (
          select distinct
            item.objective_key,
            item.raw_objective_key
          from jsonb_to_recordset($9::jsonb) as item(
            objective_key text,
            raw_objective_key text
          )
        ),
        campaign_scope as (
          select
            campaign.campaign_id,
            account.ad_account_id,
            objective.objective_key,
            upper(account.currency) as account_currency,
            snapshot.sync_version as snapshot_sync_version,
            snapshot.result_mapping_version
              as snapshot_result_mapping_version,
            snapshot.normalized_results_require_resync
          from tracker.meta_campaigns campaign
          join tracker.meta_ad_accounts account
            on account.ad_account_id = campaign.ad_account_id
          join objective_mapping objective
            on objective.raw_objective_key =
              upper(coalesce(campaign.objective, ''))
          cross join snapshot_scope snapshot
          where account.connection_id = $1
            and (
              $4::text[] is null
              or account.meta_ad_account_id = any($4::text[])
            )
            and (
              $5::text[] is null
              or objective.objective_key = any($5::text[])
            )
            and (
              $12::text[] is null
              or campaign.meta_campaign_id = any($12::text[])
            )
        ),
        metric_totals as (
          select
            fact.canonical_result_key,
            scope.objective_key,
            upper(fact.currency) as currency,
            'action'::text as metric_source,
            sum(fact.value) as value
          from tracker.action_metric_daily fact
          join campaign_scope scope
            on scope.campaign_id = fact.campaign_id
            and scope.ad_account_id = fact.ad_account_id
          where fact.metric_date between $2::date and $3::date
            and (
              $7 = 'account_default'
              or fact.attribution_window = $7
            )
            and fact.action_report_time = $8
            and fact.sync_version = scope.snapshot_sync_version
            and not scope.normalized_results_require_resync
            and scope.snapshot_result_mapping_version = $11
            and fact.result_mapping_version =
              scope.snapshot_result_mapping_version
            and fact.canonical_result_key not in (
              'reach',
              'impressions',
              'link_click'
            )
            and (
              $6::text is null
              or upper(fact.currency) = $6
            )
          group by
            fact.canonical_result_key,
            scope.objective_key,
            upper(fact.currency)
        ),
        value_totals as (
          select
            fact.canonical_result_key,
            scope.objective_key,
            upper(fact.currency) as currency,
            'action_value'::text as metric_source,
            sum(fact.value) as value
          from tracker.action_value_daily fact
          join campaign_scope scope
            on scope.campaign_id = fact.campaign_id
            and scope.ad_account_id = fact.ad_account_id
          where fact.metric_date between $2::date and $3::date
            and (
              $7 = 'account_default'
              or fact.attribution_window = $7
            )
            and fact.action_report_time = $8
            and fact.sync_version = scope.snapshot_sync_version
            and not scope.normalized_results_require_resync
            and scope.snapshot_result_mapping_version = $11
            and fact.result_mapping_version =
              scope.snapshot_result_mapping_version
            and fact.canonical_result_key not in (
              'reach',
              'impressions',
              'link_click'
            )
            and (
              $6::text is null
              or upper(fact.currency) = $6
            )
          group by
            fact.canonical_result_key,
            scope.objective_key,
            upper(fact.currency)
        ),
        -- Impressions and link clicks are additive native delivery fields.
        -- Reach is intentionally absent because only exact-period Reach is safe.
        objective_delivery as (
          select
            scope.objective_key,
            upper(metric.currency) as currency,
            sum(metric.spend) as objective_spend,
            sum(metric.impressions)::numeric as impressions,
            sum(metric.link_clicks)::numeric as link_clicks
          from tracker.daily_metrics metric
          join campaign_scope scope
            on scope.campaign_id = metric.campaign_id
            and scope.ad_account_id = metric.ad_account_id
          where metric.metric_date between $2::date and $3::date
            and (
              $7 = 'account_default'
              or metric.attribution_window = $7
            )
            and metric.action_report_time = $8
            and metric.sync_version = scope.snapshot_sync_version
            and (
              $6::text is null
              or upper(metric.currency) = $6
          )
          group by scope.objective_key, upper(metric.currency)
        ),
        delivery_totals as (
          select
            'impressions'::text as canonical_result_key,
            delivery.objective_key,
            delivery.currency,
            'delivery'::text as metric_source,
            delivery.impressions as value
          from objective_delivery delivery

          union all

          select
            'link_click'::text as canonical_result_key,
            delivery.objective_key,
            delivery.currency,
            'delivery'::text as metric_source,
            delivery.link_clicks as value
          from objective_delivery delivery
        ),
        canonical_totals as (
          select * from metric_totals
          union all
          select * from value_totals
          union all
          select * from delivery_totals
        ),
        report_rows as (
          select
            'result'::text as row_kind,
            total.canonical_result_key,
            total.objective_key,
            total.metric_source,
            total.currency,
            total.value,
            coalesce(spend.objective_spend, 0) as objective_spend
          from canonical_totals total
          left join objective_delivery spend
            on spend.objective_key = total.objective_key
            and spend.currency = total.currency

          union all

          select
            'objective_spend'::text as row_kind,
            null::text as canonical_result_key,
            spend.objective_key,
            null::text as metric_source,
            spend.currency,
            null::numeric as value,
            spend.objective_spend
          from objective_delivery spend
        )
        select
          snapshot.snapshot_status,
          snapshot.sync_version as snapshot_sync_version,
          snapshot.result_mapping_version
            as snapshot_result_mapping_version,
          report.*
        from snapshot_status snapshot
        left join report_rows report
          on snapshot.snapshot_status = 'available'
        order by
          report.objective_key,
          report.currency,
          report.row_kind,
          report.metric_source,
          report.canonical_result_key
      `,
      [
        input.connectionId,
        input.dateFrom,
        input.dateTo,
        input.adAccountIds === undefined ? null : adAccountIds,
        input.objectiveKeys === undefined ? null : objectiveKeys,
        currency,
        input.attributionWindow.trim(),
        input.actionReportTime,
        jsonPayload(objectiveMappingPayload),
        input.syncVersion.trim(),
        input.resultMappingVersion.trim(),
        input.campaignMetaIds === undefined
          ? null
          : campaignMetaIds,
      ],
    );

    const snapshotStatus = String(
      rows[0]?.snapshot_status ??
        "reporting_snapshot_unavailable",
    );
    if (snapshotStatus !== "available") {
      return {
        available: false,
        reason:
          snapshotStatus === "reporting_snapshot_stale"
            ? "reporting_snapshot_stale"
            : "reporting_snapshot_unavailable",
        results: [],
        spendByObjective: [],
      };
    }

    return {
      available: true,
      syncVersion: String(rows[0]?.snapshot_sync_version),
      resultMappingVersion: String(
        rows[0]?.snapshot_result_mapping_version,
      ),
      results: rows
        .filter((row) => row.row_kind === "result")
        .map((row) => ({
          canonicalResultKey: String(row.canonical_result_key),
          objectiveKey: String(row.objective_key),
          metricSource: row.metric_source as
            | "action"
            | "action_value"
            | "delivery",
          currency: String(row.currency),
          value: asNumber(row.value),
          objectiveSpend: asNumber(row.objective_spend),
        })),
      spendByObjective: rows
        .filter((row) => row.row_kind === "objective_spend")
        .map((row) => ({
          objectiveKey: String(row.objective_key),
          currency: String(row.currency),
          spend: asNumber(row.objective_spend),
      })),
    };
  }

  async getCanonicalResultTrend(
    input: CanonicalResultTotalsFilters,
  ): Promise<CanonicalResultTrend> {
    const normalized = normalizeCanonicalEntityResultFilters(input);

    const rows = await this.query<DatabaseRow>(
      `
        with snapshot_status as (
          select
            case
              when snapshot.connection_id is null
                then 'reporting_snapshot_unavailable'
              when snapshot.sync_version <> $10
                or snapshot.result_mapping_version <> $11
                or snapshot.normalized_results_require_resync
                then 'reporting_snapshot_stale'
              else 'available'
            end as snapshot_status,
            snapshot.sync_version,
            snapshot.result_mapping_version,
            snapshot.normalized_results_require_resync
          from (select $1::bigint as connection_id) input
          left join tracker.reporting_snapshots snapshot
            on snapshot.connection_id = input.connection_id
        ),
        snapshot_scope as (
          select *
          from snapshot_status
          where snapshot_status = 'available'
        ),
        objective_mapping as (
          select distinct
            item.objective_key,
            item.raw_objective_key
          from jsonb_to_recordset($9::jsonb) as item(
            objective_key text,
            raw_objective_key text
          )
        ),
        campaign_scope as (
          select
            campaign.campaign_id,
            account.ad_account_id,
            objective.objective_key,
            snapshot.sync_version as snapshot_sync_version,
            snapshot.result_mapping_version
              as snapshot_result_mapping_version,
            snapshot.normalized_results_require_resync
          from tracker.meta_campaigns campaign
          join tracker.meta_ad_accounts account
            on account.ad_account_id = campaign.ad_account_id
          join objective_mapping objective
            on objective.raw_objective_key =
              upper(coalesce(campaign.objective, ''))
          cross join snapshot_scope snapshot
          where account.connection_id = $1
            and (
              $4::text[] is null
              or account.meta_ad_account_id = any($4::text[])
            )
            and (
              $5::text[] is null
              or objective.objective_key = any($5::text[])
            )
            and (
              $12::text[] is null
              or campaign.meta_campaign_id = any($12::text[])
            )
        ),
        metric_daily as (
          select
            fact.metric_date,
            fact.canonical_result_key,
            scope.objective_key,
            upper(fact.currency) as currency,
            'action'::text as metric_source,
            sum(fact.value) as value
          from tracker.action_metric_daily fact
          join campaign_scope scope
            on scope.campaign_id = fact.campaign_id
            and scope.ad_account_id = fact.ad_account_id
          where fact.metric_date between $2::date and $3::date
            and (
              $7 = 'account_default'
              or fact.attribution_window = $7
            )
            and fact.action_report_time = $8
            and fact.sync_version = scope.snapshot_sync_version
            and not scope.normalized_results_require_resync
            and scope.snapshot_result_mapping_version = $11
            and fact.result_mapping_version =
              scope.snapshot_result_mapping_version
            and fact.canonical_result_key not in (
              'reach',
              'impressions',
              'link_click'
            )
            and (
              $6::text is null
              or upper(fact.currency) = $6
            )
          group by
            fact.metric_date,
            fact.canonical_result_key,
            scope.objective_key,
            upper(fact.currency)
        ),
        value_daily as (
          select
            fact.metric_date,
            fact.canonical_result_key,
            scope.objective_key,
            upper(fact.currency) as currency,
            'action_value'::text as metric_source,
            sum(fact.value) as value
          from tracker.action_value_daily fact
          join campaign_scope scope
            on scope.campaign_id = fact.campaign_id
            and scope.ad_account_id = fact.ad_account_id
          where fact.metric_date between $2::date and $3::date
            and (
              $7 = 'account_default'
              or fact.attribution_window = $7
            )
            and fact.action_report_time = $8
            and fact.sync_version = scope.snapshot_sync_version
            and not scope.normalized_results_require_resync
            and scope.snapshot_result_mapping_version = $11
            and fact.result_mapping_version =
              scope.snapshot_result_mapping_version
            and fact.canonical_result_key not in (
              'reach',
              'impressions',
              'link_click'
            )
            and (
              $6::text is null
              or upper(fact.currency) = $6
            )
          group by
            fact.metric_date,
            fact.canonical_result_key,
            scope.objective_key,
            upper(fact.currency)
        ),
        objective_delivery_daily as (
          select
            metric.metric_date,
            scope.objective_key,
            upper(metric.currency) as currency,
            sum(metric.spend) as daily_spend,
            sum(metric.impressions)::numeric as impressions,
            sum(metric.link_clicks)::numeric as link_clicks
          from tracker.daily_metrics metric
          join campaign_scope scope
            on scope.campaign_id = metric.campaign_id
            and scope.ad_account_id = metric.ad_account_id
          where metric.metric_date between $2::date and $3::date
            and (
              $7 = 'account_default'
              or metric.attribution_window = $7
            )
            and metric.action_report_time = $8
            and metric.sync_version = scope.snapshot_sync_version
            and (
              $6::text is null
              or upper(metric.currency) = $6
            )
          group by
            metric.metric_date,
            scope.objective_key,
            upper(metric.currency)
        ),
        delivery_daily as (
          select
            delivery.metric_date,
            'impressions'::text as canonical_result_key,
            delivery.objective_key,
            delivery.currency,
            'delivery'::text as metric_source,
            delivery.impressions as value
          from objective_delivery_daily delivery

          union all

          select
            delivery.metric_date,
            'link_click'::text as canonical_result_key,
            delivery.objective_key,
            delivery.currency,
            'delivery'::text as metric_source,
            delivery.link_clicks as value
          from objective_delivery_daily delivery
        ),
        canonical_daily as (
          select * from metric_daily
          union all
          select * from value_daily
          union all
          select * from delivery_daily
        ),
        report_rows as (
          select
            total.metric_date,
            total.canonical_result_key,
            total.objective_key,
            total.metric_source,
            total.currency,
            total.value,
            coalesce(delivery.daily_spend, 0) as daily_spend
          from canonical_daily total
          left join objective_delivery_daily delivery
            on delivery.metric_date = total.metric_date
            and delivery.objective_key = total.objective_key
            and delivery.currency = total.currency
        )
        select
          snapshot.snapshot_status,
          snapshot.sync_version as snapshot_sync_version,
          snapshot.result_mapping_version
            as snapshot_result_mapping_version,
          report.*
        from snapshot_status snapshot
        left join report_rows report
          on snapshot.snapshot_status = 'available'
        order by
          report.metric_date,
          report.objective_key,
          report.currency,
          report.metric_source,
          report.canonical_result_key
      `,
      [
        input.connectionId,
        input.dateFrom,
        input.dateTo,
        input.adAccountIds === undefined
          ? null
          : normalized.adAccountIds,
        input.objectiveKeys === undefined
          ? null
          : normalized.objectiveKeys,
        normalized.currency,
        normalized.attributionWindow,
        input.actionReportTime,
        jsonPayload(normalized.objectiveMappingPayload),
        normalized.syncVersion,
        normalized.resultMappingVersion,
        input.campaignMetaIds === undefined
          ? null
          : normalized.campaignMetaIds,
      ],
    );

    const snapshotStatus = String(
      rows[0]?.snapshot_status ??
        "reporting_snapshot_unavailable",
    );
    if (snapshotStatus !== "available") {
      return {
        available: false,
        reason:
          snapshotStatus === "reporting_snapshot_stale"
            ? "reporting_snapshot_stale"
            : "reporting_snapshot_unavailable",
        results: [],
      };
    }

    return {
      available: true,
      syncVersion: String(rows[0]?.snapshot_sync_version),
      resultMappingVersion: String(
        rows[0]?.snapshot_result_mapping_version,
      ),
      results: rows
        .filter(
          (row) =>
            row.canonical_result_key !== null &&
            row.canonical_result_key !== undefined,
        )
        .map((row) => ({
          metricDate: asIso(row.metric_date).slice(0, 10),
          canonicalResultKey: String(row.canonical_result_key),
          objectiveKey: String(row.objective_key),
          metricSource: row.metric_source as
            | "action"
            | "action_value"
            | "delivery",
          currency: String(row.currency),
          value: asNumber(row.value),
          dailySpend: asNumber(row.daily_spend),
        })),
    };
  }

  private async queryCanonicalEntityResultTotals(
    input: CanonicalResultTotalsFilters,
    grain: CanonicalResultEntityGrain,
  ): Promise<DatabaseRow[]> {
    const normalized =
      normalizeCanonicalEntityResultFilters(input);
    const familyResolutionCtes =
      grain === "creative_family"
        ? `
          ad_asset_counts as (
            select
              ad.ad_id,
              count(distinct ad_link.creative_id) as wrapper_count,
              count(distinct creative.creative_id)
                as connection_wrapper_count,
              count(distinct ad_link.creative_id) filter (
                where asset.asset_type in ('video', 'image')
                  and asset.is_active
              ) as resolved_wrapper_count,
              count(distinct asset_link.creative_asset_id)
                as linked_asset_count,
              count(distinct asset.creative_asset_id)
                as total_asset_count,
              count(distinct asset.creative_asset_id) filter (
                where asset.asset_type in ('video', 'image')
                  and asset.is_active
              ) as physical_asset_count,
              count(distinct asset.creative_family_id)
                as family_count,
              min(asset.creative_asset_id) as only_asset_id,
              min(asset.creative_family_id) as only_family_id
            from tracker.meta_ads ad
            join campaign_scope scope
              on scope.campaign_id = ad.campaign_id
              and scope.ad_account_id = ad.ad_account_id
            left join tracker.ad_creative_links ad_link
              on ad_link.ad_id = ad.ad_id
            left join tracker.meta_creatives creative
              on creative.creative_id = ad_link.creative_id
              and creative.connection_id = $1
            left join tracker.creative_asset_links asset_link
              on asset_link.creative_id = creative.creative_id
            left join tracker.creative_assets asset
              on asset.creative_asset_id =
                asset_link.creative_asset_id
              and asset.connection_id = $1
            group by ad.ad_id
          ),
          ad_exact_asset_resolution as (
            select
              ad.ad_id,
              asset.creative_asset_id,
              case
                when count(distinct asset.creative_family_id) = 1
                then min(asset.creative_family_id)
                else null
              end as creative_family_id
            from tracker.meta_ads ad
            join campaign_scope scope
              on scope.campaign_id = ad.campaign_id
              and scope.ad_account_id = ad.ad_account_id
            join tracker.ad_creative_links ad_link
              on ad_link.ad_id = ad.ad_id
            join tracker.meta_creatives creative
              on creative.creative_id = ad_link.creative_id
              and creative.connection_id = $1
            join tracker.creative_asset_links asset_link
              on asset_link.creative_id = creative.creative_id
            join tracker.creative_assets asset
              on asset.creative_asset_id =
                asset_link.creative_asset_id
              and asset.connection_id = $1
              and asset.asset_type in ('video', 'image')
              and asset.is_active
            group by
              ad.ad_id,
              asset.creative_asset_id
          ),
          ad_family_resolution as (
            select
              ad_id,
              case
                when wrapper_count > 0
                  and wrapper_count = connection_wrapper_count
                  and wrapper_count = resolved_wrapper_count
                  and linked_asset_count = total_asset_count
                  and total_asset_count = 1
                  and physical_asset_count = 1
                  and family_count = 1
                then only_asset_id
                else null
              end as creative_asset_id,
              case
                when wrapper_count > 0
                  and wrapper_count = connection_wrapper_count
                  and wrapper_count = resolved_wrapper_count
                  and linked_asset_count = total_asset_count
                  and total_asset_count = 1
                  and physical_asset_count = 1
                  and family_count = 1
                then only_family_id
                else null
              end as creative_family_id,
              case
                when wrapper_count > 0
                  and wrapper_count = connection_wrapper_count
                  and wrapper_count = resolved_wrapper_count
                  and linked_asset_count = total_asset_count
                  and total_asset_count = 1
                  and physical_asset_count = 1
                  and family_count = 1
                then 'single_asset'
                else 'unallocated'
              end as allocation_method
            from ad_asset_counts
          ),
          ad_daily_allocation as (
            select
              metric.ad_id,
              metric.metric_date,
              upper(metric.currency) as currency,
              case
                when (
                  bool_and(
                    metric.metric_scope = 'asset'
                    and metric.allocation_method = 'exact'
                    and metric.creative_asset_id is not null
                  )
                  or bool_and(
                    metric.metric_scope = 'asset'
                    and metric.allocation_method = 'single_asset'
                    and metric.creative_asset_id is not null
                  )
                )
                  and count(distinct metric.creative_asset_id) = 1
                then min(metric.creative_asset_id)
                else null
              end as creative_asset_id,
              case
                when bool_and(
                  metric.metric_scope = 'asset'
                  and metric.allocation_method = 'exact'
                  and metric.creative_asset_id is not null
                )
                  and count(distinct metric.creative_asset_id) = 1
                then 'exact'
                when bool_and(
                  metric.metric_scope = 'asset'
                  and metric.allocation_method = 'single_asset'
                  and metric.creative_asset_id is not null
                )
                  and count(distinct metric.creative_asset_id) = 1
                then 'single_asset'
                else 'unallocated'
              end as allocation_method
            from tracker.daily_metrics metric
            join campaign_scope scope
              on scope.campaign_id = metric.campaign_id
              and scope.ad_account_id = metric.ad_account_id
            where metric.metric_date between $2::date and $3::date
              and (
                $7 = 'account_default'
                or metric.attribution_window = $7
              )
              and metric.action_report_time = $8
              and metric.sync_version = scope.snapshot_sync_version
              and scope.snapshot_sync_version = $10
              and scope.snapshot_result_mapping_version = $11
              and (
                $6::text is null
                or upper(metric.currency) = $6
              )
            group by
              metric.ad_id,
              metric.metric_date,
              upper(metric.currency)
          ),
        `
        : "";
    const entityKey =
      grain === "campaign"
        ? "scope.campaign_meta_id"
        : `
          case
            when daily_allocation.creative_asset_id =
                resolution.creative_asset_id
              and resolution.allocation_method = 'single_asset'
              and daily_allocation.allocation_method in (
                'exact',
                'single_asset'
              )
            then resolution.creative_family_id
            else null
          end`;
    const allocationMethod =
      grain === "campaign"
        ? "'campaign'::text"
        : `
          case
            when daily_allocation.creative_asset_id =
                resolution.creative_asset_id
              and resolution.allocation_method = 'single_asset'
              and daily_allocation.allocation_method in (
                'exact',
                'single_asset'
              )
            then daily_allocation.allocation_method
            else 'unallocated'
          end`;
    const entityJoin =
      grain === "creative_family"
        ? `
          left join ad_daily_allocation daily_allocation
            on daily_allocation.ad_id = fact.ad_id
            and daily_allocation.metric_date = fact.metric_date
            and daily_allocation.currency = upper(fact.currency)
          left join ad_family_resolution resolution
            on resolution.ad_id = fact.ad_id
        `
        : "";
    const entityDeliveryCte =
      grain === "campaign"
        ? `
          entity_delivery as (
            select
              scope.account_meta_id,
              scope.campaign_meta_id as entity_key,
              'campaign'::text as allocation_method,
              scope.objective_key,
              upper(metric.currency) as currency,
              sum(metric.impressions)::numeric as impressions,
              sum(metric.link_clicks)::numeric as link_clicks
            from tracker.daily_metrics metric
            join campaign_scope scope
              on scope.campaign_id = metric.campaign_id
              and scope.ad_account_id = metric.ad_account_id
            where metric.metric_date between $2::date and $3::date
              and (
                $7 = 'account_default'
                or metric.attribution_window = $7
              )
              and metric.action_report_time = $8
              and metric.sync_version = scope.snapshot_sync_version
              and scope.snapshot_sync_version = $10
              and scope.snapshot_result_mapping_version = $11
              and (
                $6::text is null
                or upper(metric.currency) = $6
              )
            group by
              scope.account_meta_id,
              scope.campaign_meta_id,
              scope.objective_key,
              upper(metric.currency)
          ),
        `
        : `
          family_delivery_rows as (
            select
              scope.account_meta_id,
              case
                when metric.metric_scope = 'asset'
                  and metric.allocation_method = 'exact'
                  and metric.creative_asset_id is not null
                  and exact_resolution.creative_family_id is not null
                then exact_resolution.creative_family_id
                when metric.metric_scope = 'asset'
                  and metric.allocation_method = 'single_asset'
                  and metric.creative_asset_id =
                    resolution.creative_asset_id
                  and resolution.allocation_method = 'single_asset'
                then resolution.creative_family_id
                else null
              end as entity_key,
              case
                when metric.metric_scope = 'asset'
                  and metric.allocation_method = 'exact'
                  and metric.creative_asset_id is not null
                  and exact_resolution.creative_family_id is not null
                then 'exact'
                when metric.metric_scope = 'asset'
                  and metric.allocation_method = 'single_asset'
                  and metric.creative_asset_id =
                    resolution.creative_asset_id
                  and resolution.allocation_method = 'single_asset'
                then 'single_asset'
                else 'unallocated'
              end as allocation_method,
              scope.objective_key,
              upper(metric.currency) as currency,
              metric.impressions::numeric as impressions,
              metric.link_clicks::numeric as link_clicks
            from tracker.daily_metrics metric
            join campaign_scope scope
              on scope.campaign_id = metric.campaign_id
              and scope.ad_account_id = metric.ad_account_id
            left join ad_exact_asset_resolution exact_resolution
              on exact_resolution.ad_id = metric.ad_id
              and exact_resolution.creative_asset_id =
                metric.creative_asset_id
            left join ad_family_resolution resolution
              on resolution.ad_id = metric.ad_id
            where metric.metric_date between $2::date and $3::date
              and (
                $7 = 'account_default'
                or metric.attribution_window = $7
              )
              and metric.action_report_time = $8
              and metric.sync_version = scope.snapshot_sync_version
              and scope.snapshot_sync_version = $10
              and scope.snapshot_result_mapping_version = $11
              and (
                $6::text is null
                or upper(metric.currency) = $6
              )
          ),
          entity_delivery as (
            select
              delivery_row.account_meta_id,
              delivery_row.entity_key,
              delivery_row.allocation_method,
              delivery_row.objective_key,
              delivery_row.currency,
              sum(delivery_row.impressions)::numeric as impressions,
              sum(delivery_row.link_clicks)::numeric as link_clicks
            from family_delivery_rows delivery_row
            group by
              delivery_row.account_meta_id,
              delivery_row.entity_key,
              delivery_row.allocation_method,
              delivery_row.objective_key,
              delivery_row.currency
          ),
        `;

    return this.query<DatabaseRow>(
      `
        with snapshot_status as (
          select
            case
              when snapshot.connection_id is null
                then 'reporting_snapshot_unavailable'
              when snapshot.sync_version <> $10
                or snapshot.result_mapping_version <> $11
                or snapshot.normalized_results_require_resync
                then 'reporting_snapshot_stale'
              else 'available'
            end as snapshot_status,
            snapshot.sync_version,
            snapshot.result_mapping_version
          from (select $1::bigint as connection_id) input
          left join tracker.reporting_snapshots snapshot
            on snapshot.connection_id = input.connection_id
        ),
        objective_mapping as (
          select distinct
            item.objective_key,
            item.raw_objective_key
          from jsonb_to_recordset($9::jsonb) as item(
            objective_key text,
            raw_objective_key text
          )
        ),
        campaign_scope as (
          select
            campaign.campaign_id,
            campaign.meta_campaign_id as campaign_meta_id,
            account.ad_account_id,
            account.meta_ad_account_id as account_meta_id,
            objective.objective_key,
            snapshot.sync_version as snapshot_sync_version,
            snapshot.result_mapping_version
              as snapshot_result_mapping_version
          from tracker.meta_campaigns campaign
          join tracker.meta_ad_accounts account
            on account.ad_account_id = campaign.ad_account_id
          join objective_mapping objective
            on objective.raw_objective_key =
              upper(coalesce(campaign.objective, ''))
          cross join snapshot_status snapshot
          where snapshot.snapshot_status = 'available'
            and account.connection_id = $1
            and (
              $4::text[] is null
              or account.meta_ad_account_id = any($4::text[])
            )
            and (
              $5::text[] is null
              or objective.objective_key = any($5::text[])
            )
            and (
              $12::text[] is null
              or campaign.meta_campaign_id = any($12::text[])
            )
        ),
        ${familyResolutionCtes}
        ${entityDeliveryCte}
        normalized_facts as (
          select
            fact.metric_date,
            fact.ad_account_id,
            fact.campaign_id,
            fact.ad_id,
            fact.canonical_result_key,
            fact.attribution_window,
            fact.action_report_time,
            fact.currency,
            fact.value,
            fact.sync_version,
            fact.result_mapping_version,
            'action'::text as metric_source
          from tracker.action_metric_daily fact
          where fact.canonical_result_key not in (
            'reach',
            'impressions',
            'link_click'
          )
          union all
          select
            fact.metric_date,
            fact.ad_account_id,
            fact.campaign_id,
            fact.ad_id,
            fact.canonical_result_key,
            fact.attribution_window,
            fact.action_report_time,
            fact.currency,
            fact.value,
            fact.sync_version,
            fact.result_mapping_version,
            'action_value'::text as metric_source
          from tracker.action_value_daily fact
          where fact.canonical_result_key not in (
            'reach',
            'impressions',
            'link_click'
          )
        ),
        scoped_facts as (
          select
            scope.account_meta_id,
            ${entityKey} as entity_key,
            ${allocationMethod} as allocation_method,
            fact.canonical_result_key,
            scope.objective_key,
            fact.metric_source,
            upper(fact.currency) as currency,
            fact.value
          from normalized_facts fact
          join campaign_scope scope
            on scope.campaign_id = fact.campaign_id
            and scope.ad_account_id = fact.ad_account_id
          ${entityJoin}
          where fact.metric_date between $2::date and $3::date
            and (
              $7 = 'account_default'
              or fact.attribution_window = $7
            )
            and fact.action_report_time = $8
            and fact.sync_version = scope.snapshot_sync_version
            and fact.result_mapping_version =
              scope.snapshot_result_mapping_version
            and scope.snapshot_sync_version = $10
            and scope.snapshot_result_mapping_version = $11
            and (
              $6::text is null
              or upper(fact.currency) = $6
            )
        ),
        delivery_facts as (
          select
            delivery.account_meta_id,
            delivery.entity_key,
            delivery.allocation_method,
            'impressions'::text as canonical_result_key,
            delivery.objective_key,
            'delivery'::text as metric_source,
            delivery.currency,
            delivery.impressions as value
          from entity_delivery delivery

          union all

          select
            delivery.account_meta_id,
            delivery.entity_key,
            delivery.allocation_method,
            'link_click'::text as canonical_result_key,
            delivery.objective_key,
            'delivery'::text as metric_source,
            delivery.currency,
            delivery.link_clicks as value
          from entity_delivery delivery
        ),
        canonical_facts as (
          select * from scoped_facts
          union all
          select * from delivery_facts
        ),
        canonical_totals as (
          select
            account_meta_id,
            entity_key,
            allocation_method,
            canonical_result_key,
            objective_key,
            metric_source,
            currency,
            sum(value) as value
          from canonical_facts
          group by
            account_meta_id,
            entity_key,
            allocation_method,
            canonical_result_key,
            objective_key,
            metric_source,
            currency
        )
        select
          snapshot.snapshot_status,
          snapshot.sync_version as snapshot_sync_version,
          snapshot.result_mapping_version
            as snapshot_result_mapping_version,
          total.account_meta_id,
          total.entity_key,
          total.allocation_method,
          total.canonical_result_key,
          total.objective_key,
          total.metric_source,
          total.currency,
          total.value
        from snapshot_status snapshot
        left join canonical_totals total
          on snapshot.snapshot_status = 'available'
        order by
          total.account_meta_id,
          total.objective_key,
          total.entity_key nulls last,
          total.currency,
          total.metric_source,
          total.canonical_result_key
      `,
      [
        input.connectionId,
        input.dateFrom,
        input.dateTo,
        input.adAccountIds === undefined
          ? null
          : normalized.adAccountIds,
        input.objectiveKeys === undefined
          ? null
          : normalized.objectiveKeys,
        normalized.currency,
        normalized.attributionWindow,
        input.actionReportTime,
        jsonPayload(normalized.objectiveMappingPayload),
        normalized.syncVersion,
        normalized.resultMappingVersion,
        input.campaignMetaIds === undefined
          ? null
          : normalized.campaignMetaIds,
      ],
    );
  }

  async getCanonicalCampaignResultTotals(
    input: CanonicalResultTotalsFilters,
  ): Promise<CanonicalCampaignResultTotals> {
    const rows = await this.queryCanonicalEntityResultTotals(
      input,
      "campaign",
    );
    const snapshotStatus = String(
      rows[0]?.snapshot_status ??
        "reporting_snapshot_unavailable",
    );
    if (snapshotStatus !== "available") {
      return {
        available: false,
        reason:
          snapshotStatus === "reporting_snapshot_stale"
            ? "reporting_snapshot_stale"
            : "reporting_snapshot_unavailable",
        results: [],
      };
    }
    return {
      available: true,
      syncVersion: String(rows[0]?.snapshot_sync_version),
      resultMappingVersion: String(
        rows[0]?.snapshot_result_mapping_version,
      ),
      results: rows
        .filter(
          (row) =>
            row.entity_key !== null &&
            row.entity_key !== undefined &&
            row.canonical_result_key !== null &&
            row.canonical_result_key !== undefined,
        )
        .map((row) => ({
          adAccountMetaId: String(row.account_meta_id),
          campaignMetaId: String(row.entity_key),
          canonicalResultKey: String(
            row.canonical_result_key,
          ),
          objectiveKey: String(row.objective_key),
          metricSource: row.metric_source as
            | "action"
            | "action_value"
            | "delivery",
          currency: String(row.currency),
          value: asNumber(row.value),
        })),
    };
  }

  async getCanonicalCreativeFamilyResultTotals(
    input: CanonicalResultTotalsFilters,
  ): Promise<CanonicalCreativeFamilyResultTotals> {
    const rows = await this.queryCanonicalEntityResultTotals(
      input,
      "creative_family",
    );
    const snapshotStatus = String(
      rows[0]?.snapshot_status ??
        "reporting_snapshot_unavailable",
    );
    if (snapshotStatus !== "available") {
      return {
        available: false,
        reason:
          snapshotStatus === "reporting_snapshot_stale"
            ? "reporting_snapshot_stale"
            : "reporting_snapshot_unavailable",
        results: [],
      };
    }
    return {
      available: true,
      syncVersion: String(rows[0]?.snapshot_sync_version),
      resultMappingVersion: String(
        rows[0]?.snapshot_result_mapping_version,
      ),
      results: rows
        .filter(
          (row) =>
            row.canonical_result_key !== null &&
            row.canonical_result_key !== undefined,
        )
        .map((row) => {
          const allocated =
            (row.allocation_method === "exact" ||
              row.allocation_method === "single_asset") &&
            row.entity_key !== null &&
            row.entity_key !== undefined;
          return {
            adAccountMetaId: String(row.account_meta_id),
            creativeFamilyId: allocated
              ? String(row.entity_key)
              : null,
            allocationMethod: allocated
              ? (row.allocation_method as "exact" | "single_asset")
              : ("unallocated" as const),
            canonicalResultKey: String(
              row.canonical_result_key,
            ),
            objectiveKey: String(row.objective_key),
            metricSource: row.metric_source as
              | "action"
              | "action_value"
              | "delivery",
            currency: String(row.currency),
            value: asNumber(row.value),
          };
        }),
    };
  }

  async getPeriodReach(
    input: PeriodReachFilters,
  ): Promise<PeriodReachResult> {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.dateFrom) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.dateTo) ||
      input.dateFrom > input.dateTo ||
      !input.attributionWindow.trim() ||
      !input.syncVersion.trim() ||
      !input.resultMappingVersion.trim()
    ) {
      throw new TypeError("Period Reach filters are invalid.");
    }
    const adAccountIds = [
      ...new Set(
        input.adAccountIds
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    if (adAccountIds.length === 0) {
      return {
        available: false,
        reason: "exact_account_scope_required",
      };
    }
    if (adAccountIds.length > 1) {
      return {
        available: false,
        reason: "multi_account_overlap_unsafe",
      };
    }
    const campaignIds = [
      ...new Set(
        (input.campaignIds ?? [])
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    if (campaignIds.length > 1) {
      return {
        available: false,
        reason: "multi_campaign_overlap_unsafe",
      };
    }
    const scopeLevel =
      campaignIds.length === 1 ? "campaign" : "account";
    const rows = await this.query<DatabaseRow>(
      `
        select
          snapshot.sync_version as snapshot_sync_version,
          snapshot.result_mapping_version
            as snapshot_result_mapping_version,
          snapshot.normalized_results_require_resync,
          period.period_reach_snapshot_id,
          account.meta_ad_account_id,
          campaign.meta_campaign_id,
          period.reach,
          period.date_from,
          period.date_to,
          period.attribution_window,
          period.action_report_time,
          period.sync_version
        from (select 1 as anchor) input
        left join tracker.reporting_snapshots snapshot
          on snapshot.connection_id = $1
        left join tracker.meta_ad_accounts account
          on account.connection_id = $1
          and account.meta_ad_account_id = $4
        left join tracker.meta_campaigns campaign
          on $5::text is not null
          and campaign.ad_account_id = account.ad_account_id
          and campaign.meta_campaign_id = $5
        left join tracker.period_reach_snapshots period
          on period.connection_id = $1
          and period.ad_account_id = account.ad_account_id
          and period.scope_level = $6
          and (
            ($6 = 'account' and period.campaign_id is null)
            or ($6 = 'campaign' and period.campaign_id = campaign.campaign_id)
          )
          and period.date_from = $2::date
          and period.date_to = $3::date
          and (
            $7 = 'account_default'
            or period.attribution_window = $7
          )
          and period.action_report_time = $8
          and period.sync_version = snapshot.sync_version
      `,
      [
        input.connectionId,
        input.dateFrom,
        input.dateTo,
        adAccountIds[0],
        campaignIds[0] ?? null,
        scopeLevel,
        input.attributionWindow.trim(),
        input.actionReportTime,
      ],
    );
    const requestedAttributionWindow = input.attributionWindow.trim();
    if (
      requestedAttributionWindow ===
        ACCOUNT_DEFAULT_ATTRIBUTION_WINDOW &&
      rows.filter((candidate) => candidate.period_reach_snapshot_id)
        .length > 1
    ) {
      return {
        available: false,
        reason: "exact_snapshot_unavailable",
      };
    }
    const row = rows[0] ?? {};
    if (!row.snapshot_sync_version) {
      return {
        available: false,
        reason: "exact_snapshot_unavailable",
      };
    }
    if (
      String(row.snapshot_sync_version) !==
        input.syncVersion.trim() ||
      Boolean(row.normalized_results_require_resync) ||
      String(row.snapshot_result_mapping_version ?? "") !==
        input.resultMappingVersion.trim()
    ) {
      return {
        available: false,
        reason: "reporting_snapshot_stale",
      };
    }
    if (!row.period_reach_snapshot_id) {
      return {
        available: false,
        reason: "exact_snapshot_unavailable",
      };
    }
    return {
      available: true,
      scopeLevel,
      adAccountId: String(row.meta_ad_account_id),
      campaignId:
        row.meta_campaign_id === null ||
        row.meta_campaign_id === undefined
          ? null
          : String(row.meta_campaign_id),
      reach: asNumber(row.reach),
      dateFrom: String(row.date_from),
      dateTo: String(row.date_to),
      attributionWindow: String(row.attribution_window),
      actionReportTime: row.action_report_time as
        | "impression"
        | "conversion"
        | "mixed",
      syncVersion: String(row.sync_version),
    };
  }

  async listMetaAssets(
    connectionId: DatabaseId,
  ): Promise<MetaAssetInventory> {
    const [businesses, adAccounts, pages, apps] = await Promise.all([
      this.query<DatabaseRow>(
        `
          select *
          from tracker.meta_businesses
          where connection_id = $1
          order by is_active desc, name
        `,
        [connectionId],
      ),
      this.query<DatabaseRow>(
        `
          select *
          from tracker.meta_ad_accounts
          where connection_id = $1
          order by
            coalesce(is_active and account_status = 1, false) desc,
            is_active desc,
            name
        `,
        [connectionId],
      ),
      this.query<DatabaseRow>(
        `
          select *
          from tracker.meta_pages
          where connection_id = $1
          order by is_active desc, name
        `,
        [connectionId],
      ),
      this.query<DatabaseRow>(
        `
          select *
          from tracker.meta_apps
          where connection_id = $1
          order by is_active desc, name
        `,
        [connectionId],
      ),
    ]);

    return {
      businesses: businesses.map((row) => ({
        businessId: asId(row.business_id),
        metaBusinessId: String(row.meta_business_id),
        name: String(row.name),
        verificationStatus:
          row.verification_status === null
            ? null
            : String(row.verification_status),
        isActive: Boolean(row.is_active),
        lastSeenAt: asIso(row.last_seen_at),
      })),
      adAccounts: adAccounts.map((row) => ({
        adAccountId: asId(row.ad_account_id),
        metaAdAccountId: String(row.meta_ad_account_id),
        accountId: String(row.account_id),
        name: String(row.name),
        accountStatus: asNullableNumber(row.account_status),
        currency: String(row.currency),
        timezoneName: String(row.timezone_name),
        businessName:
          row.business_name === null ? null : String(row.business_name),
        isActive: Boolean(row.is_active),
        lastSeenAt: asIso(row.last_seen_at),
      })),
      pages: pages.map((row) => ({
        pageId: asId(row.page_id),
        metaPageId: String(row.meta_page_id),
        name: String(row.name),
        category: row.category === null ? null : String(row.category),
        pictureUrl:
          row.picture_url === null ? null : String(row.picture_url),
        isActive: Boolean(row.is_active),
        lastSeenAt: asIso(row.last_seen_at),
      })),
      apps: apps.map((row) => ({
        appId: asId(row.app_id),
        metaAppId: String(row.meta_app_id),
        name: String(row.name),
        namespace: row.namespace === null ? null : String(row.namespace),
        platform: row.platform as MetaAssetInventory["apps"][number]["platform"],
        storeUrl: row.store_url === null ? null : String(row.store_url),
        isActive: Boolean(row.is_active),
        lastSeenAt: asIso(row.last_seen_at),
      })),
    };
  }

  /**
   * Returns a single server-side page of Ads for the exact reporting account
   * scope. The `delivery` filters are operational: they read the current
   * published reporting snapshot and never substitute historical-period data.
   */
  async listAdInventory(
    filters: AdInventoryFilters,
  ): Promise<AdInventoryPage> {
    const selectedAdAccountMetaIds = normalizeSelectedAdAccountMetaIds(
      filters.selectedAdAccountMetaIds,
    );
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);
    const status = filters.status ?? "all";
    const delivery = filters.delivery ?? "all";
    const search = filters.search?.trim().slice(0, 200) || null;
    const includeInactiveAccounts = filters.includeInactiveAccounts === true;
    const freshnessThresholdDays = Math.min(
      Math.max(Math.floor(filters.freshnessThresholdDays ?? 2), 0),
      30,
    );
    const asOf = filters.asOf ? new Date(filters.asOf) : new Date();
    if (!Number.isFinite(asOf.getTime())) {
      throw new TypeError("Ad inventory asOf must be a valid timestamp.");
    }
    if (selectedAdAccountMetaIds.length === 0) {
      return { items: [], total: 0, limit, offset };
    }

    const rows = await this.query<DatabaseRow>(
      `
        with selected_accounts as (
          select
            account.ad_account_id,
            account.meta_ad_account_id,
            account.name as ad_account_name,
            account.timezone_name,
            account.last_seen_at as inventory_observed_at,
            coalesce(
              account.is_active and account.account_status = 1,
              false
            ) as is_operational
          from tracker.meta_ad_accounts account
          where account.connection_id = $1
            and account.meta_ad_account_id = any($2::text[])
            and (
              $10::boolean
              or (account.is_active and account.account_status = 1)
            )
        ),
        reporting_snapshot as (
          select snapshot.sync_version
          from tracker.reporting_snapshots snapshot
          where snapshot.connection_id = $1
          limit 1
        ),
        active_inventory_by_account as (
          select
            account.ad_account_id,
            count(distinct ad.ad_id) as active_ad_count
          from selected_accounts account
          join tracker.meta_ads ad
            on ad.ad_account_id = account.ad_account_id
          where account.is_operational
            and ad.is_active
            and coalesce(ad.effective_status, ad.status) = 'ACTIVE'
          group by account.ad_account_id
        ),
        inventory_observation_by_account as (
          select
            account.ad_account_id,
            max(ad.last_seen_at) as ads_observed_at
          from selected_accounts account
          left join tracker.meta_ads ad
            on ad.ad_account_id = account.ad_account_id
          group by account.ad_account_id
        ),
        metric_ad_day as (
          select
            metric.ad_account_id,
            metric.ad_id,
            metric.metric_date,
            bool_or(metric.spend > 0 or metric.impressions > 0) as has_delivery
          from tracker.daily_metrics metric
          join selected_accounts account
            on account.ad_account_id = metric.ad_account_id
          join reporting_snapshot snapshot
            on snapshot.sync_version = metric.sync_version
          where metric.ad_id is not null
            and metric.metric_scope in ('ad', 'asset')
            and metric.action_report_time = 'mixed'
          group by metric.ad_account_id, metric.ad_id, metric.metric_date
        ),
        latest_metric_by_account as (
          select
            account.ad_account_id,
            max(metric.metric_date) as latest_metric_date
          from selected_accounts account
          left join metric_ad_day metric
            on metric.ad_account_id = account.ad_account_id
          group by account.ad_account_id
        ),
        account_delivery_state as (
          select
            account.ad_account_id,
            account.meta_ad_account_id,
            account.ad_account_name,
            account.timezone_name,
            account.is_operational,
            coalesce(
              observation.ads_observed_at,
              account.inventory_observed_at
            ) as inventory_observed_at,
            coalesce(inventory.active_ad_count, 0) as active_ad_count,
            latest.latest_metric_date,
            case
              when not account.is_operational
                or coalesce(inventory.active_ad_count, 0) = 0
                then 'unavailable'
              when coalesce(
                observation.ads_observed_at,
                account.inventory_observed_at
              ) is null
                or latest.latest_metric_date is null
                then 'unavailable'
              when (
                (coalesce(
                  observation.ads_observed_at,
                  account.inventory_observed_at
                ) at time zone
                  coalesce(nullif(account.timezone_name, ''), 'UTC'))::date
                <
                (($9::timestamptz at time zone
                  coalesce(nullif(account.timezone_name, ''), 'UTC'))::date
                  - $8::integer)
              )
                or latest.latest_metric_date < (
                  ($9::timestamptz at time zone
                    coalesce(nullif(account.timezone_name, ''), 'UTC'))::date
                    - $8::integer
                )
                then 'stale'
              else 'ready'
            end as account_delivery_state
          from selected_accounts account
          left join active_inventory_by_account inventory
            on inventory.ad_account_id = account.ad_account_id
          left join inventory_observation_by_account observation
            on observation.ad_account_id = account.ad_account_id
          left join latest_metric_by_account latest
            on latest.ad_account_id = account.ad_account_id
        ),
        creative_links as (
          select
            ad_link.ad_id,
            coalesce(
              array_agg(distinct asset.creative_family_id)
                filter (
                  where asset.creative_family_id is not null
                    and asset.is_active
                    and asset.asset_type in ('video', 'image')
                ),
              '{}'::text[]
            ) as creative_family_ids
          from tracker.ad_creative_links ad_link
          join tracker.meta_ads ad
            on ad.ad_id = ad_link.ad_id
          join selected_accounts account
            on account.ad_account_id = ad.ad_account_id
          left join tracker.creative_asset_links asset_link
            on asset_link.creative_id = ad_link.creative_id
          left join tracker.creative_assets asset
            on asset.creative_asset_id = asset_link.creative_asset_id
            and asset.connection_id = $1
          group by ad_link.ad_id
        ),
        filtered as (
          select
            ad.ad_id,
            ad.meta_ad_id,
            ad.name,
            ad.status,
            ad.effective_status,
            ad.is_active,
            ad.last_seen_at,
            campaign.meta_campaign_id,
            campaign.name as campaign_name,
            ad_set.meta_ad_set_id,
            ad_set.name as ad_set_name,
            account.meta_ad_account_id,
            account.ad_account_name,
            account.is_operational,
            account.inventory_observed_at,
            account.latest_metric_date,
            coalesce(creative.creative_family_ids, '{}'::text[])
              as creative_family_ids,
            case
              when not account.is_operational then 'unavailable'
              when not (
                ad.is_active
                and coalesce(ad.effective_status, ad.status) = 'ACTIVE'
              ) then 'not_active'
              when account.account_delivery_state <> 'ready'
                then 'unavailable'
              when coalesce(metric.has_delivery, false)
                then 'delivering'
              else 'missing'
            end as delivery_state
          from account_delivery_state account
          join tracker.meta_ads ad
            on ad.ad_account_id = account.ad_account_id
          join tracker.meta_campaigns campaign
            on campaign.campaign_id = ad.campaign_id
          join tracker.meta_ad_sets ad_set
            on ad_set.ad_set_id = ad.ad_set_id
          left join metric_ad_day metric
            on metric.ad_account_id = ad.ad_account_id
            and metric.ad_id = ad.ad_id
            and metric.metric_date = account.latest_metric_date
          left join creative_links creative
            on creative.ad_id = ad.ad_id
          where (
            $3::text = 'all'
            or (
              $3::text = 'active'
              and account.is_operational
              and ad.is_active
              and coalesce(ad.effective_status, ad.status) = 'ACTIVE'
            )
            or (
              $3::text = 'paused'
              and ad.is_active
              and coalesce(ad.effective_status, ad.status) like '%PAUSED'
            )
          )
            and (
              $4::text = 'all'
              or (
                $4::text = 'latest'
                and ad.is_active
                and coalesce(ad.effective_status, ad.status) = 'ACTIVE'
                and account.account_delivery_state = 'ready'
                and coalesce(metric.has_delivery, false)
              )
              or (
                $4::text = 'missing'
                and ad.is_active
                and coalesce(ad.effective_status, ad.status) = 'ACTIVE'
                and account.account_delivery_state = 'ready'
                and not coalesce(metric.has_delivery, false)
              )
            )
            and (
              $5::text is null
              or ad.name ilike '%' || $5 || '%'
              or ad.meta_ad_id ilike '%' || $5 || '%'
              or campaign.name ilike '%' || $5 || '%'
              or campaign.meta_campaign_id ilike '%' || $5 || '%'
              or ad_set.name ilike '%' || $5 || '%'
              or account.ad_account_name ilike '%' || $5 || '%'
            )
        ),
        page_rows as (
          select filtered.*
          from filtered
          order by
            (
              filtered.is_operational
              and filtered.is_active
              and coalesce(filtered.effective_status, filtered.status) = 'ACTIVE'
            ) desc,
            (filtered.delivery_state = 'delivering') desc,
            filtered.last_seen_at desc,
            filtered.name,
            filtered.meta_ad_id
          limit $6
          offset $7
        )
        select page_rows.*, total.total_count
        from (select count(*) as total_count from filtered) total
        left join page_rows on true
        order by
          (
            page_rows.is_operational
            and page_rows.is_active
            and coalesce(page_rows.effective_status, page_rows.status) = 'ACTIVE'
          ) desc nulls last,
          (page_rows.delivery_state = 'delivering') desc nulls last,
          page_rows.last_seen_at desc nulls last,
          page_rows.name nulls last,
          page_rows.meta_ad_id nulls last
      `,
      [
        filters.connectionId,
        selectedAdAccountMetaIds,
        status,
        delivery,
        search,
        limit,
        offset,
        freshnessThresholdDays,
        asOf.toISOString(),
        includeInactiveAccounts,
      ],
    );

    const pageRows = rows.filter(
      (row) => row.ad_id !== null && row.ad_id !== undefined,
    );
    return {
      items: pageRows.map((row) => ({
        adId: asId(row.ad_id),
        metaAdId: String(row.meta_ad_id),
        name: String(row.name),
        status: row.status === null ? null : String(row.status),
        effectiveStatus:
          row.effective_status === null
            ? null
            : String(row.effective_status),
        isActive: Boolean(row.is_active),
        isOperational: Boolean(row.is_operational),
        metaCampaignId: String(row.meta_campaign_id),
        campaignName: String(row.campaign_name),
        metaAdSetId: String(row.meta_ad_set_id),
        adSetName: String(row.ad_set_name),
        metaAdAccountId: String(row.meta_ad_account_id),
        adAccountName: String(row.ad_account_name),
        creativeFamilyIds: asStringArray(row.creative_family_ids),
        latestMetricDate:
          asNullableIso(row.latest_metric_date)?.slice(0, 10) ?? null,
        deliveryState:
          row.delivery_state === "delivering" ||
          row.delivery_state === "missing" ||
          row.delivery_state === "not_active"
            ? row.delivery_state
            : "unavailable",
        inventoryObservedAt: asNullableIso(row.inventory_observed_at),
        lastSeenAt: asIso(row.last_seen_at),
      })),
      total: rows[0] ? asNumber(rows[0].total_count) : 0,
      limit,
      offset,
    };
  }

  async listCampaignInventory(
    filters: CampaignInventoryFilters,
  ): Promise<CampaignInventoryPage> {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);
    const search = filters.search?.trim() || null;
    const status = filters.status?.trim() || null;
    const accountMetaId = filters.accountMetaId?.trim() || null;
    const includeInactiveAccounts =
      filters.includeInactiveAccounts === true;
    const rows = await this.query<DatabaseRow>(
      `
        with campaign_counts as (
          select
            campaign.campaign_id,
            count(distinct ad_set.ad_set_id) as ad_set_count,
            count(distinct ad.ad_id) as ad_count,
            count(distinct asset_link.creative_asset_id)
              as creative_asset_count
          from tracker.meta_campaigns campaign
          left join tracker.meta_ad_sets ad_set
            on ad_set.campaign_id = campaign.campaign_id
          left join tracker.meta_ads ad
            on ad.campaign_id = campaign.campaign_id
          left join tracker.ad_creative_links ad_link
            on ad_link.ad_id = ad.ad_id
          left join tracker.creative_asset_links asset_link
            on asset_link.creative_id = ad_link.creative_id
          group by campaign.campaign_id
        ),
        campaign_performance_rows as (
          select
            metric.campaign_id,
            metric.currency,
            sum(metric.spend) as spend,
            sum(metric.impressions) as impressions,
            sum(metric.installs) as installs,
            sum(metric.registrations) as registrations
          from tracker.daily_metrics metric
          join tracker.meta_ad_accounts performance_account
            on performance_account.ad_account_id = metric.ad_account_id
          where performance_account.connection_id = $1
            and ($6::date is null or metric.metric_date >= $6::date)
            and ($7::date is null or metric.metric_date <= $7::date)
            and ($8::text is null or metric.currency = $8)
            and (
              $11::text is null
              or $11 = 'account_default'
              or metric.attribution_window = $11
            )
            and (
              $12::text is null
              or metric.action_report_time = $12
            )
            and (
              $13::text is null
              or metric.sync_version = $13
            )
          group by metric.campaign_id, metric.currency
        ),
        campaign_performance as (
          select
            campaign_id,
            jsonb_agg(
              jsonb_build_object(
                'currency', currency,
                'spend', spend,
                'impressions', impressions,
                'installs', installs,
                'registrations', registrations
              )
              order by currency
            ) as performance
          from campaign_performance_rows
          group by campaign_id
        ),
        filtered as (
          select
            campaign.*,
            account.meta_ad_account_id,
            account.name as ad_account_name,
            coalesce(counts.ad_set_count, 0) as ad_set_count,
            coalesce(counts.ad_count, 0) as ad_count,
            coalesce(counts.creative_asset_count, 0)
              as creative_asset_count,
            coalesce(performance.performance, '[]'::jsonb)
              as performance
          from tracker.meta_campaigns campaign
          join tracker.meta_ad_accounts account
            on account.ad_account_id = campaign.ad_account_id
          left join campaign_counts counts
            on counts.campaign_id = campaign.campaign_id
          left join campaign_performance performance
            on performance.campaign_id = campaign.campaign_id
          where account.connection_id = $1
            and (
              $2::boolean
              or (account.is_active and account.account_status = 1)
            )
            and (
              $3::text is null
              or account.meta_ad_account_id = $3
            )
            and (
              $4::text is null
              or coalesce(campaign.effective_status, campaign.status) = $4
            )
            and (
              $5::text is null
              or campaign.name ilike '%' || $5 || '%'
              or campaign.meta_campaign_id ilike '%' || $5 || '%'
              or account.name ilike '%' || $5 || '%'
            )
            and (
              $14::text[] is null
              or upper(coalesce(campaign.objective, ''))
                = any($14::text[])
            )
        )
        select filtered.*, count(*) over () as total_count
        from filtered
        order by
          coalesce(
            filtered.is_active
            and coalesce(filtered.effective_status, filtered.status) = 'ACTIVE',
            false
          ) desc,
          filtered.is_active desc,
          filtered.last_seen_at desc,
          filtered.name
        limit $9
        offset $10
      `,
      [
        filters.connectionId,
        includeInactiveAccounts,
        accountMetaId,
        status,
        search,
        filters.dateFrom ?? null,
        filters.dateTo ?? null,
        filters.currency?.trim() || null,
        limit,
        offset,
        filters.attributionWindow?.trim() || null,
        filters.actionReportTime ?? null,
        filters.syncVersion?.trim() || null,
        filters.objectiveRawKeys?.length
          ? filters.objectiveRawKeys.map((key) =>
              key.trim().toUpperCase(),
            )
          : null,
      ],
    );

    const items: CampaignInventoryItem[] = rows.map((row) => {
      const rawPerformance = Array.isArray(row.performance)
        ? row.performance
        : [];
      const performance = rawPerformance.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return [];
        }
        const source = item as DatabaseRow;
        const spend = asNumber(source.spend);
        const installs = asNumber(source.installs);
        const registrations = asNumber(source.registrations);
        return [
          {
            currency: String(source.currency),
            spend,
            impressions: asNumber(source.impressions),
            installs,
            registrations,
            cpi: installs > 0 ? spend / installs : null,
            costPerRegistration:
              registrations > 0 ? spend / registrations : null,
          },
        ];
      });
      return {
      campaignId: asId(row.campaign_id),
      metaCampaignId: String(row.meta_campaign_id),
      name: String(row.name),
      objective: row.objective === null ? null : String(row.objective),
      status: row.status === null ? null : String(row.status),
      effectiveStatus:
        row.effective_status === null
          ? null
          : String(row.effective_status),
      isActive: Boolean(row.is_active),
      metaAdAccountId: String(row.meta_ad_account_id),
      adAccountName: String(row.ad_account_name),
      adSetCount: asNumber(row.ad_set_count),
      adCount: asNumber(row.ad_count),
      creativeAssetCount: asNumber(row.creative_asset_count),
      performance,
      lastSeenAt: asIso(row.last_seen_at),
      };
    });

    return {
      items,
      total: rows[0] ? asNumber(rows[0].total_count) : 0,
      limit,
      offset,
    };
  }

  async getCampaignHierarchy(
    connectionId: DatabaseId,
    metaCampaignId: string,
  ): Promise<CampaignHierarchy | null> {
    const rows = await this.query<DatabaseRow>(
      `
        select
          campaign.campaign_id,
          campaign.meta_campaign_id,
          ad_set.ad_set_id,
          ad_set.meta_ad_set_id,
          ad_set.name as ad_set_name,
          ad_set.status as ad_set_status,
          ad_set.effective_status as ad_set_effective_status,
          ad.ad_id,
          ad.meta_ad_id,
          ad.name as ad_name,
          ad.status as ad_status,
          ad.effective_status as ad_effective_status,
          coalesce(
            array_agg(distinct asset.creative_family_id)
              filter (where asset.creative_family_id is not null),
            '{}'::text[]
          ) as creative_family_ids
        from tracker.meta_campaigns campaign
        join tracker.meta_ad_accounts account
          on account.ad_account_id = campaign.ad_account_id
        left join tracker.meta_ad_sets ad_set
          on ad_set.campaign_id = campaign.campaign_id
        left join tracker.meta_ads ad
          on ad.ad_set_id = ad_set.ad_set_id
        left join tracker.ad_creative_links ad_link
          on ad_link.ad_id = ad.ad_id
        left join tracker.creative_asset_links asset_link
          on asset_link.creative_id = ad_link.creative_id
        left join tracker.creative_assets asset
          on asset.creative_asset_id = asset_link.creative_asset_id
        where account.connection_id = $1
          and campaign.meta_campaign_id = $2
        group by
          campaign.campaign_id,
          campaign.meta_campaign_id,
          ad_set.ad_set_id,
          ad_set.meta_ad_set_id,
          ad_set.name,
          ad_set.status,
          ad_set.effective_status,
          ad.ad_id,
          ad.meta_ad_id,
          ad.name,
          ad.status,
          ad.effective_status
        order by ad_set.name nulls last, ad.name nulls last
      `,
      [connectionId, metaCampaignId.trim()],
    );
    if (!rows.length) return null;

    const adSets = new Map<
      string,
      CampaignHierarchy["adSets"][number]
    >();
    for (const row of rows) {
      if (row.ad_set_id === null) continue;
      const adSetId = asId(row.ad_set_id);
      const adSet =
        adSets.get(adSetId) ??
        {
          adSetId,
          metaAdSetId: String(row.meta_ad_set_id),
          name: String(row.ad_set_name),
          status:
            row.ad_set_status === null
              ? null
              : String(row.ad_set_status),
          effectiveStatus:
            row.ad_set_effective_status === null
              ? null
              : String(row.ad_set_effective_status),
          ads: [],
        };
      if (row.ad_id !== null) {
        adSet.ads.push({
          adId: asId(row.ad_id),
          metaAdId: String(row.meta_ad_id),
          name: String(row.ad_name),
          status: row.ad_status === null ? null : String(row.ad_status),
          effectiveStatus:
            row.ad_effective_status === null
              ? null
              : String(row.ad_effective_status),
          creativeFamilyIds: asStringArray(row.creative_family_ids),
        });
      }
      adSets.set(adSetId, adSet);
    }

    return {
      campaignId: asId(rows[0].campaign_id),
      metaCampaignId: String(rows[0].meta_campaign_id),
      adSets: [...adSets.values()],
    };
  }

  async listCreativeLibrary(
    filters: CreativeLibraryFilters,
  ): Promise<CreativeLibraryItem[]> {
    const limit = Math.min(
      Math.max(filters.limit ?? 50, 1),
      MAX_CREATIVE_LIBRARY_ROWS,
    );
    const offset = Math.max(filters.offset ?? 0, 0);
    const adAccountMetaIds = [
      ...new Set(
        (filters.adAccountMetaIds ?? [])
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    const campaignMetaIds = [
      ...new Set(
        (filters.campaignMetaIds ?? [])
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    const rows = await this.query<DatabaseRow>(
      `
        with current_ad_usage as (
          select
            asset_link.creative_asset_id,
            count(distinct ad.ad_id) filter (
              where ad.is_active
                and account.is_active
                and account.account_status = 1
            ) as current_ad_count,
            count(distinct ad.ad_id) filter (
              where ad.is_active
                and account.is_active
                and account.account_status = 1
                and coalesce(ad.effective_status, ad.status) = 'ACTIVE'
            ) as active_ad_count
          from tracker.creative_asset_links asset_link
          join tracker.ad_creative_links ad_link
            on ad_link.creative_id = asset_link.creative_id
          join tracker.meta_ads ad
            on ad.ad_id = ad_link.ad_id
          join tracker.meta_ad_accounts account
            on account.ad_account_id = ad.ad_account_id
          where account.connection_id = $1
          group by asset_link.creative_asset_id
        )
        select
          usage.*,
          asset.creative_family_id,
          entity_links.meta_creative_ids,
          entity_links.ad_ids,
          entity_links.campaign_ids,
          entity_links.ad_account_ids,
          entity_links.page_ids,
          coalesce(ad_usage.current_ad_count, 0) as current_ad_count,
          coalesce(ad_usage.active_ad_count, 0) as active_ad_count
        from tracker.creative_asset_usage usage
        join tracker.creative_assets asset
          on asset.creative_asset_id = usage.creative_asset_id
        left join tracker.creative_family_entity_links entity_links
          on entity_links.creative_asset_id = usage.creative_asset_id
        left join current_ad_usage ad_usage
          on ad_usage.creative_asset_id = usage.creative_asset_id
        where usage.connection_id = $1
          and ($2::text is null or usage.asset_type = $2)
          and (
            $6::text is null
            or asset.creative_family_id = $6
          )
          and (
            $7::text[] is null
            or entity_links.ad_account_ids && $7::text[]
          )
          and (
            $8::text[] is null
            or entity_links.campaign_ids && $8::text[]
          )
          and (
            $3::text is null
            or usage.name ilike '%' || $3 || '%'
            or usage.asset_key ilike '%' || $3 || '%'
            or usage.meta_video_id ilike '%' || $3 || '%'
            or usage.meta_image_hash ilike '%' || $3 || '%'
            or array_to_string(usage.creative_codes, ' ') ilike '%' || $3 || '%'
          )
        order by
          (coalesce(ad_usage.active_ad_count, 0) > 0) desc,
          coalesce(ad_usage.active_ad_count, 0) desc,
          coalesce(ad_usage.current_ad_count, 0) desc,
          usage.last_used_at desc nulls last,
          usage.last_seen_at desc
        limit $4
        offset $5
      `,
      [
        filters.connectionId,
        filters.assetType ?? null,
        filters.search?.trim() || null,
        limit,
        offset,
        filters.creativeFamilyId?.trim() || null,
        filters.adAccountMetaIds === undefined
          ? null
          : adAccountMetaIds,
        filters.campaignMetaIds === undefined
          ? null
          : campaignMetaIds,
      ],
    );

    return rows.map((row) => ({
      creativeAssetId: asId(row.creative_asset_id),
      creativeFamilyId:
        row.creative_family_id === null
          ? undefined
          : asId(row.creative_family_id),
      assetKey: String(row.asset_key),
      assetType: row.asset_type as CreativeLibraryItem["assetType"],
      metaVideoId:
        row.meta_video_id === null ? null : String(row.meta_video_id),
      metaImageHash:
        row.meta_image_hash === null ? null : String(row.meta_image_hash),
      name: row.name === null ? null : String(row.name),
      thumbnailUrl:
        row.thumbnail_url === null ? null : String(row.thumbnail_url),
      previewUrl: row.preview_url === null ? null : String(row.preview_url),
      width: asNullableNumber(row.width),
      height: asNullableNumber(row.height),
      durationSeconds: asNullableNumber(row.duration_seconds),
      creativeCodes: asStringArray(row.creative_codes),
      pageNames: asStringArray(row.page_names),
      creativeContainerCount: asNumber(row.creative_container_count),
      adCount: asNumber(row.ad_count),
      currentAdCount: asNumber(row.current_ad_count),
      activeAdCount: asNumber(row.active_ad_count),
      adAccountCount: asNumber(row.ad_account_count),
      pageCount: asNumber(row.page_count),
      metaCreativeIds: asStringArray(row.meta_creative_ids),
      adIds: asStringArray(row.ad_ids),
      campaignIds: asStringArray(row.campaign_ids),
      adAccountIds: asStringArray(row.ad_account_ids),
      pageIds: asStringArray(row.page_ids),
      lastUsedAt: asNullableIso(row.last_used_at),
      lastSeenAt: asIso(row.last_seen_at),
    }));
  }

  async getCreativeFamilyById(
    connectionId: DatabaseId,
    creativeFamilyId: DatabaseId,
  ): Promise<CreativeLibraryItem | null> {
    const [item] = await this.listCreativeLibrary({
      connectionId,
      creativeFamilyId,
      limit: 1,
      offset: 0,
    });
    return item ?? null;
  }

  async listCreativePerformance(
    filters: CreativePerformanceFilters,
  ): Promise<CreativePerformanceItem[]> {
    const limit = Math.min(
      Math.max(filters.limit ?? 50, 1),
      MAX_CREATIVE_PERFORMANCE_ROWS,
    );
    const offset = Math.max(filters.offset ?? 0, 0);
    const rows = await this.query<DatabaseRow>(
      `
        with ad_asset_counts as (
          select
            ad_link.ad_id,
            min(asset_link.creative_asset_id) as only_asset_id,
            count(distinct asset_link.creative_asset_id) as asset_count
          from tracker.ad_creative_links ad_link
          join tracker.creative_asset_links asset_link
            on asset_link.creative_id = ad_link.creative_id
          group by ad_link.ad_id
        ),
        attributable_metrics as (
          select
            metric.*,
            metric.creative_asset_id as attributed_asset_id,
            case
              when lower(metric.impression_device) like 'android%' then 'ANDROID'
              when lower(metric.impression_device) in (
                'ios',
                'iphone',
                'ipad',
                'ipod'
              ) then 'IOS'
              else 'UNKNOWN'
            end as operating_system
          from tracker.daily_metrics metric
          where metric.metric_scope = 'asset'
            and metric.creative_asset_id is not null

          union all

          select
            metric.*,
            counts.only_asset_id as attributed_asset_id,
            case
              when lower(metric.impression_device) like 'android%' then 'ANDROID'
              when lower(metric.impression_device) in (
                'ios',
                'iphone',
                'ipad',
                'ipod'
              ) then 'IOS'
              else 'UNKNOWN'
            end as operating_system
          from tracker.daily_metrics metric
          join ad_asset_counts counts
            on counts.ad_id = metric.ad_id
           and counts.asset_count = 1
          where metric.metric_scope = 'ad'
            and not exists (
              select 1
              from tracker.daily_metrics exact_metric
              where exact_metric.ad_id = metric.ad_id
                and exact_metric.metric_date = metric.metric_date
                and exact_metric.metric_scope = 'asset'
                and exact_metric.country = metric.country
                and exact_metric.publisher_platform = metric.publisher_platform
                and exact_metric.platform_position = metric.platform_position
                and exact_metric.impression_device = metric.impression_device
                and exact_metric.attribution_window = metric.attribution_window
            )
        ),
        aggregate as (
          select
            metric.attributed_asset_id,
            metric.operating_system,
            metric.currency,
            sum(metric.spend) as spend,
            sum(metric.impressions) as impressions,
            sum(metric.reported_reach) as daily_reach_sum,
            sum(metric.link_clicks) as link_clicks,
            sum(metric.installs) as installs,
            sum(metric.registrations) as registrations,
            sum(metric.video_3s_views) as video_3s_views,
            sum(metric.video_100_views) as video_100_views,
            count(distinct metric.metric_date) as metric_days
          from attributable_metrics metric
          join tracker.meta_ad_accounts account
            on account.ad_account_id = metric.ad_account_id
          where metric.metric_date between $2::date and $3::date
            and account.connection_id = $1
            and account.is_active
            and account.account_status = 1
            and ($4::bigint is null or metric.ad_account_id = $4)
            and ($5::text is null or metric.currency = $5)
            and (
              $9::text is null
              or account.meta_ad_account_id = $9
            )
            and (
              $10::text is null
              or exists (
                select 1
                from tracker.meta_campaigns selected_campaign
                where selected_campaign.campaign_id = metric.campaign_id
                  and selected_campaign.meta_campaign_id = $10
              )
            )
            and (
              $12::text is null
              or $12 = 'account_default'
              or metric.attribution_window = $12
            )
            and (
              $13::text is null
              or metric.action_report_time = $13
            )
            and (
              $14::text is null
              or metric.sync_version = $14
            )
            and (
              $15::text[] is null
              or exists (
                select 1
                from tracker.meta_campaigns objective_campaign
                where objective_campaign.campaign_id = metric.campaign_id
                  and upper(coalesce(objective_campaign.objective, ''))
                    = any($15::text[])
              )
            )
          group by
            metric.attributed_asset_id,
            metric.operating_system,
            metric.currency
        )
        select
          asset.creative_asset_id,
          asset.creative_family_id,
          asset.asset_key,
          asset.asset_type,
          asset.name,
          asset.thumbnail_url,
          aggregate.operating_system,
          aggregate.currency,
          aggregate.spend,
          aggregate.impressions,
          aggregate.daily_reach_sum,
          aggregate.link_clicks,
          aggregate.installs,
          aggregate.registrations,
          aggregate.video_3s_views,
          aggregate.video_100_views,
          aggregate.metric_days
        from aggregate
        join tracker.creative_assets asset
          on asset.creative_asset_id = aggregate.attributed_asset_id
        where ($6::text is null or asset.asset_type = $6)
          and (
            $11::text is null
            or asset.creative_family_id = $11
          )
        order by aggregate.spend desc, aggregate.impressions desc
        limit $7
        offset $8
      `,
      [
        filters.connectionId,
        filters.dateFrom,
        filters.dateTo,
        filters.adAccountId ?? null,
        filters.currency ?? null,
        filters.assetType ?? null,
        limit,
        offset,
        filters.accountMetaId?.trim() || null,
        filters.campaignMetaId?.trim() || null,
        filters.creativeFamilyId?.trim() || null,
        filters.attributionWindow?.trim() || null,
        filters.actionReportTime ?? null,
        filters.syncVersion?.trim() || null,
        filters.objectiveRawKeys?.length
          ? filters.objectiveRawKeys.map((key) =>
              key.trim().toUpperCase(),
            )
          : null,
      ],
    );

    return rows.map((row) => {
      const spend = asNumber(row.spend);
      const impressions = asNumber(row.impressions);
      const dailyReachSum = asNumber(row.daily_reach_sum);
      const linkClicks = asNumber(row.link_clicks);
      const installs = asNumber(row.installs);
      const registrations = asNumber(row.registrations);
      const video3sViews = asNumber(row.video_3s_views);
      const video100Views = asNumber(row.video_100_views);
      const isVideo = row.asset_type === "video";

      return {
        creativeAssetId: asId(row.creative_asset_id),
        creativeFamilyId:
          row.creative_family_id === null
            ? undefined
            : asId(row.creative_family_id),
        assetKey: String(row.asset_key),
        assetType: row.asset_type as CreativePerformanceItem["assetType"],
        name: row.name === null ? null : String(row.name),
        thumbnailUrl:
          row.thumbnail_url === null ? null : String(row.thumbnail_url),
        operatingSystem:
          row.operating_system as CreativePerformanceItem["operatingSystem"],
        currency: String(row.currency),
        spend,
        impressions,
        dailyReachSum,
        linkClicks,
        installs,
        registrations,
        video3sViews,
        video100Views,
        linkCtr: impressions > 0 ? (linkClicks / impressions) * 100 : null,
        cpi: installs > 0 ? spend / installs : null,
        costPerRegistration:
          registrations > 0 ? spend / registrations : null,
        hookRate:
          isVideo && impressions > 0
            ? (video3sViews / impressions) * 100
            : null,
        holdRate:
          isVideo && video3sViews > 0
            ? (video100Views / video3sViews) * 100
            : null,
        metricDays: asNumber(row.metric_days),
      };
    });
  }

  /**
   * Operational-account delivery totals include exact asset rows, single-asset
   * rows and intentionally unallocated dynamic rows exactly once. This is the
   * authoritative source for dashboard totals and OS CPI baselines.
   */
  async getDeliveryPerformance(
    filters: DeliveryPerformanceFilters,
  ): Promise<DeliveryPerformanceItem[]> {
    const rows = await this.query<DatabaseRow>(
      `
        select
          case
            when lower(metric.impression_device) like 'android%' then 'ANDROID'
            when lower(metric.impression_device) in (
              'ios',
              'iphone',
              'ipad',
              'ipod'
            ) then 'IOS'
            else 'UNKNOWN'
          end as operating_system,
          metric.currency,
          sum(metric.spend) as spend,
          sum(metric.impressions) as impressions,
          sum(metric.link_clicks) as link_clicks,
          sum(metric.installs) as installs,
          sum(metric.registrations) as registrations,
          sum(metric.video_3s_views) as video_3s_views,
          sum(metric.video_100_views) as video_100_views,
          count(distinct metric.metric_date) as metric_days
        from tracker.daily_metrics metric
        join tracker.meta_ad_accounts account
          on account.ad_account_id = metric.ad_account_id
        where metric.metric_date between $2::date and $3::date
          and account.connection_id = $1
          and account.is_active
          and account.account_status = 1
          and ($4::bigint is null or metric.ad_account_id = $4)
          and ($5::text is null or metric.currency = $5)
          and (
            $6::text is null
            or account.meta_ad_account_id = $6
          )
          and (
            $7::text is null
            or exists (
              select 1
              from tracker.meta_campaigns selected_campaign
              where selected_campaign.campaign_id = metric.campaign_id
                and selected_campaign.meta_campaign_id = $7
            )
          )
          and (
            $8::text is null
            or $8 = 'account_default'
            or metric.attribution_window = $8
          )
          and (
            $9::text is null
            or metric.action_report_time = $9
          )
          and (
            $10::text is null
            or metric.sync_version = $10
          )
          and (
            $11::text[] is null
            or exists (
              select 1
              from tracker.meta_campaigns objective_campaign
              where objective_campaign.campaign_id = metric.campaign_id
                and upper(coalesce(objective_campaign.objective, ''))
                  = any($11::text[])
            )
          )
        group by operating_system, metric.currency
        order by metric.currency, operating_system
      `,
      [
        filters.connectionId,
        filters.dateFrom,
        filters.dateTo,
        filters.adAccountId ?? null,
        filters.currency ?? null,
        filters.accountMetaId?.trim() || null,
        filters.campaignMetaId?.trim() || null,
        filters.attributionWindow?.trim() || null,
        filters.actionReportTime ?? null,
        filters.syncVersion?.trim() || null,
        filters.objectiveRawKeys?.length
          ? filters.objectiveRawKeys.map((key) =>
              key.trim().toUpperCase(),
            )
          : null,
      ],
    );

    return rows.map((row) => ({
      operatingSystem:
        row.operating_system as DeliveryPerformanceItem["operatingSystem"],
      currency: String(row.currency),
      spend: asNumber(row.spend),
      impressions: asNumber(row.impressions),
      linkClicks: asNumber(row.link_clicks),
      installs: asNumber(row.installs),
      registrations: asNumber(row.registrations),
      video3sViews: asNumber(row.video_3s_views),
      video100Views: asNumber(row.video_100_views),
      metricDays: asNumber(row.metric_days),
    }));
  }

  /**
   * Compact, additive delivery rows for the Overview Meta Breakdown.
   *
   * `daily_metrics` is normally an account-window replacement table, but this
   * read still enforces the source partition invariant. A legacy `creative`
   * row is never additive delivery. If an original Meta ad/day/delivery
   * partition contains both a primary ad row and exact asset rows, only the
   * reconciled asset rows are included; otherwise the primary ad row wins.
   * This keeps a stale mixed-scope partition from doubling Dynamic Creative
   * delivery while preserving the original Meta entity/delivery dimensions.
   */
  async getMetaBreakdownMetrics(
    filters: MetaBreakdownFilters,
  ): Promise<MetaBreakdownMetricRow[]> {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(filters.dateFrom) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo) ||
      filters.dateFrom > filters.dateTo
    ) {
      throw new TypeError("Meta breakdown filters contain an invalid date range.");
    }

    const adAccountMetaIds = filters.adAccountMetaIds
      ? normalizeSelectedAdAccountMetaIds(filters.adAccountMetaIds)
      : [];
    const campaignMetaIds = [
      ...new Set(
        (filters.campaignMetaIds ?? [])
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    const objectiveRawKeys = [
      ...new Set(
        (filters.objectiveRawKeys ?? [])
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean),
      ),
    ];
    const objectiveOwners = new Map<string, string>();
    for (const mapping of filters.objectiveMappings ?? []) {
      const objectiveKey = mapping.objectiveKey.trim().toLowerCase();
      if (!objectiveKey) continue;
      for (const rawKey of [
        mapping.objectiveKey,
        ...mapping.rawObjectiveKeys,
      ]) {
        const normalizedRawKey = rawKey.trim().toUpperCase();
        if (!normalizedRawKey) continue;
        const owner = objectiveOwners.get(normalizedRawKey);
        if (owner && owner !== objectiveKey) {
          throw new TypeError(
            "One raw Objective cannot map to multiple canonical Objectives.",
          );
        }
        objectiveOwners.set(normalizedRawKey, objectiveKey);
      }
    }
    const objectiveMappingPayload = [...objectiveOwners].map(
      ([rawObjectiveKey, objectiveKey]) => ({
        raw_objective_key: rawObjectiveKey,
        objective_key: objectiveKey,
      }),
    );
    const currency = filters.currency?.trim().toUpperCase() || null;
    if (currency && !/^[A-Z]{3}$/.test(currency)) {
      throw new TypeError("Meta breakdown currency is invalid.");
    }

    const rows = await this.query<DatabaseRow>(
      `
        with objective_mapping as (
          select distinct
            item.raw_objective_key,
            item.objective_key
          from jsonb_to_recordset($11::jsonb) as item(
            raw_objective_key text,
            objective_key text
          )
        ),
        scoped_metrics as (
          select metric.*
          from tracker.daily_metrics metric
          join tracker.meta_ad_accounts account
            on account.ad_account_id = metric.ad_account_id
          join tracker.meta_campaigns campaign
            on campaign.campaign_id = metric.campaign_id
            and campaign.ad_account_id = metric.ad_account_id
          where metric.metric_date between $2::date and $3::date
            and account.connection_id = $1
            and account.is_active
            and account.account_status = 1
            and metric.metric_scope in ('ad', 'asset')
            and (
              $4::text[] is null
              or account.meta_ad_account_id = any($4::text[])
            )
            and (
              $5::text[] is null
              or campaign.meta_campaign_id = any($5::text[])
            )
            and ($6::text is null or upper(metric.currency) = $6)
            and (
              $7::text is null
              or $7 = 'account_default'
              or metric.attribution_window = $7
            )
            and ($8::text is null or metric.action_report_time = $8)
            and ($9::text is null or metric.sync_version = $9)
            and (
              $10::text[] is null
              or upper(coalesce(campaign.objective, '')) = any($10::text[])
            )
        ),
        partition_totals as (
          select
            metric.ad_account_id,
            metric.ad_id,
            metric.metric_date,
            metric.country,
            metric.publisher_platform,
            metric.platform_position,
            metric.impression_device,
            metric.attribution_window,
            metric.action_report_time,
            metric.sync_version,
            upper(metric.currency) as currency,
            bool_or(metric.metric_scope = 'ad') as has_ad_scope,
            bool_or(metric.metric_scope = 'asset') as has_asset_scope,
            bool_and(
              metric.allocation_method = 'exact'
              and metric.creative_asset_id is not null
            ) filter (where metric.metric_scope = 'asset')
              as all_asset_rows_exact,
            coalesce(
              sum(metric.spend) filter (where metric.metric_scope = 'ad'),
              0
            ) as ad_spend,
            coalesce(
              sum(metric.impressions) filter (where metric.metric_scope = 'ad'),
              0
            ) as ad_impressions,
            coalesce(
              sum(metric.link_clicks) filter (where metric.metric_scope = 'ad'),
              0
            ) as ad_link_clicks,
            coalesce(
              sum(metric.spend) filter (where metric.metric_scope = 'asset'),
              0
            ) as asset_spend,
            coalesce(
              sum(metric.impressions) filter (where metric.metric_scope = 'asset'),
              0
            ) as asset_impressions,
            coalesce(
              sum(metric.link_clicks) filter (where metric.metric_scope = 'asset'),
              0
            ) as asset_link_clicks
          from scoped_metrics metric
          group by
            metric.ad_account_id,
            metric.ad_id,
            metric.metric_date,
            metric.country,
            metric.publisher_platform,
            metric.platform_position,
            metric.impression_device,
            metric.attribution_window,
            metric.action_report_time,
            metric.sync_version,
            upper(metric.currency)
        ),
        partition_policy as (
          select
            partition.*,
            case
              when partition.has_ad_scope and partition.has_asset_scope
                and partition.all_asset_rows_exact
                and abs(partition.asset_spend - partition.ad_spend)
                  <= greatest(0.01::numeric, abs(partition.ad_spend) * 0.001)
                and abs(partition.asset_impressions - partition.ad_impressions)
                  <= greatest(1::numeric, abs(partition.ad_impressions) * 0.001)
                and abs(partition.asset_link_clicks - partition.ad_link_clicks)
                  <= greatest(0.01::numeric, abs(partition.ad_link_clicks) * 0.001)
                then 'reconciled_asset'
              when partition.has_ad_scope then 'primary_ad'
              else 'asset_only'
            end as selected_scope
          from partition_totals partition
        ),
        selected_metrics as (
          select metric.*
          from scoped_metrics metric
          join partition_policy partition
            on partition.ad_account_id = metric.ad_account_id
            and partition.ad_id = metric.ad_id
            and partition.metric_date = metric.metric_date
            and partition.country = metric.country
            and partition.publisher_platform = metric.publisher_platform
            and partition.platform_position = metric.platform_position
            and partition.impression_device = metric.impression_device
            and partition.attribution_window = metric.attribution_window
            and partition.action_report_time = metric.action_report_time
            and partition.sync_version = metric.sync_version
            and partition.currency = upper(metric.currency)
          where (
            partition.selected_scope = 'reconciled_asset'
            and metric.metric_scope = 'asset'
            and metric.allocation_method = 'exact'
            and metric.creative_asset_id is not null
          ) or (
            partition.selected_scope = 'primary_ad'
            and metric.metric_scope = 'ad'
          ) or (
            partition.selected_scope = 'asset_only'
            and metric.metric_scope = 'asset'
          )
        )
        select
          account.meta_ad_account_id,
          nullif(trim(account.name), '') as ad_account_name,
          campaign.meta_campaign_id,
          nullif(trim(campaign.name), '') as campaign_name,
          objective.objective_key,
          metric.publisher_platform,
          metric.platform_position,
          upper(metric.currency) as currency,
          sum(metric.spend) as spend,
          sum(metric.impressions) as impressions,
          sum(metric.link_clicks) as link_clicks
        from selected_metrics metric
        join tracker.meta_ad_accounts account
          on account.ad_account_id = metric.ad_account_id
        join tracker.meta_campaigns campaign
          on campaign.campaign_id = metric.campaign_id
          and campaign.ad_account_id = metric.ad_account_id
        left join objective_mapping objective
          on objective.raw_objective_key =
            upper(coalesce(campaign.objective, ''))
        group by
          account.meta_ad_account_id,
          account.name,
          campaign.meta_campaign_id,
          campaign.name,
          objective.objective_key,
          metric.publisher_platform,
          metric.platform_position,
          upper(metric.currency)
        order by upper(metric.currency), account.meta_ad_account_id,
          campaign.meta_campaign_id, metric.publisher_platform,
          metric.platform_position
      `,
      [
        filters.connectionId,
        filters.dateFrom,
        filters.dateTo,
        filters.adAccountMetaIds === undefined
          ? null
          : adAccountMetaIds,
        filters.campaignMetaIds === undefined ? null : campaignMetaIds,
        currency,
        filters.attributionWindow?.trim() || null,
        filters.actionReportTime ?? null,
        filters.syncVersion?.trim() || null,
        filters.objectiveRawKeys === undefined ? null : objectiveRawKeys,
        jsonPayload(objectiveMappingPayload),
      ],
    );

    return rows.map((row) => ({
      adAccountMetaId: String(row.meta_ad_account_id),
      adAccountName:
        row.ad_account_name === null || row.ad_account_name === undefined
          ? null
          : String(row.ad_account_name),
      campaignMetaId: String(row.meta_campaign_id),
      campaignName:
        row.campaign_name === null || row.campaign_name === undefined
          ? null
          : String(row.campaign_name),
      objectiveKey:
        row.objective_key === null || row.objective_key === undefined
          ? null
          : String(row.objective_key),
      publisherPlatform: String(row.publisher_platform),
      platformPosition: String(row.platform_position),
      currency: String(row.currency),
      spend: asNumber(row.spend),
      impressions: asNumber(row.impressions),
      linkClicks: asNumber(row.link_clicks),
    }));
  }

  /**
   * Daily Overview trend grouped by currency. Keeping currency in both the
   * grouping key and the returned DTO prevents mixed-currency CPI/CPA.
   */
  async getDeliveryTrend(
    filters: DeliveryTrendFilters,
  ): Promise<DeliveryTrendItem[]> {
    const accountMetaIds =
      filters.adAccountMetaIds === undefined
        ? filters.accountMetaId?.trim()
          ? [filters.accountMetaId.trim()]
          : null
        : [
            ...new Set(
              filters.adAccountMetaIds
                .map((value) => value.trim())
                .filter(Boolean),
            ),
          ];
    const rows = await this.query<DatabaseRow>(
      `
        select
          metric.metric_date,
          metric.currency,
          sum(metric.spend) as spend,
          sum(metric.impressions) as impressions,
          sum(metric.link_clicks) as link_clicks,
          sum(metric.installs) as installs,
          sum(metric.registrations) as registrations,
          sum(metric.video_3s_views) as video_3s_views,
          sum(metric.video_100_views) as video_100_views
        from tracker.daily_metrics metric
        join tracker.meta_ad_accounts account
          on account.ad_account_id = metric.ad_account_id
        where metric.metric_date between $2::date and $3::date
          and account.connection_id = $1
          and (
            $11::boolean
            or (account.is_active and account.account_status = 1)
          )
          and ($4::bigint is null or metric.ad_account_id = $4)
          and ($5::text is null or metric.currency = $5)
          and (
            $6::text[] is null
            or account.meta_ad_account_id = any($6::text[])
          )
          and (
            $7::text is null
            or exists (
              select 1
              from tracker.meta_campaigns selected_campaign
              where selected_campaign.campaign_id = metric.campaign_id
                and selected_campaign.meta_campaign_id = $7
            )
          )
          and (
            $8::text is null
            or $8 = 'account_default'
            or metric.attribution_window = $8
          )
          and (
            $9::text is null
            or metric.action_report_time = $9
          )
          and (
            $10::text is null
            or metric.sync_version = $10
          )
          and (
            $12::text[] is null
            or exists (
              select 1
              from tracker.meta_campaigns objective_campaign
              where objective_campaign.campaign_id = metric.campaign_id
                and upper(coalesce(objective_campaign.objective, ''))
                  = any($12::text[])
            )
          )
        group by metric.metric_date, metric.currency
        order by metric.metric_date, metric.currency
      `,
      [
        filters.connectionId,
        filters.dateFrom,
        filters.dateTo,
        filters.adAccountId ?? null,
        filters.currency?.trim() || null,
        accountMetaIds,
        filters.campaignMetaId?.trim() || null,
        filters.attributionWindow?.trim() || null,
        filters.actionReportTime ?? null,
        filters.syncVersion?.trim() || null,
        filters.includeInactiveAccounts === true,
        filters.objectiveRawKeys?.length
          ? filters.objectiveRawKeys.map((key) =>
              key.trim().toUpperCase(),
            )
          : null,
      ],
    );

    return rows.map((row) => {
      const spend = asNumber(row.spend);
      const impressions = asNumber(row.impressions);
      const linkClicks = asNumber(row.link_clicks);
      const installs = asNumber(row.installs);
      const registrations = asNumber(row.registrations);

      return {
        metricDate: asIso(row.metric_date).slice(0, 10),
        currency: String(row.currency),
        spend,
        impressions,
        linkClicks,
        installs,
        registrations,
        video3sViews: asNumber(row.video_3s_views),
        video100Views: asNumber(row.video_100_views),
        linkCtr: impressions > 0 ? (linkClicks / impressions) * 100 : null,
        cpi: installs > 0 ? spend / installs : null,
        costPerRegistration:
          registrations > 0 ? spend / registrations : null,
      };
    });
  }

  async listCreativeTracker(
    filters: CreativeTrackerFilters,
  ): Promise<CreativeTrackerPage> {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);
    const includeInactiveAccounts =
      filters.includeInactiveAccounts === true;
    const rows = await this.query<DatabaseRow>(
      `
        with base_metrics as (
          select
            metric.*,
            coalesce(
              nullif(ad.creative_code, ''),
              'CHƯA RÕ MÃ'
            ) as creative_code,
            ad.name as ad_name,
            account.meta_ad_account_id,
            account.name as ad_account_name,
            campaign.meta_campaign_id,
            campaign.name as campaign_name,
            asset.asset_type,
            case
              when lower(metric.impression_device) like 'android%' then 'ANDROID'
              when lower(metric.impression_device) in (
                'ios',
                'iphone',
                'ipad',
                'ipod'
              ) then 'IOS'
              else 'UNKNOWN'
            end as operating_system
          from tracker.daily_metrics metric
          join tracker.meta_ad_accounts account
            on account.ad_account_id = metric.ad_account_id
          join tracker.meta_campaigns campaign
            on campaign.campaign_id = metric.campaign_id
          join tracker.meta_ads ad
            on ad.ad_id = metric.ad_id
          left join tracker.creative_assets asset
            on asset.creative_asset_id = metric.creative_asset_id
          where metric.metric_date between $2::date and $3::date
            and account.connection_id = $1
            and (
              $4::boolean
              or (account.is_active and account.account_status = 1)
            )
            and (
              $5::text is null
              or account.meta_ad_account_id = $5
            )
            and (
              $6::text is null
              or campaign.meta_campaign_id = $6
            )
            and ($7::text is null or metric.currency = $7)
            and (
              $8::text is null
              or asset.asset_type = $8
              or (
                $8 = 'unallocated'
                and metric.allocation_method = 'unallocated'
              )
            )
        ),
        baselines as (
          select
            operating_system,
            currency,
            sum(spend) / nullif(sum(installs), 0) as os_baseline_cpi
          from base_metrics
          group by operating_system, currency
        ),
        aggregate as (
          select
            creative_code,
            operating_system,
            currency,
            case
              when count(
                distinct coalesce(asset_type, 'unallocated')
              ) = 1
                then min(coalesce(asset_type, 'unallocated'))
              else 'mixed'
            end as format,
            sum(spend) as spend,
            sum(impressions) as impressions,
            sum(reported_reach) as daily_reach_sum,
            sum(link_clicks) as link_clicks,
            sum(installs) as installs,
            sum(registrations) as registrations,
            sum(video_3s_views) as video_3s_views,
            sum(video_100_views) as video_100_views,
            count(distinct ad_account_id) as account_count,
            count(distinct campaign_id) as campaign_count,
            count(distinct ad_id) as ad_count,
            count(distinct creative_asset_id) as asset_count,
            bool_or(allocation_method = 'unallocated')
              as has_unallocated_delivery,
            count(distinct metric_date) as metric_days
          from base_metrics
          where (
            $9::text is null
            or creative_code ilike '%' || $9 || '%'
            or ad_name ilike '%' || $9 || '%'
            or campaign_name ilike '%' || $9 || '%'
            or ad_account_name ilike '%' || $9 || '%'
          )
          group by creative_code, operating_system, currency
        )
        select
          aggregate.*,
          baselines.os_baseline_cpi,
          count(*) over () as total_count
        from aggregate
        join baselines using (operating_system, currency)
        order by aggregate.spend desc, aggregate.impressions desc
        limit $10
        offset $11
      `,
      [
        filters.connectionId,
        filters.dateFrom,
        filters.dateTo,
        includeInactiveAccounts,
        filters.accountMetaId?.trim() || null,
        filters.campaignMetaId?.trim() || null,
        filters.currency?.trim() || null,
        filters.assetType ?? null,
        filters.search?.trim() || null,
        limit,
        offset,
      ],
    );

    const items: CreativeTrackerItem[] = rows.map((row) => ({
      creativeCode: String(row.creative_code),
      operatingSystem:
        row.operating_system as CreativeTrackerItem["operatingSystem"],
      currency: String(row.currency),
      format: row.format as CreativeTrackerItem["format"],
      spend: asNumber(row.spend),
      impressions: asNumber(row.impressions),
      dailyReachSum: asNumber(row.daily_reach_sum),
      linkClicks: asNumber(row.link_clicks),
      installs: asNumber(row.installs),
      registrations: asNumber(row.registrations),
      video3sViews: asNumber(row.video_3s_views),
      video100Views: asNumber(row.video_100_views),
      accountCount: asNumber(row.account_count),
      campaignCount: asNumber(row.campaign_count),
      adCount: asNumber(row.ad_count),
      assetCount: asNumber(row.asset_count),
      hasUnallocatedDelivery: Boolean(row.has_unallocated_delivery),
      osBaselineCpi:
        row.os_baseline_cpi === null
          ? null
          : asNumber(row.os_baseline_cpi),
      metricDays: asNumber(row.metric_days),
    }));

    return {
      items,
      total: rows[0] ? asNumber(rows[0].total_count) : 0,
      limit,
      offset,
    };
  }

  async createSyncRun(input: CreateSyncRunInput): Promise<SyncRunRecord> {
    const rows = await this.query<DatabaseRow>(
      `
        insert into tracker.sync_runs (
          connection_id,
          request_key,
          sync_kind,
          trigger_source,
          status,
          window_start,
          window_end
        ) values (
          $1,
          $2,
          $3,
          $4,
          'queued',
          $5::date,
          $6::date
        )
        on conflict (connection_id, request_key)
        do update set request_key = excluded.request_key
        returning *
      `,
      [
        input.connectionId,
        input.requestKey ?? null,
        input.syncKind,
        input.triggerSource,
        input.windowStart ?? null,
        input.windowEnd ?? null,
      ],
    );

    return mapSyncRun(rows[0]);
  }

  /**
   * The advisory lock proves no other sync session currently owns this
   * connection. Any older queued/running rows are therefore interrupted runs,
   * typically left behind when the serverless runtime terminated the process.
   */
  async recoverInterruptedSyncRuns(
    connectionId: DatabaseId,
    currentSyncRunId: DatabaseId,
  ): Promise<number> {
    const rows = await this.query<DatabaseRow>(
      `
        update tracker.sync_runs
        set
          status = 'failed',
          finished_at = now(),
          error_code = 'STALE_SYNC_RUN_RECOVERED',
          error_message = 'Recovered after the previous sync process ended unexpectedly'
        where connection_id = $1
          and sync_run_id < $2
          and status in ('queued', 'running')
        returning sync_run_id
      `,
      [connectionId, currentSyncRunId],
    );
    return rows.length;
  }

  async listRecentSyncRuns(
    connectionId: DatabaseId,
    limit = 10,
  ): Promise<SyncRunRecord[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const rows = await this.query<DatabaseRow>(
      `
        select *
        from tracker.sync_runs
        where connection_id = $1
        order by created_at desc
        limit $2
      `,
      [connectionId, safeLimit],
    );
    return rows.map(mapSyncRun);
  }

  async getSyncRun(syncRunId: DatabaseId): Promise<SyncRunRecord | null> {
    const rows = await this.query<DatabaseRow>(
      "select * from tracker.sync_runs where sync_run_id = $1",
      [syncRunId],
    );
    return rows[0] ? mapSyncRun(rows[0]) : null;
  }

  async startSyncRun(syncRunId: DatabaseId, stage: string): Promise<void> {
    await this.query(
      `
        update tracker.sync_runs
        set
          status = 'running',
          started_at = now(),
          finished_at = null,
          current_stage = $2,
          progress = '{}'::jsonb,
          stats = '{}'::jsonb,
          error_code = null,
          error_message = null
        where sync_run_id = $1
      `,
      [syncRunId, stage],
    );
  }

  async updateSyncStage(input: {
    syncRunId: DatabaseId;
    stage: string;
    progress?: JsonObject;
    stats?: JsonObject;
  }): Promise<void> {
    await this.query(
      `
        update tracker.sync_runs
        set
          current_stage = $2,
          progress = case
            when $3::jsonb is null then progress
            else progress || $3::jsonb
          end,
          stats = case
            when $4::jsonb is null then stats
            else stats || $4::jsonb
          end
        where sync_run_id = $1
      `,
      [
        input.syncRunId,
        input.stage,
        input.progress ? jsonPayload(input.progress) : null,
        input.stats ? jsonPayload(input.stats) : null,
      ],
    );
  }

  async finishSyncRun(input: {
    syncRunId: DatabaseId;
    status: "succeeded" | "partial" | "cancelled";
    stats?: JsonObject;
  }): Promise<void> {
    await this.query(
      `
        update tracker.sync_runs
        set
          status = $2,
          finished_at = now(),
          current_stage = 'complete',
          stats = case
            when $3::jsonb is null then stats
            else stats || $3::jsonb
          end
        where sync_run_id = $1
      `,
      [
        input.syncRunId,
        input.status,
        input.stats ? jsonPayload(input.stats) : null,
      ],
    );
  }

  async failSyncRun(input: {
    syncRunId: DatabaseId;
    errorCode: string;
    errorMessage: string;
    stats?: JsonObject;
  }): Promise<void> {
    await this.query(
      `
        update tracker.sync_runs
        set
          status = 'failed',
          finished_at = now(),
          error_code = $2,
          error_message = $3,
          stats = case
            when $4::jsonb is null then stats
            else stats || $4::jsonb
          end
        where sync_run_id = $1
      `,
      [
        input.syncRunId,
        input.errorCode,
        input.errorMessage,
        input.stats ? jsonPayload(input.stats) : null,
      ],
    );
  }

  async saveCheckpoint(input: {
    connectionId: DatabaseId;
    resourceKey: string;
    cursorState?: JsonObject;
    highWaterMark?: string | null;
    markSuccessful?: boolean;
  }): Promise<void> {
    await this.query(
      `
        insert into tracker.sync_checkpoints (
          connection_id,
          resource_key,
          cursor_state,
          high_water_mark,
          last_successful_sync_at
        ) values (
          $1,
          $2,
          coalesce($3::jsonb, '{}'::jsonb),
          $4::timestamptz,
          case when $5 then now() else null end
        )
        on conflict (connection_id, resource_key) do update set
          cursor_state = excluded.cursor_state,
          high_water_mark = excluded.high_water_mark,
          last_successful_sync_at = case
            when $5 then now()
            else tracker.sync_checkpoints.last_successful_sync_at
          end,
          updated_at = now()
      `,
      [
        input.connectionId,
        input.resourceKey,
        input.cursorState ? jsonPayload(input.cursorState) : null,
        input.highWaterMark ?? null,
        input.markSuccessful ?? false,
      ],
    );
  }

  async listReportingScopeInventory(connectionId: DatabaseId) {
    const [businesses, adAccounts] = await Promise.all([
      this.query<DatabaseRow>(
        `
          select
            business.meta_business_id,
            business.name,
            business.is_active,
            coalesce(
              array_agg(distinct account.meta_ad_account_id)
                filter (where account.meta_ad_account_id is not null),
              '{}'::text[]
            ) as ad_account_ids
          from tracker.meta_businesses business
          left join tracker.business_ad_accounts relation
            on relation.business_id = business.business_id
          left join tracker.meta_ad_accounts account
            on account.ad_account_id = relation.ad_account_id
            and account.connection_id = business.connection_id
          where business.connection_id = $1
          group by
            business.business_id,
            business.meta_business_id,
            business.name,
            business.is_active
          order by business.is_active desc, business.name
        `,
        [connectionId],
      ),
      this.query<DatabaseRow>(
        `
          select
            account.meta_ad_account_id,
            account.name,
            account.is_active,
            account.account_status,
            account.currency,
            account.timezone_name,
            coalesce(
              array_agg(distinct business.meta_business_id)
                filter (where business.meta_business_id is not null),
              '{}'::text[]
            ) as business_ids
          from tracker.meta_ad_accounts account
          left join tracker.business_ad_accounts relation
            on relation.ad_account_id = account.ad_account_id
          left join tracker.meta_businesses business
            on business.business_id = relation.business_id
            and business.connection_id = account.connection_id
          where account.connection_id = $1
          group by
            account.ad_account_id,
            account.meta_ad_account_id,
            account.name,
            account.is_active,
            account.account_status,
            account.currency,
            account.timezone_name
          order by
            coalesce(account.is_active and account.account_status = 1, false)
              desc,
            account.is_active desc,
            account.name
        `,
        [connectionId],
      ),
    ]);

    return {
      businesses: businesses.map((row) => ({
        id: String(row.meta_business_id),
        name: String(row.name),
        isActive: Boolean(row.is_active),
        adAccountIds: asStringArray(row.ad_account_ids),
      })),
      adAccounts: adAccounts.map((row) => ({
        id: String(row.meta_ad_account_id),
        name: String(row.name),
        isActive: Boolean(row.is_active),
        accountStatus: asNullableNumber(row.account_status),
        currency: String(row.currency),
        timezone: String(row.timezone_name),
        businessIds: asStringArray(row.business_ids),
      })),
    };
  }

  async getReportingScope(connectionId: DatabaseId) {
    const rows = await this.query<DatabaseRow>(
      `
        select
          scope.confirmed_at,
          scope.updated_at,
          array(
            select member.meta_business_id
            from tracker.reporting_scope_business_members member
            where member.connection_id = scope.connection_id
            order by member.meta_business_id
          ) as business_ids,
          array(
            select member.meta_ad_account_id
            from tracker.reporting_scope_ad_account_members member
            where member.connection_id = scope.connection_id
            order by member.meta_ad_account_id
          ) as ad_account_ids
        from tracker.reporting_scopes scope
        where scope.connection_id = $1
        limit 1
      `,
      [connectionId],
    );
    const row = rows[0];
    if (!row) {
      return {
        businessIds: [],
        adAccountIds: [],
        confirmedAt: null,
        updatedAt: null,
      };
    }

    return {
      businessIds: asStringArray(row.business_ids),
      adAccountIds: asStringArray(row.ad_account_ids),
      confirmedAt: asNullableIso(row.confirmed_at),
      updatedAt: asNullableIso(row.updated_at),
    };
  }

  async saveReportingScope(input: {
    connectionId: DatabaseId;
    businessIds: readonly string[];
    adAccountIds: readonly string[];
  }) {
    return this.database.begin(async (transaction) => {
      await transaction.unsafe(
        `
          insert into tracker.reporting_scopes (
            connection_id,
            owner_id,
            confirmed_at
          )
          select connection_id, owner_id, now()
          from tracker.meta_connections
          where connection_id = $1
            and owner_id = 1
          on conflict (connection_id) do update set
            confirmed_at = now(),
            updated_at = now()
        `,
        [input.connectionId],
      );
      await transaction.unsafe(
        `
          delete from tracker.reporting_scope_business_members
          where connection_id = $1
        `,
        [input.connectionId],
      );
      await transaction.unsafe(
        `
          delete from tracker.reporting_scope_ad_account_members
          where connection_id = $1
        `,
        [input.connectionId],
      );
      await transaction.unsafe(
        `
          with requested as (
            select distinct jsonb_array_elements_text($2::jsonb)
              as meta_business_id
          )
          insert into tracker.reporting_scope_business_members (
            connection_id,
            meta_business_id
          )
          select $1, business.meta_business_id
          from requested
          join tracker.meta_businesses business
            on business.connection_id = $1
            and business.meta_business_id = requested.meta_business_id
        `,
        [input.connectionId, jsonPayload(input.businessIds)],
      );
      await transaction.unsafe(
        `
          with requested as (
            select distinct jsonb_array_elements_text($2::jsonb)
              as meta_ad_account_id
          )
          insert into tracker.reporting_scope_ad_account_members (
            connection_id,
            meta_ad_account_id
          )
          select $1, account.meta_ad_account_id
          from requested
          join tracker.meta_ad_accounts account
            on account.connection_id = $1
            and account.meta_ad_account_id = requested.meta_ad_account_id
        `,
        [input.connectionId, jsonPayload(input.adAccountIds)],
      );

      const transactionRepository = new TrackerRepository(
        transaction as unknown as DatabaseClient,
      );
      return transactionRepository.getReportingScope(input.connectionId);
    });
  }

  async listResultDefinitions() {
    const rows = await this.query<DatabaseRow>(
      `
        select *
        from tracker.result_definitions
        where owner_id = 1
        order by enabled desc, canonical_key
      `,
    );
    return rows.map((row) => ({
      id: asId(row.result_definition_id),
      canonicalKey: String(row.canonical_key),
      label: String(row.label),
      shortLabel: String(row.short_label),
      objectiveKeys: asStringArray(row.objective_keys),
      rawActionTypes: asStringArray(row.raw_action_types),
      rawValueActionTypes: asStringArray(
        row.raw_value_action_types,
      ),
      unit: row.unit as
        | "count"
        | "currency"
        | "percent"
        | "duration",
      efficiencyMetric: row.efficiency_metric as
        | "cost_per_result"
        | "rate"
        | "roas"
        | "none",
      direction: row.direction as
        | "lower_is_better"
        | "higher_is_better",
      defaultForObjective: Boolean(row.default_for_objective),
      minimumResults: asNumber(row.minimum_results),
      minimumImpressions: asNumber(row.minimum_impressions),
      enabled: Boolean(row.enabled),
    }));
  }

  async listResultMappings() {
    const rows = await this.query<DatabaseRow>(
      `
        select
          mapping.result_mapping_id,
          definition.canonical_key,
          mapping.raw_action_type,
          mapping.metric_source,
          mapping.priority,
          mapping.mapping_source,
          mapping.enabled
        from tracker.result_mappings mapping
        join tracker.result_definitions definition
          on definition.owner_id = mapping.owner_id
          and definition.result_definition_id =
            mapping.result_definition_id
        where mapping.owner_id = 1
        order by
          definition.canonical_key,
          mapping.metric_source,
          mapping.priority,
          mapping.raw_action_type
      `,
    );
    return rows.map((row) => ({
      id: asId(row.result_mapping_id),
      canonicalResultKey: String(row.canonical_key),
      rawActionType: String(row.raw_action_type),
      metricSource: row.metric_source as "action" | "action_value",
      priority: asNumber(row.priority),
      mappingSource: row.mapping_source as "system" | "owner",
      enabled: Boolean(row.enabled),
    }));
  }

  async listCampaignResultOverrides(connectionId: DatabaseId) {
    const rows = await this.query<DatabaseRow>(
      `
        select
          campaign.meta_campaign_id,
          definition.canonical_key,
          override.enabled
        from tracker.campaign_result_overrides override
        join tracker.result_definitions definition
          on definition.owner_id = override.owner_id
          and definition.result_definition_id =
            override.result_definition_id
        join tracker.meta_campaigns campaign
          on campaign.campaign_id = override.campaign_id
        join tracker.meta_ad_accounts account
          on account.ad_account_id = campaign.ad_account_id
        where override.owner_id = 1
          and account.connection_id = $1
        order by campaign.meta_campaign_id
      `,
      [connectionId],
    );
    return rows.map((row) => ({
      campaignId: String(row.meta_campaign_id),
      canonicalResultKey: String(row.canonical_key),
      enabled: Boolean(row.enabled),
    }));
  }

  async saveResultMappings(input: {
    connectionId: DatabaseId;
    mappings: readonly {
      canonicalResultKey: string;
      rawActionType: string;
      metricSource: "action" | "action_value";
      priority: number;
      enabled: boolean;
    }[];
  }) {
    return this.database.begin(async (transaction) => {
      const lockedConnections = await transaction.unsafe(
        `
          select connection_id
          from tracker.meta_connections
          where connection_id = $1
            and owner_id = 1
          for update
        `,
        [input.connectionId],
      );
      if (lockedConnections.length !== 1) {
        throw new TypeError(
          "Result mapping connection scope is invalid.",
        );
      }
      const transactionRepository = new TrackerRepository(
        transaction as unknown as DatabaseClient,
      );
      const before = await transactionRepository.listResultMappings();
      const beforeVersion = computeResultMappingVersion(before);
      await transaction.unsafe(
        `
          delete from tracker.result_mappings
          where owner_id = (
            select owner_id
            from tracker.meta_connections
            where connection_id = $1
              and owner_id = 1
          )
        `,
        [input.connectionId],
      );
      await transaction.unsafe(
        `
          with requested as (
            select *
            from jsonb_to_recordset($2::jsonb) as item(
              canonical_result_key text,
              raw_action_type text,
              metric_source text,
              priority integer,
              enabled boolean
            )
          )
          insert into tracker.result_mappings (
            owner_id,
            result_definition_id,
            raw_action_type,
            metric_source,
            priority,
            mapping_source,
            enabled
          )
          select
            definition.owner_id,
            definition.result_definition_id,
            requested.raw_action_type,
            requested.metric_source,
            requested.priority,
            'owner',
            requested.enabled
          from requested
          join tracker.result_definitions definition
            on definition.owner_id = 1
            and definition.canonical_key =
              requested.canonical_result_key
          where exists (
            select 1
            from tracker.meta_connections connection
            where connection.connection_id = $1
              and connection.owner_id = definition.owner_id
          )
        `,
        [
          input.connectionId,
          jsonPayload(
            input.mappings.map((mapping) => ({
              canonical_result_key: mapping.canonicalResultKey,
              raw_action_type: mapping.rawActionType,
              metric_source: mapping.metricSource,
              priority: mapping.priority,
              enabled: mapping.enabled,
            })),
          ),
        ],
      );
      const after = await transactionRepository.listResultMappings();
      const afterVersion = computeResultMappingVersion(after);
      const resultMappingsChanged = beforeVersion !== afterVersion;
      const snapshotRows = await transaction.unsafe(
        `
          update tracker.reporting_snapshots
          set
            normalized_results_require_resync =
              result_mapping_version is distinct from $2,
            result_mapping_invalidated_at = case
              when result_mapping_version is distinct from $2
                then coalesce(result_mapping_invalidated_at, now())
              else null
            end
          where connection_id = $1
          returning normalized_results_require_resync
        `,
        [input.connectionId, afterVersion],
      );
      const normalizedResultsRequireResync =
        snapshotRows.length > 0
          ? Boolean(
              snapshotRows[0]?.normalized_results_require_resync,
            )
          : resultMappingsChanged;
      await transaction.unsafe(
        `
          insert into tracker.settings_audit_log (
            owner_id,
            changed_by,
            before_state,
            after_state
          ) values (
            1,
            'owner:result_mappings',
            $1::jsonb,
            $2::jsonb
          )
        `,
        [
          jsonPayload({
            resultMappings: before,
            resultMappingVersion: beforeVersion,
          }),
          jsonPayload({
            resultMappings: after,
            resultMappingVersion: afterVersion,
            resultMappingsChanged,
            normalizedResultsRequireResync,
          }),
        ],
      );
      return after;
    });
  }
}

export async function createTrackerRepository(): Promise<TrackerRepository> {
  return new TrackerRepository(await getDatabase());
}

export async function createOptionalTrackerRepository(): Promise<TrackerRepository | null> {
  const database = await getOptionalDatabase();
  return database ? new TrackerRepository(database) : null;
}
