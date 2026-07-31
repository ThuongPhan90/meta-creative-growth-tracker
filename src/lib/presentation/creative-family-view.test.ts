import { describe, expect, it } from "vitest";

import { demoCreatives } from "@/lib/demo-data";

import { groupCreativeFamiliesForView } from "./creative-family-view";

describe("Creative Family view aggregation", () => {
  it("keeps one physical asset linked across multiple Ad Accounts without losing usage", () => {
    const base = demoCreatives[0];
    const familyId = base.creativeFamilyId ?? "cf_shared";
    const first = {
      ...base,
      id: "asset_shared:android:act_1",
      creativeFamilyId: familyId,
      linkCount: 1,
      activeAdCount: 1,
      performance: base.performance
        ? {
            ...base.performance,
            currency: "USD",
            spend: 100,
            resultValues: { lead: 4 },
          }
        : null,
      entityLinks: {
        creativeFamilyId: familyId,
        assetId: "asset_shared",
        metaCreativeIds: ["creative_1"],
        adIds: ["ad_1"],
        campaignIds: ["campaign_1"],
        adAccountIds: ["act_1"],
        pageIds: ["page_1"],
      },
    };
    const second = {
      ...base,
      id: "asset_shared:ios:act_2",
      creativeFamilyId: familyId,
      linkCount: 1,
      activeAdCount: 1,
      performance: base.performance
        ? {
            ...base.performance,
            currency: "USD",
            spend: 250,
            resultValues: { purchase: 2 },
          }
        : null,
      entityLinks: {
        creativeFamilyId: familyId,
        assetId: "asset_shared",
        metaCreativeIds: ["creative_2"],
        adIds: ["ad_2"],
        campaignIds: ["campaign_2"],
        adAccountIds: ["act_2"],
        pageIds: ["page_2"],
      },
    };

    const family = groupCreativeFamiliesForView([first, second])[0];

    expect(family.adCount).toBe(2);
    expect(family.activeAdCount).toBe(2);
    expect(family.entityLinks).toEqual({
      creativeFamilyId: familyId,
      assetId: "asset_shared",
      metaCreativeIds: ["creative_1", "creative_2"],
      adIds: ["ad_1", "ad_2"],
      campaignIds: ["campaign_1", "campaign_2"],
      adAccountIds: ["act_1", "act_2"],
      pageIds: ["page_1", "page_2"],
    });
    expect(family.performance).toMatchObject({
      currency: "USD",
      spend: 350,
      resultValues: { lead: 4, purchase: 2 },
    });
  });

  it("does not count the same Ad twice when one family has multiple OS rows", () => {
    const base = demoCreatives[0];
    const familyId = base.creativeFamilyId ?? "cf_shared";
    const entityLinks = {
      creativeFamilyId: familyId,
      assetId: "asset_shared",
      metaCreativeIds: ["creative_1"],
      adIds: ["ad_1"],
      campaignIds: ["campaign_1"],
      adAccountIds: ["act_1"],
      pageIds: ["page_1"],
    };

    const family = groupCreativeFamiliesForView([
      {
        ...base,
        id: "asset_shared:android",
        creativeFamilyId: familyId,
        linkCount: 1,
        activeAdCount: 1,
        entityLinks,
      },
      {
        ...base,
        id: "asset_shared:ios",
        creativeFamilyId: familyId,
        linkCount: 1,
        activeAdCount: 1,
        entityLinks,
      },
    ])[0];

    expect(family.adCount).toBe(1);
    expect(family.activeAdCount).toBe(1);
  });
});
