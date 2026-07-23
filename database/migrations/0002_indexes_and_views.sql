create index if not exists meta_businesses_connection_active_idx
  on tracker.meta_businesses (connection_id, is_active, name);

create index if not exists meta_ad_accounts_connection_active_idx
  on tracker.meta_ad_accounts (connection_id, is_active, name);

create index if not exists meta_pages_connection_active_idx
  on tracker.meta_pages (connection_id, is_active, name);

create index if not exists meta_apps_connection_active_idx
  on tracker.meta_apps (connection_id, is_active, name);

create index if not exists business_ad_accounts_account_idx
  on tracker.business_ad_accounts (ad_account_id);

create index if not exists business_pages_page_idx
  on tracker.business_pages (page_id);

create index if not exists business_apps_app_idx
  on tracker.business_apps (app_id);

create index if not exists meta_campaigns_account_active_idx
  on tracker.meta_campaigns (ad_account_id, is_active, last_seen_at desc);

create index if not exists meta_ad_sets_campaign_idx
  on tracker.meta_ad_sets (campaign_id, last_seen_at desc);

create index if not exists meta_ad_sets_account_active_idx
  on tracker.meta_ad_sets (ad_account_id, is_active, last_seen_at desc);

create index if not exists meta_ads_ad_set_idx
  on tracker.meta_ads (ad_set_id, last_seen_at desc);

create index if not exists meta_ads_campaign_idx
  on tracker.meta_ads (campaign_id, last_seen_at desc);

create index if not exists meta_ads_account_active_idx
  on tracker.meta_ads (ad_account_id, is_active, last_seen_at desc);

create index if not exists meta_creatives_page_idx
  on tracker.meta_creatives (page_id)
  where page_id is not null;

create index if not exists meta_creatives_connection_active_idx
  on tracker.meta_creatives (connection_id, is_active, last_seen_at desc);

create index if not exists creative_assets_connection_type_idx
  on tracker.creative_assets (connection_id, asset_type, last_seen_at desc);

create index if not exists creative_assets_video_id_idx
  on tracker.creative_assets (meta_video_id)
  where meta_video_id is not null;

create index if not exists creative_assets_image_hash_idx
  on tracker.creative_assets (meta_image_hash)
  where meta_image_hash is not null;

create index if not exists creative_asset_links_asset_idx
  on tracker.creative_asset_links (creative_asset_id, creative_id);

create index if not exists ad_creative_links_creative_idx
  on tracker.ad_creative_links (creative_id, ad_id);

create index if not exists daily_metrics_account_date_idx
  on tracker.daily_metrics (ad_account_id, metric_date desc);

create index if not exists daily_metrics_campaign_date_idx
  on tracker.daily_metrics (campaign_id, metric_date desc);

create index if not exists daily_metrics_ad_set_date_idx
  on tracker.daily_metrics (ad_set_id, metric_date desc);

create index if not exists daily_metrics_ad_date_idx
  on tracker.daily_metrics (ad_id, metric_date desc);

create index if not exists daily_metrics_creative_date_idx
  on tracker.daily_metrics (creative_id, metric_date desc)
  where creative_id is not null;

create index if not exists daily_metrics_asset_date_idx
  on tracker.daily_metrics (creative_asset_id, metric_date desc)
  where creative_asset_id is not null;

create index if not exists sync_runs_connection_created_idx
  on tracker.sync_runs (connection_id, created_at desc);

create index if not exists sync_runs_active_idx
  on tracker.sync_runs (connection_id, created_at desc)
  where status in ('queued', 'running');

create or replace view tracker.connection_coverage as
select
  c.connection_id,
  c.owner_id,
  c.status as connection_status,
  c.last_validated_at,
  (select count(*) from tracker.meta_businesses b
    where b.connection_id = c.connection_id and b.is_active) as business_count,
  (select count(*) from tracker.meta_ad_accounts a
    where a.connection_id = c.connection_id and a.is_active) as ad_account_count,
  (select count(*) from tracker.meta_pages p
    where p.connection_id = c.connection_id and p.is_active) as page_count,
  (select count(*) from tracker.meta_apps app
    where app.connection_id = c.connection_id and app.is_active) as app_count,
  (select count(*) from tracker.meta_creatives cr
    where cr.connection_id = c.connection_id and cr.is_active) as creative_container_count,
  (select count(*) from tracker.creative_assets asset
    where asset.connection_id = c.connection_id and asset.is_active) as creative_asset_count,
  (
    select count(*)
    from tracker.meta_campaigns campaign
    join tracker.meta_ad_accounts account
      on account.ad_account_id = campaign.ad_account_id
    where account.connection_id = c.connection_id
      and campaign.is_active
  ) as campaign_count,
  (
    select count(*)
    from tracker.meta_ads ad
    join tracker.meta_ad_accounts account
      on account.ad_account_id = ad.ad_account_id
    where account.connection_id = c.connection_id
      and ad.is_active
  ) as ad_count,
  (
    select max(run.finished_at)
    from tracker.sync_runs run
    where run.connection_id = c.connection_id
      and run.status in ('succeeded', 'partial')
  ) as last_sync_at
from tracker.meta_connections c;

create or replace view tracker.creative_asset_usage as
select
  asset.creative_asset_id,
  asset.connection_id,
  asset.asset_key,
  asset.asset_type,
  asset.meta_video_id,
  asset.meta_image_hash,
  asset.name,
  asset.thumbnail_url,
  asset.preview_url,
  asset.width,
  asset.height,
  asset.duration_seconds,
  coalesce(
    array_agg(distinct creative.creative_code)
      filter (where creative.creative_code is not null),
    '{}'::text[]
  ) as creative_codes,
  coalesce(
    array_agg(distinct page.name)
      filter (where page.name is not null),
    '{}'::text[]
  ) as page_names,
  count(distinct creative.creative_id) as creative_container_count,
  count(distinct ad_link.ad_id) as ad_count,
  count(distinct ad.ad_account_id) as ad_account_count,
  count(distinct creative.page_id) filter (where creative.page_id is not null) as page_count,
  max(ad.last_seen_at) as last_used_at,
  asset.last_seen_at
from tracker.creative_assets asset
left join tracker.creative_asset_links asset_link
  on asset_link.creative_asset_id = asset.creative_asset_id
left join tracker.meta_creatives creative
  on creative.creative_id = asset_link.creative_id
left join tracker.meta_pages page
  on page.page_id = creative.page_id
left join tracker.ad_creative_links ad_link
  on ad_link.creative_id = creative.creative_id
left join tracker.meta_ads ad
  on ad.ad_id = ad_link.ad_id
where asset.is_active
group by asset.creative_asset_id;

comment on view tracker.creative_asset_usage is
  'Creative library inventory and usage only. It does not duplicate ad-level spend across dynamic creative assets.';
