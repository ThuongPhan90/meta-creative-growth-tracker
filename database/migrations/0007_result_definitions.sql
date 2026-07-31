create table if not exists tracker.result_definitions (
  result_definition_id bigint generated always as identity primary key,
  owner_id smallint not null
    references tracker.app_owners(owner_id) on delete cascade,
  canonical_key text not null,
  label text not null,
  short_label text not null,
  objective_keys text[] not null default '{}'::text[],
  raw_action_types text[] not null default '{}'::text[],
  raw_value_action_types text[] not null default '{}'::text[],
  unit text not null,
  efficiency_metric text not null,
  direction text not null,
  default_for_objective boolean not null default false,
  minimum_results integer not null default 5,
  minimum_impressions integer not null default 1000,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint result_definitions_owner_key_unique
    unique (owner_id, canonical_key),
  constraint result_definitions_owner_id_unique
    unique (owner_id, result_definition_id),
  constraint result_definitions_key_check
    check (canonical_key ~ '^[a-z0-9][a-z0-9._-]*$'),
  constraint result_definitions_unit_check
    check (unit in ('count', 'currency', 'percent', 'duration')),
  constraint result_definitions_efficiency_check
    check (
      efficiency_metric in (
        'cost_per_result',
        'rate',
        'roas',
        'none'
      )
    ),
  constraint result_definitions_direction_check
    check (direction in ('lower_is_better', 'higher_is_better')),
  constraint result_definitions_thresholds_check
    check (minimum_results >= 0 and minimum_impressions >= 0)
);

create table if not exists tracker.result_mappings (
  result_mapping_id bigint generated always as identity primary key,
  owner_id smallint not null,
  result_definition_id bigint not null,
  raw_action_type text not null,
  metric_source text not null default 'action',
  priority integer not null default 100,
  mapping_source text not null default 'system',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint result_mappings_definition_fk
    foreign key (owner_id, result_definition_id)
    references tracker.result_definitions(
      owner_id,
      result_definition_id
    )
    on delete cascade,
  constraint result_mappings_owner_source_action_unique
    unique (owner_id, metric_source, raw_action_type),
  constraint result_mappings_definition_priority_unique
    unique (result_definition_id, metric_source, priority),
  constraint result_mappings_action_type_check
    check (raw_action_type ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
  constraint result_mappings_metric_source_check
    check (metric_source in ('action', 'action_value')),
  constraint result_mappings_mapping_source_check
    check (mapping_source in ('system', 'owner')),
  constraint result_mappings_priority_check check (priority >= 0)
);

create table if not exists tracker.campaign_result_overrides (
  campaign_result_override_id bigint
    generated always as identity primary key,
  owner_id smallint not null,
  campaign_id bigint not null
    references tracker.meta_campaigns(campaign_id) on delete cascade,
  result_definition_id bigint not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_result_overrides_definition_fk
    foreign key (owner_id, result_definition_id)
    references tracker.result_definitions(
      owner_id,
      result_definition_id
    )
    on delete cascade,
  constraint campaign_result_overrides_owner_campaign_unique
    unique (owner_id, campaign_id)
);

create unique index if not exists
  result_definitions_owner_objective_default_unique_idx
  on tracker.result_definitions (owner_id, (objective_keys[1]))
  where enabled and default_for_objective
    and cardinality(objective_keys) = 1;

create index if not exists result_mappings_definition_priority_idx
  on tracker.result_mappings (
    result_definition_id,
    metric_source,
    priority
  )
  where enabled;

drop trigger if exists result_definitions_set_updated_at
  on tracker.result_definitions;
create trigger result_definitions_set_updated_at
before update on tracker.result_definitions
for each row execute function tracker.set_updated_at();

drop trigger if exists result_mappings_set_updated_at
  on tracker.result_mappings;
create trigger result_mappings_set_updated_at
before update on tracker.result_mappings
for each row execute function tracker.set_updated_at();

drop trigger if exists campaign_result_overrides_set_updated_at
  on tracker.campaign_result_overrides;
create trigger campaign_result_overrides_set_updated_at
before update on tracker.campaign_result_overrides
for each row execute function tracker.set_updated_at();

insert into tracker.result_definitions (
  owner_id,
  canonical_key,
  label,
  short_label,
  objective_keys,
  raw_action_types,
  raw_value_action_types,
  unit,
  efficiency_metric,
  direction,
  default_for_objective,
  minimum_results,
  minimum_impressions,
  enabled
)
values
  (
    1, 'reach', 'Reach', 'Reach', array['awareness'],
    array['reach'], '{}', 'count', 'none', 'higher_is_better',
    true, 0, 1000, true
  ),
  (
    1, 'impressions', 'Impressions', 'Impr.', array['awareness'],
    array['impressions'], '{}', 'count', 'none', 'higher_is_better',
    false, 0, 1000, true
  ),
  (
    1, 'thruplay', 'ThruPlay', 'ThruPlay',
    array['awareness', 'engagement'],
    array['video_thruplay_watched_actions', 'thruplay'],
    '{}', 'count', 'cost_per_result', 'lower_is_better',
    false, 5, 1000, true
  ),
  (
    1, 'link_click', 'Link Click', 'Click', array['traffic'],
    array['link_click'], '{}', 'count', 'cost_per_result',
    'lower_is_better', true, 5, 1000, true
  ),
  (
    1, 'outbound_click', 'Outbound Click', 'Outbound',
    array['traffic'], array['outbound_click'], '{}', 'count',
    'cost_per_result', 'lower_is_better', false, 5, 1000, true
  ),
  (
    1, 'landing_page_view', 'Landing Page View', 'LPV',
    array['traffic'], array['landing_page_view'], '{}', 'count',
    'cost_per_result', 'lower_is_better', false, 5, 1000, true
  ),
  (
    1, 'post_engagement', 'Post Engagement', 'Engagement',
    array['engagement'], array['post_engagement'], '{}', 'count',
    'cost_per_result', 'lower_is_better', true, 5, 1000, true
  ),
  (
    1, 'messaging_conversation', 'Messaging Conversation',
    'Conversation', array['engagement', 'leads'],
    array[
      'onsite_conversion.messaging_conversation_started_7d',
      'messaging_conversation_started_7d'
    ],
    '{}', 'count', 'cost_per_result', 'lower_is_better',
    false, 5, 1000, true
  ),
  (
    1, 'lead', 'Meta-attributed Lead', 'Lead', array['leads'],
    array[
      'onsite_conversion.lead_grouped',
      'lead',
      'offsite_conversion.fb_pixel_lead'
    ],
    '{}', 'count', 'cost_per_result', 'lower_is_better',
    true, 5, 1000, true
  ),
  (
    1, 'install', 'Meta-attributed Install', 'Install',
    array['app_promotion'],
    array['mobile_app_install', 'omni_app_install', 'app_install'],
    '{}', 'count', 'cost_per_result', 'lower_is_better',
    true, 5, 1000, true
  ),
  (
    1, 'complete_registration', 'Meta-attributed Registration',
    'Registration', array['leads', 'app_promotion'],
    array[
      'complete_registration',
      'omni_complete_registration',
      'mobile_app_complete_registration'
    ],
    '{}', 'count', 'cost_per_result', 'lower_is_better',
    false, 5, 1000, true
  ),
  (
    1, 'purchase', 'Meta-attributed Purchase', 'Purchase',
    array['sales'],
    array[
      'purchase',
      'omni_purchase',
      'offsite_conversion.fb_pixel_purchase',
      'mobile_app_purchase'
    ],
    '{}', 'count', 'cost_per_result', 'lower_is_better',
    true, 5, 1000, true
  ),
  (
    1, 'purchase_value', 'Meta-attributed Purchase Value', 'Value',
    array['sales'], '{}',
    array[
      'purchase',
      'omni_purchase',
      'offsite_conversion.fb_pixel_purchase',
      'mobile_app_purchase'
    ],
    'currency', 'roas', 'higher_is_better',
    false, 5, 1000, true
  )
on conflict (owner_id, canonical_key) do nothing;

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
  alias.raw_action_type,
  'action',
  alias.ordinality - 1,
  'system',
  true
from tracker.result_definitions definition
cross join lateral unnest(definition.raw_action_types)
  with ordinality as alias(raw_action_type, ordinality)
where definition.owner_id = 1
on conflict (owner_id, metric_source, raw_action_type) do nothing;

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
  alias.raw_action_type,
  'action_value',
  alias.ordinality - 1,
  'system',
  true
from tracker.result_definitions definition
cross join lateral unnest(definition.raw_value_action_types)
  with ordinality as alias(raw_action_type, ordinality)
where definition.owner_id = 1
on conflict (owner_id, metric_source, raw_action_type) do nothing;

comment on table tracker.result_definitions is
  'Owner-controlled canonical Meta-attributed result definitions. No result is a universal default.';

comment on table tracker.result_mappings is
  'Ordered first-match raw action aliases. Unique ownership prevents one raw action from being counted under multiple canonical results.';

comment on table tracker.campaign_result_overrides is
  'Read-only reporting override for a campaign primary result; never mutates Meta.';
