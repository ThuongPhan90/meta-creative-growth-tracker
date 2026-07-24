import { describe, expect, it } from "vitest";

import { getCampaignStatusPresentation } from "./campaigns-view";

describe("campaign status presentation", () => {
  it.each([
    ["ACTIVE", "Đang hoạt động", "active"],
    ["PAUSED", "Tạm dừng", "paused"],
    ["CAMPAIGN_PAUSED", "Tạm dừng", "paused"],
    ["WITH_ISSUES", "Cần kiểm tra", "issue"],
    ["ARCHIVED", "Đã lưu trữ", "inactive"],
  ] as const)("maps %s to a distinct operational tone", (raw, label, tone) => {
    expect(
      getCampaignStatusPresentation({
        effectiveStatus: raw,
        status: raw,
        isActive: true,
      }),
    ).toMatchObject({ label, tone });
  });

  it("does not present a stale inventory row as active", () => {
    expect(
      getCampaignStatusPresentation({
        effectiveStatus: "ACTIVE",
        status: "ACTIVE",
        isActive: false,
      }),
    ).toMatchObject({
      inventoryNote: "Không còn trong dữ liệu mới nhất",
      label: "Meta gần nhất: Đang hoạt động",
      tone: "inactive",
    });
  });
});
