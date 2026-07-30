alter table tracker.app_settings
  add column if not exists number_format text not null default 'vi-VN',
  add column if not exists compare_default text not null default 'previous_period',
  add column if not exists minimum_registration_threshold integer not null default 10,
  add column if not exists benchmark_window_days integer not null default 30,
  add column if not exists benchmark_by_os boolean not null default true,
  add column if not exists benchmark_by_format boolean not null default true,
  add column if not exists scoring_weight_cpi integer not null default 40,
  add column if not exists scoring_weight_cpa integer not null default 40,
  add column if not exists scoring_weight_hook integer not null default 10,
  add column if not exists scoring_weight_hold integer not null default 10,
  add column if not exists sync_cadence text not null default 'deployment',
  add column if not exists alert_channel text not null default 'none';

alter table tracker.app_settings
  add constraint app_settings_number_format_check
    check (number_format in ('vi-VN', 'en-US')),
  add constraint app_settings_compare_default_check
    check (compare_default in ('previous_period', 'none')),
  add constraint app_settings_minimum_registration_check
    check (minimum_registration_threshold between 1 and 100000),
  add constraint app_settings_benchmark_window_check
    check (benchmark_window_days between 7 and 180),
  add constraint app_settings_scoring_weights_check
    check (
      scoring_weight_cpi between 0 and 100
      and scoring_weight_cpa between 0 and 100
      and scoring_weight_hook between 0 and 100
      and scoring_weight_hold between 0 and 100
      and scoring_weight_cpi
        + scoring_weight_cpa
        + scoring_weight_hook
        + scoring_weight_hold = 100
    ),
  add constraint app_settings_sync_cadence_check
    check (sync_cadence in ('deployment', 'manual')),
  add constraint app_settings_alert_channel_check
    check (alert_channel in ('none', 'email'));

create table if not exists tracker.settings_audit_log (
  settings_audit_id bigint generated always as identity primary key,
  owner_id smallint not null
    references tracker.app_owners(owner_id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by text not null default 'owner',
  before_state jsonb not null,
  after_state jsonb not null,
  constraint settings_audit_before_object_check
    check (jsonb_typeof(before_state) = 'object'),
  constraint settings_audit_after_object_check
    check (jsonb_typeof(after_state) = 'object')
);

create index if not exists settings_audit_owner_changed_idx
  on tracker.settings_audit_log (owner_id, changed_at desc);

comment on table tracker.settings_audit_log is
  'Owner-visible audit trail for local reporting settings. Never represents a write to Meta.';
