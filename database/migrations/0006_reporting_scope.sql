create table if not exists tracker.reporting_scopes (
  connection_id bigint primary key
    references tracker.meta_connections(connection_id) on delete cascade,
  owner_id smallint not null unique
    references tracker.app_owners(owner_id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tracker.reporting_scope_business_members (
  connection_id bigint not null
    references tracker.reporting_scopes(connection_id) on delete cascade,
  meta_business_id text not null,
  created_at timestamptz not null default now(),
  primary key (connection_id, meta_business_id),
  foreign key (connection_id, meta_business_id)
    references tracker.meta_businesses(connection_id, meta_business_id)
    on delete cascade
);

create table if not exists tracker.reporting_scope_ad_account_members (
  connection_id bigint not null
    references tracker.reporting_scopes(connection_id) on delete cascade,
  meta_ad_account_id text not null,
  created_at timestamptz not null default now(),
  primary key (connection_id, meta_ad_account_id),
  foreign key (connection_id, meta_ad_account_id)
    references tracker.meta_ad_accounts(connection_id, meta_ad_account_id)
    on delete cascade
);

drop trigger if exists reporting_scopes_set_updated_at
  on tracker.reporting_scopes;
create trigger reporting_scopes_set_updated_at
before update on tracker.reporting_scopes
for each row execute function tracker.set_updated_at();

comment on table tracker.reporting_scopes is
  'Owner-confirmed reporting scope. A row with no members represents an explicit none selection.';

comment on table tracker.reporting_scope_business_members is
  'Business members explicitly included in the owner reporting scope.';

comment on table tracker.reporting_scope_ad_account_members is
  'Ad Account members explicitly included in the owner reporting scope, including accounts without a Business relation.';
