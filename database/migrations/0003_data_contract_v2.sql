alter table tracker.creative_assets
  add column if not exists creative_family_id text
  generated always as (
    'cf_' || substr(md5(asset_key), 1, 24)
  ) stored;

create unique index if not exists creative_assets_connection_family_unique_idx
  on tracker.creative_assets (connection_id, creative_family_id);

comment on column tracker.creative_assets.creative_family_id is
  'Stable Creative Family route ID derived only from canonical asset_key. Names and reporting aliases never participate in identity.';

create or replace view tracker.creative_family_entity_links as
select
  asset.creative_family_id,
  asset.creative_asset_id,
  asset.connection_id,
  asset.asset_key,
  asset.asset_type,
  asset.meta_video_id,
  asset.meta_image_hash,
  coalesce(
    array_agg(distinct creative.meta_creative_id order by creative.meta_creative_id)
      filter (where creative.meta_creative_id is not null),
    '{}'::text[]
  ) as meta_creative_ids,
  coalesce(
    array_agg(distinct ad.meta_ad_id order by ad.meta_ad_id)
      filter (where ad.meta_ad_id is not null),
    '{}'::text[]
  ) as ad_ids,
  coalesce(
    array_agg(distinct campaign.meta_campaign_id order by campaign.meta_campaign_id)
      filter (where campaign.meta_campaign_id is not null),
    '{}'::text[]
  ) as campaign_ids,
  coalesce(
    array_agg(distinct account.meta_ad_account_id order by account.meta_ad_account_id)
      filter (where account.meta_ad_account_id is not null),
    '{}'::text[]
  ) as ad_account_ids,
  coalesce(
    array_agg(distinct page.meta_page_id order by page.meta_page_id)
      filter (where page.meta_page_id is not null),
    '{}'::text[]
  ) as page_ids
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
left join tracker.meta_campaigns campaign
  on campaign.campaign_id = ad.campaign_id
left join tracker.meta_ad_accounts account
  on account.ad_account_id = ad.ad_account_id
group by asset.creative_asset_id;

comment on view tracker.creative_family_entity_links is
  'Canonical cross-navigation IDs for one physical asset-backed Creative Family.';
