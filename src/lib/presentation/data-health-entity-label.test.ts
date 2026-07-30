import { describe, expect, it } from "vitest";

import { formatDataHealthEntityType } from "./data-health-entity-label";

describe("formatDataHealthEntityType", () => {
  it.each([
    ["business", "Doanh nghiệp"],
    ["ad_account", "Tài khoản quảng cáo"],
    ["campaign", "Campaign"],
    ["ad_set", "Ad Set"],
    ["ad", "Quảng cáo"],
    ["meta_creative", "Creative trên Meta"],
    ["asset", "Tài sản Creative"],
    ["creative_family", "Creative Family"],
    ["page", "Trang Facebook"],
    ["post", "Bài viết"],
    ["event_mapping", "Mapping sự kiện"],
    ["connection", "Kết nối Meta"],
  ] as const)("maps %s to user-facing copy", (entityType, label) => {
    expect(formatDataHealthEntityType(entityType)).toBe(label);
  });
});
