create table if not exists tracker.period_reach_snapshots (
  period_reach_snapshot_id bigint generated always as identity
    primary key,
  connection_id bigint not null
    references tracker.meta_connections(connection_id) on delete cascade,
  ad_account_id bigint not null
    references tracker.meta_ad_accounts(ad_account_id) on delete cascade,
  campaign_id bigint
    references tracker.meta_campaigns(campaign_id) on delete cascade,
  scope_level text not null,
  date_from date not null,
  date_to date not null,
  attribution_window text not null default 'account_default',
  action_report_time text not null default 'mixed',
  sync_version text not null,
  reach numeric(24, 0) not null,
  fetched_at timestamptz not null default now(),
  constraint period_reach_snapshots_scope_check
    check (
      (scope_level = 'account' and campaign_id is null)
      or (scope_level = 'campaign' and campaign_id is not null)
    ),
  constraint period_reach_snapshots_date_order_check
    check (date_from <= date_to),
  constraint period_reach_snapshots_attribution_check
    check (length(trim(attribution_window)) > 0),
  constraint period_reach_snapshots_action_report_time_check
    check (
      action_report_time in ('impression', 'conversion', 'mixed')
    ),
  constraint period_reach_snapshots_sync_version_check
    check (length(trim(sync_version)) > 0),
  constraint period_reach_snapshots_reach_check
    check (reach >= 0)
);

create unique index if not exists
  period_reach_snapshots_account_natural_unique_idx
  on tracker.period_reach_snapshots (
    connection_id,
    ad_account_id,
    date_from,
    date_to,
    attribution_window,
    action_report_time,
    sync_version
  )
  where scope_level = 'account';

create unique index if not exists
  period_reach_snapshots_campaign_natural_unique_idx
  on tracker.period_reach_snapshots (
    connection_id,
    ad_account_id,
    campaign_id,
    date_from,
    date_to,
    attribution_window,
    action_report_time,
    sync_version
  )
  where scope_level = 'campaign';

create index if not exists period_reach_snapshots_context_idx
  on tracker.period_reach_snapshots (
    connection_id,
    date_from,
    date_to,
    attribution_window,
    action_report_time,
    sync_version
  );

comment on table tracker.period_reach_snapshots is
  'Exact-period Meta Reach snapshots. Reach is never derived by summing daily or overlapping account/campaign rows.';
