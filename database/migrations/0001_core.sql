create schema if not exists tracker;

create table if not exists tracker.schema_migrations (
  migration_id text primary key,
  checksum_sha256 text not null,
  applied_at timestamptz not null default now()
);

create or replace function tracker.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists tracker.app_owners (
  owner_id smallint primary key default 1,
  display_name text not null default 'Owner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_owners_singleton_check check (owner_id = 1)
);

create table if not exists tracker.app_settings (
  owner_id smallint primary key
    references tracker.app_owners(owner_id) on delete cascade,
  reporting_timezone text not null default 'Asia/Ho_Chi_Minh',
  reporting_currency text,
  sync_lookback_days integer not null default 30,
  minimum_install_threshold integer not null default 20,
  benchmark_mode text not null default 'os',
  install_action_types text[] not null default array[
    'mobile_app_install',
    'omni_app_install',
    'app_install'
  ],
  registration_action_types text[] not null default array[
    'complete_registration',
    'omni_complete_registration',
    'mobile_app_complete_registration'
  ],
  last_initial_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_settings_lookback_check
    check (sync_lookback_days between 1 and 365),
  constraint app_settings_minimum_installs_check
    check (minimum_install_threshold >= 1),
  constraint app_settings_benchmark_mode_check
    check (benchmark_mode in ('os', 'account_os_event', 'custom'))
);

insert into tracker.app_owners (owner_id, display_name)
values (1, 'Owner')
on conflict (owner_id) do nothing;

insert into tracker.app_settings (owner_id)
values (1)
on conflict (owner_id) do nothing;

create table if not exists tracker.meta_connections (
  connection_id bigint generated always as identity primary key,
  owner_id smallint not null
    references tracker.app_owners(owner_id) on delete cascade,
  meta_user_id text not null,
  meta_user_name text,
  encrypted_access_token text not null,
  granted_scopes text[] not null default '{}',
  declined_scopes text[] not null default '{}',
  token_expires_at timestamptz,
  data_access_expires_at timestamptz,
  status text not null default 'connected',
  last_validated_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_connections_owner_unique unique (owner_id),
  constraint meta_connections_user_unique unique (meta_user_id),
  constraint meta_connections_status_check
    check (status in ('pending', 'connected', 'needs_reauth', 'revoked', 'error'))
);

comment on column tracker.meta_connections.encrypted_access_token is
  'Opaque versioned encryption envelope. Never store or log a plaintext Meta token.';

create table if not exists tracker.meta_businesses (
  business_id bigint generated always as identity primary key,
  connection_id bigint not null
    references tracker.meta_connections(connection_id) on delete cascade,
  meta_business_id text not null,
  name text not null,
  verification_status text,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_businesses_connection_meta_unique
    unique (connection_id, meta_business_id),
  constraint meta_businesses_payload_object_check
    check (jsonb_typeof(raw_payload) = 'object')
);

create table if not exists tracker.meta_ad_accounts (
  ad_account_id bigint generated always as identity primary key,
  connection_id bigint not null
    references tracker.meta_connections(connection_id) on delete cascade,
  meta_ad_account_id text not null,
  account_id text not null,
  name text not null,
  account_status integer,
  disable_reason integer,
  currency text not null,
  timezone_name text not null,
  timezone_offset_hours_utc numeric(6,2),
  business_name text,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_ad_accounts_connection_meta_unique
    unique (connection_id, meta_ad_account_id),
  constraint meta_ad_accounts_connection_account_unique
    unique (connection_id, account_id),
  constraint meta_ad_accounts_payload_object_check
    check (jsonb_typeof(raw_payload) = 'object')
);

create table if not exists tracker.meta_pages (
  page_id bigint generated always as identity primary key,
  connection_id bigint not null
    references tracker.meta_connections(connection_id) on delete cascade,
  meta_page_id text not null,
  name text not null,
  category text,
  picture_url text,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_pages_connection_meta_unique
    unique (connection_id, meta_page_id),
  constraint meta_pages_payload_object_check
    check (jsonb_typeof(raw_payload) = 'object')
);

create table if not exists tracker.meta_apps (
  app_id bigint generated always as identity primary key,
  connection_id bigint not null
    references tracker.meta_connections(connection_id) on delete cascade,
  meta_app_id text not null,
  name text not null,
  namespace text,
  platform text not null default 'unknown',
  store_url text,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_apps_connection_meta_unique
    unique (connection_id, meta_app_id),
  constraint meta_apps_platform_check
    check (platform in ('android', 'ios', 'both', 'unknown')),
  constraint meta_apps_payload_object_check
    check (jsonb_typeof(raw_payload) = 'object')
);

create table if not exists tracker.business_ad_accounts (
  business_id bigint not null
    references tracker.meta_businesses(business_id) on delete cascade,
  ad_account_id bigint not null
    references tracker.meta_ad_accounts(ad_account_id) on delete cascade,
  relationship text not null default 'accessible',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (business_id, ad_account_id)
);

create table if not exists tracker.business_pages (
  business_id bigint not null
    references tracker.meta_businesses(business_id) on delete cascade,
  page_id bigint not null
    references tracker.meta_pages(page_id) on delete cascade,
  relationship text not null default 'accessible',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (business_id, page_id)
);

create table if not exists tracker.business_apps (
  business_id bigint not null
    references tracker.meta_businesses(business_id) on delete cascade,
  app_id bigint not null
    references tracker.meta_apps(app_id) on delete cascade,
  relationship text not null default 'accessible',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (business_id, app_id)
);

create table if not exists tracker.meta_campaigns (
  campaign_id bigint generated always as identity primary key,
  ad_account_id bigint not null
    references tracker.meta_ad_accounts(ad_account_id) on delete cascade,
  meta_campaign_id text not null,
  name text not null,
  objective text,
  status text,
  effective_status text,
  buying_type text,
  start_time timestamptz,
  stop_time timestamptz,
  meta_created_time timestamptz,
  meta_updated_time timestamptz,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_campaigns_account_meta_unique
    unique (ad_account_id, meta_campaign_id),
  constraint meta_campaigns_payload_object_check
    check (jsonb_typeof(raw_payload) = 'object')
);

create table if not exists tracker.meta_ad_sets (
  ad_set_id bigint generated always as identity primary key,
  ad_account_id bigint not null
    references tracker.meta_ad_accounts(ad_account_id) on delete cascade,
  campaign_id bigint not null
    references tracker.meta_campaigns(campaign_id) on delete cascade,
  meta_ad_set_id text not null,
  name text not null,
  status text,
  effective_status text,
  optimization_goal text,
  billing_event text,
  promoted_object jsonb not null default '{}'::jsonb,
  start_time timestamptz,
  end_time timestamptz,
  meta_created_time timestamptz,
  meta_updated_time timestamptz,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_ad_sets_account_meta_unique
    unique (ad_account_id, meta_ad_set_id),
  constraint meta_ad_sets_promoted_object_check
    check (jsonb_typeof(promoted_object) = 'object'),
  constraint meta_ad_sets_payload_object_check
    check (jsonb_typeof(raw_payload) = 'object')
);

create table if not exists tracker.meta_creatives (
  creative_id bigint generated always as identity primary key,
  connection_id bigint not null
    references tracker.meta_connections(connection_id) on delete cascade,
  page_id bigint
    references tracker.meta_pages(page_id) on delete set null,
  meta_creative_id text not null,
  name text,
  creative_code text,
  creative_format text not null default 'unknown',
  object_story_id text,
  effective_object_story_id text,
  thumbnail_url text,
  preview_url text,
  meta_created_time timestamptz,
  meta_updated_time timestamptz,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_creatives_connection_meta_unique
    unique (connection_id, meta_creative_id),
  constraint meta_creatives_format_check
    check (creative_format in ('video', 'image', 'carousel', 'dynamic', 'unknown')),
  constraint meta_creatives_payload_object_check
    check (jsonb_typeof(raw_payload) = 'object')
);

create table if not exists tracker.meta_ads (
  ad_id bigint generated always as identity primary key,
  ad_account_id bigint not null
    references tracker.meta_ad_accounts(ad_account_id) on delete cascade,
  campaign_id bigint not null
    references tracker.meta_campaigns(campaign_id) on delete cascade,
  ad_set_id bigint not null
    references tracker.meta_ad_sets(ad_set_id) on delete cascade,
  meta_ad_id text not null,
  name text not null,
  creative_code text,
  status text,
  effective_status text,
  meta_created_time timestamptz,
  meta_updated_time timestamptz,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_ads_account_meta_unique unique (ad_account_id, meta_ad_id),
  constraint meta_ads_payload_object_check
    check (jsonb_typeof(raw_payload) = 'object')
);

create table if not exists tracker.creative_assets (
  creative_asset_id bigint generated always as identity primary key,
  connection_id bigint not null
    references tracker.meta_connections(connection_id) on delete cascade,
  asset_key text not null,
  asset_type text not null,
  meta_video_id text,
  meta_image_hash text,
  name text,
  thumbnail_url text,
  preview_url text,
  width integer,
  height integer,
  duration_seconds numeric(12,3),
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creative_assets_connection_key_unique
    unique (connection_id, asset_key),
  constraint creative_assets_type_check
    check (asset_type in ('video', 'image', 'unknown')),
  constraint creative_assets_identity_check check (
    (asset_type = 'video' and meta_video_id is not null)
    or (asset_type = 'image' and meta_image_hash is not null)
    or (asset_type = 'unknown')
  ),
  constraint creative_assets_dimensions_check
    check (
      (width is null or width > 0)
      and (height is null or height > 0)
      and (duration_seconds is null or duration_seconds >= 0)
    ),
  constraint creative_assets_payload_object_check
    check (jsonb_typeof(raw_payload) = 'object')
);

comment on column tracker.creative_assets.asset_key is
  'Canonical identity: video:<video_id>, image:<image_hash>, or unknown:<stable_id>. Names are aliases only.';

create table if not exists tracker.creative_asset_links (
  creative_id bigint not null
    references tracker.meta_creatives(creative_id) on delete cascade,
  creative_asset_id bigint not null
    references tracker.creative_assets(creative_asset_id) on delete cascade,
  position integer not null default 0,
  role text not null default 'primary',
  source text not null default 'creative',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (creative_id, creative_asset_id, position, role),
  constraint creative_asset_links_position_check check (position >= 0)
);

create table if not exists tracker.ad_creative_links (
  ad_id bigint not null
    references tracker.meta_ads(ad_id) on delete cascade,
  creative_id bigint not null
    references tracker.meta_creatives(creative_id) on delete cascade,
  relationship text not null default 'primary',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (ad_id, creative_id)
);

create table if not exists tracker.daily_metrics (
  daily_metric_id bigint generated always as identity primary key,
  metric_date date not null,
  ad_account_id bigint not null
    references tracker.meta_ad_accounts(ad_account_id) on delete cascade,
  campaign_id bigint not null
    references tracker.meta_campaigns(campaign_id) on delete cascade,
  ad_set_id bigint not null
    references tracker.meta_ad_sets(ad_set_id) on delete cascade,
  ad_id bigint not null
    references tracker.meta_ads(ad_id) on delete cascade,
  creative_id bigint
    references tracker.meta_creatives(creative_id) on delete set null,
  creative_asset_id bigint
    references tracker.creative_assets(creative_asset_id) on delete set null,
  metric_scope text not null default 'ad',
  scope_key text not null,
  allocation_method text not null default 'unallocated',
  country text not null default 'ALL',
  publisher_platform text not null default 'ALL',
  platform_position text not null default 'ALL',
  impression_device text not null default 'ALL',
  attribution_window text not null default 'account_default',
  account_timezone text not null,
  currency text not null,
  spend numeric(20,6) not null default 0,
  impressions bigint not null default 0,
  reported_reach bigint not null default 0,
  link_clicks bigint not null default 0,
  installs numeric(20,6) not null default 0,
  registrations numeric(20,6) not null default 0,
  purchases numeric(20,6) not null default 0,
  purchase_value numeric(20,6) not null default 0,
  video_3s_views numeric(20,6) not null default 0,
  video_100_views numeric(20,6) not null default 0,
  raw_actions jsonb not null default '[]'::jsonb,
  raw_action_values jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  action_mapping_version text not null default 'default',
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_metrics_natural_key_unique unique (
    metric_date,
    ad_id,
    scope_key,
    country,
    publisher_platform,
    platform_position,
    impression_device,
    attribution_window
  ),
  constraint daily_metrics_scope_check
    check (metric_scope in ('ad', 'creative', 'asset')),
  constraint daily_metrics_allocation_check
    check (allocation_method in ('exact', 'single_asset', 'unallocated')),
  constraint daily_metrics_nonnegative_check check (
    spend >= 0
    and impressions >= 0
    and reported_reach >= 0
    and link_clicks >= 0
    and installs >= 0
    and registrations >= 0
    and purchases >= 0
    and purchase_value >= 0
    and video_3s_views >= 0
    and video_100_views >= 0
  ),
  constraint daily_metrics_actions_array_check
    check (jsonb_typeof(raw_actions) = 'array'),
  constraint daily_metrics_action_values_array_check
    check (jsonb_typeof(raw_action_values) = 'array'),
  constraint daily_metrics_payload_object_check
    check (jsonb_typeof(raw_payload) = 'object')
);

comment on column tracker.daily_metrics.reported_reach is
  'Reach reported at this exact row granularity. Do not sum across dates and label it exact unique reach.';

comment on column tracker.daily_metrics.allocation_method is
  'exact = Meta asset/creative breakdown; single_asset = safe one-asset attribution; unallocated = never duplicate dynamic-ad totals across assets.';

create table if not exists tracker.sync_runs (
  sync_run_id bigint generated always as identity primary key,
  connection_id bigint not null
    references tracker.meta_connections(connection_id) on delete cascade,
  request_key text,
  sync_kind text not null,
  trigger_source text not null default 'manual',
  status text not null default 'queued',
  window_start date,
  window_end date,
  started_at timestamptz,
  finished_at timestamptz,
  current_stage text,
  cursor_state jsonb not null default '{}'::jsonb,
  progress jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sync_runs_request_key_unique unique (connection_id, request_key),
  constraint sync_runs_kind_check
    check (sync_kind in ('full', 'assets', 'insights', 'incremental')),
  constraint sync_runs_trigger_check
    check (trigger_source in ('manual', 'cron', 'setup', 'retry', 'system')),
  constraint sync_runs_status_check
    check (status in ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled')),
  constraint sync_runs_window_check
    check (window_start is null or window_end is null or window_start <= window_end),
  constraint sync_runs_cursor_object_check
    check (jsonb_typeof(cursor_state) = 'object'),
  constraint sync_runs_progress_object_check
    check (jsonb_typeof(progress) = 'object'),
  constraint sync_runs_stats_object_check
    check (jsonb_typeof(stats) = 'object')
);

create table if not exists tracker.sync_checkpoints (
  connection_id bigint not null
    references tracker.meta_connections(connection_id) on delete cascade,
  resource_key text not null,
  cursor_state jsonb not null default '{}'::jsonb,
  high_water_mark timestamptz,
  last_successful_sync_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (connection_id, resource_key),
  constraint sync_checkpoints_cursor_object_check
    check (jsonb_typeof(cursor_state) = 'object')
);

drop trigger if exists app_owners_set_updated_at on tracker.app_owners;
create trigger app_owners_set_updated_at
before update on tracker.app_owners
for each row execute function tracker.set_updated_at();

drop trigger if exists app_settings_set_updated_at on tracker.app_settings;
create trigger app_settings_set_updated_at
before update on tracker.app_settings
for each row execute function tracker.set_updated_at();

drop trigger if exists meta_connections_set_updated_at on tracker.meta_connections;
create trigger meta_connections_set_updated_at
before update on tracker.meta_connections
for each row execute function tracker.set_updated_at();

drop trigger if exists meta_businesses_set_updated_at on tracker.meta_businesses;
create trigger meta_businesses_set_updated_at
before update on tracker.meta_businesses
for each row execute function tracker.set_updated_at();

drop trigger if exists meta_ad_accounts_set_updated_at on tracker.meta_ad_accounts;
create trigger meta_ad_accounts_set_updated_at
before update on tracker.meta_ad_accounts
for each row execute function tracker.set_updated_at();

drop trigger if exists meta_pages_set_updated_at on tracker.meta_pages;
create trigger meta_pages_set_updated_at
before update on tracker.meta_pages
for each row execute function tracker.set_updated_at();

drop trigger if exists meta_apps_set_updated_at on tracker.meta_apps;
create trigger meta_apps_set_updated_at
before update on tracker.meta_apps
for each row execute function tracker.set_updated_at();

drop trigger if exists meta_campaigns_set_updated_at on tracker.meta_campaigns;
create trigger meta_campaigns_set_updated_at
before update on tracker.meta_campaigns
for each row execute function tracker.set_updated_at();

drop trigger if exists meta_ad_sets_set_updated_at on tracker.meta_ad_sets;
create trigger meta_ad_sets_set_updated_at
before update on tracker.meta_ad_sets
for each row execute function tracker.set_updated_at();

drop trigger if exists meta_creatives_set_updated_at on tracker.meta_creatives;
create trigger meta_creatives_set_updated_at
before update on tracker.meta_creatives
for each row execute function tracker.set_updated_at();

drop trigger if exists meta_ads_set_updated_at on tracker.meta_ads;
create trigger meta_ads_set_updated_at
before update on tracker.meta_ads
for each row execute function tracker.set_updated_at();

drop trigger if exists creative_assets_set_updated_at on tracker.creative_assets;
create trigger creative_assets_set_updated_at
before update on tracker.creative_assets
for each row execute function tracker.set_updated_at();

drop trigger if exists creative_asset_links_set_updated_at on tracker.creative_asset_links;
create trigger creative_asset_links_set_updated_at
before update on tracker.creative_asset_links
for each row execute function tracker.set_updated_at();

drop trigger if exists daily_metrics_set_updated_at on tracker.daily_metrics;
create trigger daily_metrics_set_updated_at
before update on tracker.daily_metrics
for each row execute function tracker.set_updated_at();

drop trigger if exists sync_runs_set_updated_at on tracker.sync_runs;
create trigger sync_runs_set_updated_at
before update on tracker.sync_runs
for each row execute function tracker.set_updated_at();
