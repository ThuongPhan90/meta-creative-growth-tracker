import type {
  AdInventoryItem,
  AdInventoryPage,
  CampaignAdItem,
  CampaignHierarchy,
  CampaignInventoryPage,
} from "@/lib/db/types";

const CREATIVE_FAMILY_IDS = {
  onboarding: "cf_111111111111111111111111",
  featureTour: "cf_222222222222222222222222",
  welcome: "cf_333333333333333333333333",
  registration: "cf_444444444444444444444444",
} as const;

export const demoCampaignInventoryPage: CampaignInventoryPage = {
  items: [
    {
      campaignId: "demo-campaign-01",
      metaCampaignId: "700000000000001",
      name: "App Growth · Onboarding",
      objective: "OUTCOME_APP_PROMOTION",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      isActive: true,
      metaAdAccountId: "act_600000000000001",
      adAccountName: "Demo App Growth · Android",
      adSetCount: 3,
      adCount: 12,
      creativeAssetCount: 4,
      performance: [
        {
          currency: "VND",
          spend: 18_600_000,
          impressions: 960_000,
          installs: 1_240,
          registrations: 620,
          cpi: 15_000,
          costPerRegistration: 30_000,
        },
      ],
      lastSeenAt: "2026-07-30T08:10:00.000Z",
    },
    {
      campaignId: "demo-campaign-02",
      metaCampaignId: "700000000000002",
      name: "App Growth · Feature Tour",
      objective: "OUTCOME_APP_PROMOTION",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      isActive: true,
      metaAdAccountId: "act_600000000000002",
      adAccountName: "Demo App Growth · iOS",
      adSetCount: 2,
      adCount: 8,
      creativeAssetCount: 3,
      performance: [
        {
          currency: "VND",
          spend: 13_200_000,
          impressions: 640_000,
          installs: 440,
          registrations: 160,
          cpi: 30_000,
          costPerRegistration: 82_500,
        },
      ],
      lastSeenAt: "2026-07-30T08:10:00.000Z",
    },
    {
      campaignId: "demo-campaign-03",
      metaCampaignId: "700000000000003",
      name: "Retargeting · Welcome",
      objective: "OUTCOME_APP_PROMOTION",
      status: "PAUSED",
      effectiveStatus: "PAUSED",
      isActive: false,
      metaAdAccountId: "act_600000000000001",
      adAccountName: "Demo App Growth · Android",
      adSetCount: 1,
      adCount: 4,
      creativeAssetCount: 2,
      performance: [
        {
          currency: "VND",
          spend: 5_400_000,
          impressions: 284_000,
          installs: 90,
          registrations: 48,
          cpi: 60_000,
          costPerRegistration: 112_500,
        },
      ],
      lastSeenAt: "2026-07-29T08:10:00.000Z",
    },
  ],
  total: 3,
  limit: 50,
  offset: 0,
};

function demoAds({
  campaignNumber,
  adSetNumber,
  creativeFamilyIds,
  count,
}: {
  campaignNumber: number;
  adSetNumber: number;
  creativeFamilyIds: readonly string[];
  count: number;
}): CampaignAdItem[] {
  return Array.from({ length: count }, (_, index) => {
    const adNumber = index + 1;
    const suffix = `${campaignNumber}${adSetNumber}${adNumber}`.padStart(
      6,
      "0",
    );

    return {
      adId: `demo-ad-${campaignNumber}-${adSetNumber}-${adNumber}`,
      metaAdId: `800000000${suffix}`,
      name: `Ad ${String(adNumber).padStart(2, "0")} · Variant ${String.fromCharCode(
        64 + adNumber,
      )}`,
      status: index === count - 1 ? "PAUSED" : "ACTIVE",
      effectiveStatus: index === count - 1 ? "PAUSED" : "ACTIVE",
      creativeFamilyIds: [
        creativeFamilyIds[index % creativeFamilyIds.length],
      ],
    };
  });
}

function demoHierarchy({
  campaignNumber,
  campaignId,
  metaCampaignId,
  adSetCount,
  adsPerAdSet,
  creativeFamilyIds,
}: {
  campaignNumber: number;
  campaignId: string;
  metaCampaignId: string;
  adSetCount: number;
  adsPerAdSet: number;
  creativeFamilyIds: readonly string[];
}): CampaignHierarchy {
  return {
    campaignId,
    metaCampaignId,
    adSets: Array.from({ length: adSetCount }, (_, index) => {
      const adSetNumber = index + 1;
      const suffix = `${campaignNumber}${adSetNumber}`.padStart(5, "0");

      return {
        adSetId: `demo-ad-set-${campaignNumber}-${adSetNumber}`,
        metaAdSetId: `7100000000${suffix}`,
        name:
          adSetNumber === 1
            ? "Broad · Core audience"
            : adSetNumber === 2
              ? "Lookalike · High intent"
              : "Retargeting · Engaged users",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        ads: demoAds({
          campaignNumber,
          adSetNumber,
          creativeFamilyIds,
          count: adsPerAdSet,
        }),
      };
    }),
  };
}

const demoCampaignHierarchies: Record<string, CampaignHierarchy> = {
  "700000000000001": demoHierarchy({
    campaignNumber: 1,
    campaignId: "demo-campaign-01",
    metaCampaignId: "700000000000001",
    adSetCount: 3,
    adsPerAdSet: 4,
    creativeFamilyIds: [
      CREATIVE_FAMILY_IDS.onboarding,
      CREATIVE_FAMILY_IDS.featureTour,
      CREATIVE_FAMILY_IDS.welcome,
      CREATIVE_FAMILY_IDS.registration,
    ],
  }),
  "700000000000002": demoHierarchy({
    campaignNumber: 2,
    campaignId: "demo-campaign-02",
    metaCampaignId: "700000000000002",
    adSetCount: 2,
    adsPerAdSet: 4,
    creativeFamilyIds: [
      CREATIVE_FAMILY_IDS.featureTour,
      CREATIVE_FAMILY_IDS.onboarding,
      CREATIVE_FAMILY_IDS.registration,
    ],
  }),
  "700000000000003": demoHierarchy({
    campaignNumber: 3,
    campaignId: "demo-campaign-03",
    metaCampaignId: "700000000000003",
    adSetCount: 1,
    adsPerAdSet: 4,
    creativeFamilyIds: [
      CREATIVE_FAMILY_IDS.welcome,
      CREATIVE_FAMILY_IDS.registration,
    ],
  }),
};

function buildDemoAdInventory(): AdInventoryPage {
  let ordinal = 0;
  const items: AdInventoryItem[] = demoCampaignInventoryPage.items.flatMap(
    (campaign) => {
      const hierarchy = demoCampaignHierarchies[campaign.metaCampaignId];
      if (!hierarchy) return [];

      return hierarchy.adSets.flatMap((adSet) =>
        adSet.ads.map((ad) => {
          ordinal += 1;
          const effectiveStatus = ad.effectiveStatus ?? ad.status;
          const active =
            campaign.isActive && effectiveStatus?.toUpperCase() === "ACTIVE";
          return {
            adId: ad.adId,
            metaAdId: ad.metaAdId,
            name: ad.name,
            status: ad.status,
            effectiveStatus,
            // `isActive` is the source inventory flag, not delivery status.
            isActive: true,
            isOperational: true,
            metaCampaignId: campaign.metaCampaignId,
            campaignName: campaign.name,
            metaAdSetId: adSet.metaAdSetId,
            adSetName: adSet.name,
            metaAdAccountId: campaign.metaAdAccountId,
            adAccountName: campaign.adAccountName,
            creativeFamilyIds: ad.creativeFamilyIds,
            latestMetricDate: active ? "2026-07-30" : null,
            deliveryState: active
              ? ordinal % 5 === 0
                ? "missing"
                : "delivering"
              : "not_active",
            inventoryObservedAt: campaign.lastSeenAt,
            lastSeenAt: campaign.lastSeenAt,
          } satisfies AdInventoryItem;
        }),
      );
    },
  );

  return {
    items,
    total: items.length,
    limit: 50,
    offset: 0,
  };
}

/** Deterministic local data so the Ads tab remains usable in demo mode. */
export const demoAdInventoryPage = buildDemoAdInventory();

export function getDemoCampaignDetail(metaCampaignId: string) {
  const campaign = demoCampaignInventoryPage.items.find(
    (item) => item.metaCampaignId === metaCampaignId,
  );
  const hierarchy = demoCampaignHierarchies[metaCampaignId];

  return campaign && hierarchy ? { campaign, hierarchy } : null;
}
