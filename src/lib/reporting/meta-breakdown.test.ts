import { describe, expect, it } from "vitest";

import {
  buildMetaBreakdown,
  unavailableMetaBreakdown,
  type MetaBreakdownSourceRow,
} from "./meta-breakdown";

const baseRow: MetaBreakdownSourceRow = {
  adAccountMetaId: "act_1",
  adAccountName: "Foxscore VN",
  campaignMetaId: "cmp_1",
  campaignName: "Install July",
  objectiveKey: "app_promotion",
  publisherPlatform: "facebook",
  platformPosition: "feed",
  currency: "VND",
  spend: 100,
  impressions: 1_000,
  linkClicks: 20,
};

describe("Meta breakdown contract", () => {
  it("groups only one currency and exposes the five permitted Meta dimensions", () => {
    const result = buildMetaBreakdown([
      baseRow,
      {
        ...baseRow,
        adAccountMetaId: "act_2",
        adAccountName: "Foxscore US",
        campaignMetaId: "cmp_2",
        campaignName: "Lead July",
        objectiveKey: "leads",
        publisherPlatform: "instagram",
        platformPosition: "story",
        spend: 240,
        impressions: 2_400,
        linkClicks: 48,
      },
    ]);

    expect(result.currency).toBe("VND");
    expect(result.dimensions.ad_account.rows).toEqual([
      expect.objectContaining({ id: "act_2", spend: 240 }),
      expect.objectContaining({ id: "act_1", spend: 100 }),
    ]);
    expect(result.dimensions.objective.rows).toEqual([
      expect.objectContaining({ label: "Khách hàng tiềm năng", spend: 240 }),
      expect.objectContaining({ label: "Quảng bá ứng dụng", spend: 100 }),
    ]);
    expect(result.dimensions.campaign.rows).toHaveLength(2);
    expect(result.dimensions.placement.rows.map((row) => row.label)).toEqual([
      "Story",
      "Feed",
    ]);
    expect(result.dimensions.meta_platform.rows.map((row) => row.label)).toEqual([
      "Instagram",
      "Facebook",
    ]);
  });

  it("fails closed rather than adding Spend across currencies", () => {
    const result = buildMetaBreakdown([
      baseRow,
      { ...baseRow, adAccountMetaId: "act_2", currency: "USD", spend: 50 },
    ]);

    for (const dimension of Object.values(result.dimensions)) {
      expect(dimension).toEqual({
        state: "unavailable",
        rows: [],
        reason: "split_currency",
      });
    }
  });

  it("does not display a partial Placement or Meta Platform allocation", () => {
    const placementFallback = buildMetaBreakdown([
      baseRow,
      { ...baseRow, platformPosition: "ALL", spend: 30 },
    ]);
    expect(placementFallback.dimensions.placement).toEqual({
      state: "unavailable",
      rows: [],
      reason: "placement_breakdown_unavailable",
    });
    expect(placementFallback.dimensions.meta_platform.state).toBe("ready");

    const platformFallback = buildMetaBreakdown([
      baseRow,
      { ...baseRow, publisherPlatform: "ALL", spend: 30 },
    ]);
    expect(platformFallback.dimensions.meta_platform).toEqual({
      state: "unavailable",
      rows: [],
      reason: "meta_platform_breakdown_unavailable",
    });
  });

  it("keeps unmapped Objectives visible and marks the dimension partial", () => {
    const result = buildMetaBreakdown([
      baseRow,
      { ...baseRow, objectiveKey: null, spend: 10 },
    ]);

    expect(result.dimensions.objective.state).toBe("partial");
    expect(result.dimensions.objective.rows).toContainEqual(
      expect.objectContaining({
        id: "meta-objective-unmapped",
        label: "Mục tiêu Meta chưa map",
        spend: 10,
      }),
    );
  });

  it("provides an explicit unavailable model instead of demo allocation", () => {
    expect(unavailableMetaBreakdown()).toEqual({
      currency: null,
      dimensions: expect.objectContaining({
        ad_account: {
          state: "unavailable",
          rows: [],
          reason: "detail_unavailable",
        },
      }),
    });
  });
});
