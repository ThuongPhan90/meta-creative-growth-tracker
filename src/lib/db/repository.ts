import type postgres from "postgres";

import type { DatabaseClient } from "./client";
import { getDatabase, getOptionalDatabase } from "./client";
import type {
  AdAccountInput,
  AdCreativeLinkInput,
  AdInput,
  AdSetInput,
  AssetRelationshipInput,
  BusinessInput,
  CampaignInventoryFilters,
  CampaignInventoryItem,
  CampaignInventoryPage,
  CampaignInput,
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
  JsonObject,
  MetaAppInput,
  MetaAssetInventory,
  MetaConnectionInput,
  MetaConnectionRecord,
  MetaConnectionSecretRecord,
  PageInput,
  SyncRunRecord,
  TrackerSettings,
  TrackerSettingsUpdate,
} from "./types";

type DatabaseRow = Record<string, unknown>;

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

function asJsonObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }

  return {};
}

function jsonPayload(value: unknown): string {
  return JSON.stringify(value);
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
          benchmark_mode = 'os',
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

    return {
      ownerId: asNumber(row.owner_id),
      reportingTimezone: String(row.reporting_timezone),
      reportingCurrency:
        row.reporting_currency === null ? null : String(row.reporting_currency),
      syncLookbackDays: asNumber(row.sync_lookback_days),
      minimumInstallThreshold: asNumber(row.minimum_install_threshold),
      benchmarkMode: row.benchmark_mode as TrackerSettings["benchmarkMode"],
      installActionTypes: asStringArray(row.install_action_types),
      registrationActionTypes: asStringArray(row.registration_action_types),
      lastInitialSyncAt: asNullableIso(row.last_initial_sync_at),
      updatedAt: asIso(row.updated_at),
    };
  }

  async updateSettings(
    update: TrackerSettingsUpdate,
  ): Promise<TrackerSettings> {
    const current = await this.getSettings();
    const next = { ...current, ...update };

    const rows = await this.query<DatabaseRow>(
      `
        update tracker.app_settings
        set
          reporting_timezone = $1,
          reporting_currency = $2,
          sync_lookback_days = $3,
          minimum_install_threshold = $4,
          benchmark_mode = $5,
          install_action_types = $6::text[],
          registration_action_types = $7::text[],
          last_initial_sync_at = $8::timestamptz
        where owner_id = 1
        returning *
      `,
      [
        next.reportingTimezone,
        next.reportingCurrency,
        next.syncLookbackDays,
        next.minimumInstallThreshold,
        next.benchmarkMode,
        next.installActionTypes,
        next.registrationActionTypes,
        next.lastInitialSyncAt,
      ],
    );

    const row = rows[0];
    return {
      ownerId: asNumber(row.owner_id),
      reportingTimezone: String(row.reporting_timezone),
      reportingCurrency:
        row.reporting_currency === null ? null : String(row.reporting_currency),
      syncLookbackDays: asNumber(row.sync_lookback_days),
      minimumInstallThreshold: asNumber(row.minimum_install_threshold),
      benchmarkMode: row.benchmark_mode as TrackerSettings["benchmarkMode"],
      installActionTypes: asStringArray(row.install_action_types),
      registrationActionTypes: asStringArray(row.registration_action_types),
      lastInitialSyncAt: asNullableIso(row.last_initial_sync_at),
      updatedAt: asIso(row.updated_at),
    };
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

    const payload = links.map((link) => ({
      creative_id: link.creativeId,
      creative_asset_id: link.creativeAssetId,
      position: link.position ?? 0,
      role: link.role ?? "primary",
      source: link.source ?? "creative",
    }));

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
    const allowed = new Set(creativeIds);
    if (links.some((link) => !allowed.has(link.creativeId))) {
      throw new TypeError("Creative asset links exceed replacement scope.");
    }
    const payload = links.map((link) => ({
      creative_id: link.creativeId,
      creative_asset_id: link.creativeAssetId,
      position: link.position ?? 0,
      role: link.role ?? "primary",
      source: link.source ?? "creative",
    }));

    await this.query(
      `
        with targets as (
          select unnest($1::bigint[]) as creative_id
        ),
        deleted as (
          delete from tracker.creative_asset_links link
          using targets
          where link.creative_id = targets.creative_id
        ),
        input as (
          select *
          from jsonb_to_recordset($2::jsonb) as item(
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
      `,
      [[...creativeIds], jsonPayload(payload)],
    );
  }

  async linkAdsToCreatives(
    links: readonly AdCreativeLinkInput[],
  ): Promise<void> {
    if (links.length === 0) {
      return;
    }

    const payload = links.map((link) => ({
      ad_id: link.adId,
      creative_id: link.creativeId,
      relationship: link.relationship ?? "primary",
    }));

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
    const allowed = new Set(adIds);
    if (links.some((link) => !allowed.has(link.adId))) {
      throw new TypeError("Ad creative links exceed replacement scope.");
    }
    const payload = links.map((link) => ({
      ad_id: link.adId,
      creative_id: link.creativeId,
      relationship: link.relationship ?? "primary",
    }));

    await this.query(
      `
        with targets as (
          select unnest($1::bigint[]) as ad_id
        ),
        deleted as (
          delete from tracker.ad_creative_links link
          using targets
          where link.ad_id = targets.ad_id
        ),
        input as (
          select *
          from jsonb_to_recordset($2::jsonb) as item(
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
      `,
      [[...adIds], jsonPayload(payload)],
    );
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
            attribution_window
          ) do update set
            ad_account_id = excluded.ad_account_id,
            campaign_id = excluded.campaign_id,
            ad_set_id = excluded.ad_set_id,
            creative_id = excluded.creative_id,
            creative_asset_id = excluded.creative_asset_id,
            metric_scope = excluded.metric_scope,
            allocation_method = excluded.allocation_method,
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

    return this.database.begin(async (transaction) => {
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
      return transactionRepository.upsertDailyMetrics(input.metrics);
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
          order by is_active desc, name
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

  async listCampaignInventory(
    filters: CampaignInventoryFilters,
  ): Promise<CampaignInventoryPage> {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);
    const search = filters.search?.trim() || null;
    const status = filters.status?.trim() || null;
    const accountMetaId = filters.accountMetaId?.trim() || null;
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
        filtered as (
          select
            campaign.*,
            account.meta_ad_account_id,
            account.name as ad_account_name,
            coalesce(counts.ad_set_count, 0) as ad_set_count,
            coalesce(counts.ad_count, 0) as ad_count,
            coalesce(counts.creative_asset_count, 0)
              as creative_asset_count
          from tracker.meta_campaigns campaign
          join tracker.meta_ad_accounts account
            on account.ad_account_id = campaign.ad_account_id
          left join campaign_counts counts
            on counts.campaign_id = campaign.campaign_id
          where account.connection_id = $1
            and (
              $2::text is null
              or account.meta_ad_account_id = $2
            )
            and (
              $3::text is null
              or campaign.effective_status = $3
              or campaign.status = $3
            )
            and (
              $4::text is null
              or campaign.name ilike '%' || $4 || '%'
              or campaign.meta_campaign_id ilike '%' || $4 || '%'
              or account.name ilike '%' || $4 || '%'
            )
        )
        select filtered.*, count(*) over () as total_count
        from filtered
        order by
          filtered.is_active desc,
          filtered.last_seen_at desc,
          filtered.name
        limit $5
        offset $6
      `,
      [
        filters.connectionId,
        accountMetaId,
        status,
        search,
        limit,
        offset,
      ],
    );

    const items: CampaignInventoryItem[] = rows.map((row) => ({
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
      lastSeenAt: asIso(row.last_seen_at),
    }));

    return {
      items,
      total: rows[0] ? asNumber(rows[0].total_count) : 0,
      limit,
      offset,
    };
  }

  async listCreativeLibrary(
    filters: CreativeLibraryFilters,
  ): Promise<CreativeLibraryItem[]> {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);
    const rows = await this.query<DatabaseRow>(
      `
        select usage.*
        from tracker.creative_asset_usage usage
        where usage.connection_id = $1
          and ($2::text is null or usage.asset_type = $2)
          and (
            $3::text is null
            or usage.name ilike '%' || $3 || '%'
            or usage.asset_key ilike '%' || $3 || '%'
            or usage.meta_video_id ilike '%' || $3 || '%'
            or usage.meta_image_hash ilike '%' || $3 || '%'
            or array_to_string(usage.creative_codes, ' ') ilike '%' || $3 || '%'
          )
        order by usage.last_used_at desc nulls last, usage.last_seen_at desc
        limit $4
        offset $5
      `,
      [
        filters.connectionId,
        filters.assetType ?? null,
        filters.search?.trim() || null,
        limit,
        offset,
      ],
    );

    return rows.map((row) => ({
      creativeAssetId: asId(row.creative_asset_id),
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
      adAccountCount: asNumber(row.ad_account_count),
      pageCount: asNumber(row.page_count),
      lastUsedAt: asNullableIso(row.last_used_at),
      lastSeenAt: asIso(row.last_seen_at),
    }));
  }

  async listCreativePerformance(
    filters: CreativePerformanceFilters,
  ): Promise<CreativePerformanceItem[]> {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
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
            and ($4::bigint is null or metric.ad_account_id = $4)
            and ($5::text is null or metric.currency = $5)
          group by
            metric.attributed_asset_id,
            metric.operating_system,
            metric.currency
        )
        select
          asset.creative_asset_id,
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
   * Account-wide delivery totals include exact asset rows, single-asset rows
   * and intentionally unallocated dynamic rows exactly once. This is the
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
          and ($4::bigint is null or metric.ad_account_id = $4)
          and ($5::text is null or metric.currency = $5)
        group by operating_system, metric.currency
        order by metric.currency, operating_system
      `,
      [
        filters.connectionId,
        filters.dateFrom,
        filters.dateTo,
        filters.adAccountId ?? null,
        filters.currency ?? null,
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

  async listCreativeTracker(
    filters: CreativeTrackerFilters,
  ): Promise<CreativeTrackerPage> {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);
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
              $4::text is null
              or account.meta_ad_account_id = $4
            )
            and (
              $5::text is null
              or campaign.meta_campaign_id = $5
            )
            and ($6::text is null or metric.currency = $6)
            and (
              $7::text is null
              or asset.asset_type = $7
              or (
                $7 = 'unallocated'
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
            $8::text is null
            or creative_code ilike '%' || $8 || '%'
            or ad_name ilike '%' || $8 || '%'
            or campaign_name ilike '%' || $8 || '%'
            or ad_account_name ilike '%' || $8 || '%'
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
        limit $9
        offset $10
      `,
      [
        filters.connectionId,
        filters.dateFrom,
        filters.dateTo,
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
          started_at = coalesce(started_at, now()),
          current_stage = $2,
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
}

export async function createTrackerRepository(): Promise<TrackerRepository> {
  return new TrackerRepository(await getDatabase());
}

export async function createOptionalTrackerRepository(): Promise<TrackerRepository | null> {
  const database = await getOptionalDatabase();
  return database ? new TrackerRepository(database) : null;
}
