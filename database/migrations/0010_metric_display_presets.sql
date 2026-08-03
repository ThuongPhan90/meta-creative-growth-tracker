-- V6 controlled KPI preferences. This is deliberately one owner-scoped JSONB
-- column rather than a dashboard-builder table: presets are only keyed by
-- Objective + Primary Result and contain no account, campaign or date scope.
alter table tracker.app_settings
  add column if not exists metric_display_presets jsonb
  not null default '{"version":1,"presets":{}}'::jsonb;

alter table tracker.app_settings
  alter column metric_display_presets
  set default '{"version":1,"presets":{}}'::jsonb;

-- Do not normalize existing preferences here. A malformed value must block the
-- migration visibly rather than being overwritten without an owner decision.
-- New rows receive the valid default above; read-time sanitization keeps an
-- old, malformed value from being rendered as an arbitrary metric preset.

alter table tracker.app_settings
  alter column metric_display_presets
  set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_settings_metric_display_presets_shape_check'
      and conrelid = 'tracker.app_settings'::regclass
  ) then
    alter table tracker.app_settings
      add constraint app_settings_metric_display_presets_shape_check
      check (
        jsonb_typeof(metric_display_presets) = 'object'
        and metric_display_presets ->> 'version' = '1'
        and jsonb_typeof(metric_display_presets -> 'presets') = 'object'
      );
  end if;
end $$;

comment on column tracker.app_settings.metric_display_presets is
  'Versioned V6 controlled display-metric presets keyed only by Objective + Primary Result.';
