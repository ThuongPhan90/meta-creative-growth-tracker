alter table tracker.daily_metrics
  add column if not exists action_report_time text not null default 'mixed',
  add column if not exists sync_version text not null default 'legacy';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'daily_metrics_action_report_time_check'
      and conrelid = 'tracker.daily_metrics'::regclass
  ) then
    alter table tracker.daily_metrics
      add constraint daily_metrics_action_report_time_check
      check (action_report_time in ('impression', 'conversion', 'mixed'));
  end if;
end
$$;

alter table tracker.daily_metrics
  drop constraint if exists daily_metrics_natural_key_unique;

alter table tracker.daily_metrics
  add constraint daily_metrics_natural_key_unique unique (
    metric_date,
    ad_id,
    scope_key,
    country,
    publisher_platform,
    platform_position,
    impression_device,
    attribution_window,
    action_report_time
  );

create table if not exists tracker.reporting_snapshots (
  connection_id bigint primary key
    references tracker.meta_connections(connection_id) on delete cascade,
  sync_run_id bigint not null
    references tracker.sync_runs(sync_run_id) on delete cascade,
  sync_version text not null,
  window_start date,
  window_end date,
  data_through_at timestamptz,
  published_at timestamptz not null default now(),
  constraint reporting_snapshots_sync_version_nonempty
    check (length(trim(sync_version)) > 0),
  constraint reporting_snapshots_window_order
    check (
      window_start is null
      or window_end is null
      or window_start <= window_end
    )
);

create unique index if not exists reporting_snapshots_sync_run_unique_idx
  on tracker.reporting_snapshots(sync_run_id);

comment on table tracker.reporting_snapshots is
  'Atomic publish pointer for the currently visible reporting metric window.';

comment on column tracker.daily_metrics.sync_version is
  'Sync run version that last published this current metric row.';
