import type { DataHealthIssue } from "@/types/view-models";

type DataHealthEntityType =
  DataHealthIssue["affectedEntities"][number]["entityType"];

const DATA_HEALTH_ENTITY_LABELS: Record<
  DataHealthEntityType,
  string
> = {
  business: "Doanh nghiệp",
  ad_account: "Tài khoản quảng cáo",
  campaign: "Campaign",
  ad_set: "Ad Set",
  ad: "Quảng cáo",
  meta_creative: "Creative trên Meta",
  asset: "Tài sản Creative",
  creative_family: "Creative Family",
  page: "Trang Facebook",
  post: "Bài viết",
  event_mapping: "Mapping sự kiện",
  connection: "Kết nối Meta",
};

export function formatDataHealthEntityType(
  entityType: DataHealthEntityType,
) {
  return DATA_HEALTH_ENTITY_LABELS[entityType];
}
