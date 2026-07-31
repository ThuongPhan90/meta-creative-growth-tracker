create table if not exists tracker.action_metric_daily (
  action_metric_daily_id bigint generated always as identity primary key,
  metric_date date not null,
  ad_account_id bigint not null
    references tracker.meta_ad_accounts(ad_account_id) on delete cascade,
  campaign_id bigint not null
    references tracker.meta_campaigns(campaign_id) on delete cascade,
  ad_id bigint not null
    references tracker.meta_ads(ad_id) on delete cascade,
  owner_id smallint not null default 1,
  canonical_result_key text not null,
  attribution_window text not null default 'account_default',
  action_report_time text not null default 'mixed',
  currency text not null,
  value numeric(24, 6) not null default 0,
  selected_action_types text[] not null default '{}'::text[],
  sync_version text not null,
  result_mapping_version text not null,
  fetched_at timestamptz not null default now(),
  constraint action_metric_daily_natural_key_unique unique (
    ad_id,
    metric_date,
    canonical_result_key,
    attribution_window,
    action_report_time
  ),
  constraint action_metric_daily_definition_fk
    foreign key (owner_id, canonical_result_key)
    references tracker.result_definitions(owner_id, canonical_key),
  constraint action_metric_daily_result_key_check
    check (
      canonical_result_key ~ '^[a-z0-9][a-z0-9._-]*$'
    ),
  constraint action_metric_daily_action_report_time_check
    check (
      action_report_time in ('impression', 'conversion', 'mixed')
    ),
  constraint action_metric_daily_currency_check
    check (length(trim(currency)) > 0),
  constraint action_metric_daily_value_check check (value >= 0),
  constraint action_metric_daily_selected_actions_check
    check (cardinality(selected_action_types) > 0),
  constraint action_metric_daily_sync_version_check
    check (length(trim(sync_version)) > 0),
  constraint action_metric_daily_result_mapping_version_check
    check (length(trim(result_mapping_version)) > 0)
);

create table if not exists tracker.action_value_daily (
  action_value_daily_id bigint generated always as identity primary key,
  metric_date date not null,
  ad_account_id bigint not null
    references tracker.meta_ad_accounts(ad_account_id) on delete cascade,
  campaign_id bigint not null
    references tracker.meta_campaigns(campaign_id) on delete cascade,
  ad_id bigint not null
    references tracker.meta_ads(ad_id) on delete cascade,
  owner_id smallint not null default 1,
  canonical_result_key text not null,
  attribution_window text not null default 'account_default',
  action_report_time text not null default 'mixed',
  currency text not null,
  value numeric(24, 6) not null default 0,
  selected_action_types text[] not null default '{}'::text[],
  sync_version text not null,
  result_mapping_version text not null,
  fetched_at timestamptz not null default now(),
  constraint action_value_daily_natural_key_unique unique (
    ad_id,
    metric_date,
    canonical_result_key,
    attribution_window,
    action_report_time
  ),
  constraint action_value_daily_definition_fk
    foreign key (owner_id, canonical_result_key)
    references tracker.result_definitions(owner_id, canonical_key),
  constraint action_value_daily_result_key_check
    check (
      canonical_result_key ~ '^[a-z0-9][a-z0-9._-]*$'
    ),
  constraint action_value_daily_action_report_time_check
    check (
      action_report_time in ('impression', 'conversion', 'mixed')
    ),
  constraint action_value_daily_currency_check
    check (length(trim(currency)) > 0),
  constraint action_value_daily_value_check check (value >= 0),
  constraint action_value_daily_selected_actions_check
    check (cardinality(selected_action_types) > 0),
  constraint action_value_daily_sync_version_check
    check (length(trim(sync_version)) > 0),
  constraint action_value_daily_result_mapping_version_check
    check (length(trim(result_mapping_version)) > 0)
);

alter table tracker.reporting_snapshots
  add column if not exists result_mapping_version text
    not null default 'legacy-unversioned';

alter table tracker.reporting_snapshots
  add column if not exists normalized_results_require_resync boolean
    not null default true;

alter table tracker.reporting_snapshots
  add column if not exists result_mapping_invalidated_at timestamptz;

alter table tracker.reporting_snapshots
  drop constraint if exists
    reporting_snapshots_result_mapping_version_nonempty;

alter table tracker.reporting_snapshots
  add constraint reporting_snapshots_result_mapping_version_nonempty
  check (length(trim(result_mapping_version)) > 0);

create index if not exists action_metric_daily_account_date_idx
  on tracker.action_metric_daily (ad_account_id, metric_date);

create index if not exists action_metric_daily_campaign_date_idx
  on tracker.action_metric_daily (campaign_id, metric_date);

create index if not exists action_metric_daily_definition_idx
  on tracker.action_metric_daily (owner_id, canonical_result_key);

create index if not exists action_value_daily_account_date_idx
  on tracker.action_value_daily (ad_account_id, metric_date);

create index if not exists action_value_daily_campaign_date_idx
  on tracker.action_value_daily (campaign_id, metric_date);

create index if not exists action_value_daily_definition_idx
  on tracker.action_value_daily (owner_id, canonical_result_key);

comment on table tracker.action_metric_daily is
  'Canonical Meta-attributed count facts. Ordered aliases are resolved before storage so omni and specific aliases are never added together.';

comment on table tracker.action_value_daily is
  'Canonical Meta-attributed monetary facts, isolated by the source account currency and published with the reporting sync version.';

comment on column tracker.reporting_snapshots.result_mapping_version is
  'Mapping hash used to materialize the normalized result facts currently referenced by this reporting snapshot.';

comment on column tracker.reporting_snapshots.normalized_results_require_resync is
  'True after result mappings change and cleared only by an atomic Insights publish using the current mapping hash.';

comment on column tracker.reporting_snapshots.result_mapping_invalidated_at is
  'When the current normalized result snapshot became unavailable because the owner changed result mappings.';
