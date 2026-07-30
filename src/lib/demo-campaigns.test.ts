import { describe, expect, it } from "vitest";

import {
  demoCampaignInventoryPage,
  getDemoCampaignDetail,
} from "./demo-campaigns";

describe("demo Campaign full-page data", () => {
  it.each(demoCampaignInventoryPage.items)(
    "resolves canonical Campaign $metaCampaignId with a complete hierarchy",
    (inventoryCampaign) => {
      const detail = getDemoCampaignDetail(
        inventoryCampaign.metaCampaignId,
      );

      expect(detail?.campaign).toBe(inventoryCampaign);
      expect(detail?.hierarchy.metaCampaignId).toBe(
        inventoryCampaign.metaCampaignId,
      );
      expect(detail?.hierarchy.adSets).toHaveLength(
        inventoryCampaign.adSetCount,
      );

      const ads =
        detail?.hierarchy.adSets.flatMap((adSet) => adSet.ads) ?? [];
      const creativeFamilyIds = new Set(
        ads.flatMap((ad) => ad.creativeFamilyIds),
      );

      expect(ads).toHaveLength(inventoryCampaign.adCount);
      expect(creativeFamilyIds.size).toBe(
        inventoryCampaign.creativeAssetCount,
      );
      expect(
        [...creativeFamilyIds].every((id) =>
          /^cf_[a-f0-9]{24}$/.test(id),
        ),
      ).toBe(true);
    },
  );

  it("does not resolve an unknown or non-canonical Campaign ID", () => {
    expect(getDemoCampaignDetail("700000000000999")).toBeNull();
    expect(getDemoCampaignDetail("demo-campaign-01")).toBeNull();
  });
});
