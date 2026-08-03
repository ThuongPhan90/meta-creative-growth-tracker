import { describe, expect, it } from "vitest";

import type { CreativeRow, EventHealth } from "@/types/view-models";
import { buildDataHealthCoverage } from "./data-health-coverage";

function creative(
  id: string,
  campaignIds: string[],
  adIds: string[],
): CreativeRow {
  return {
    id,
    creativeFamilyId: id,
    name: id,
    assetKey: id,
    aliases: [],
    format: "Video",
    platform: "Android",
    linkLabel: "",
    linkCount: adIds.length,
    currentAdCount: adIds.length,
    activeAdCount: adIds.length,
    readiness: "Sẵn sàng",
    performanceLabel: "",
    imageUrl: "/test.png",
    duration: null,
    ratio: null,
    pageName: null,
    eventMapping: { install: true, registration: true },
    entityLinks: {
      creativeFamilyId: id,
      assetId: id,
      metaCreativeIds: [],
      campaignIds,
      adIds,
      adAccountIds: [],
      pageIds: [],
    },
  };
}

describe("Data Health coverage", () => {
  it("measures linkage coverage per canonical family and event/OS mapping", () => {
    const creatives = [
      creative("cf_1", ["campaign_1"], ["ad_1"]),
      creative("cf_1", [], []),
      creative("cf_2", [], []),
    ];
    const events: EventHealth[] = [
      { name: "Install", android: "ready", ios: "ready", total: 10 },
      {
        name: "CompleteRegistration",
        android: "ready",
        ios: "warning",
        total: 5,
      },
    ];

    const coverage = buildDataHealthCoverage(creatives, events);

    expect(coverage.find((item) => item.key === "campaign")).toMatchObject({
      covered: 1,
      total: 2,
      ratio: 0.5,
      missingFamilyIds: ["cf_2"],
    });
    expect(coverage.find((item) => item.key === "ad")).toMatchObject({
      covered: 1,
      total: 2,
      ratio: 0.5,
      missingFamilyIds: ["cf_2"],
    });
    expect(coverage.find((item) => item.key === "creative")).toMatchObject({
      covered: 2,
      total: 2,
      ratio: 1,
    });
    expect(coverage.find((item) => item.key === "event")).toMatchObject({
      covered: 3,
      total: 4,
      ratio: 0.75,
    });
  });

  it("uses delivery-eligible Ad Accounts as the denominator when a live snapshot is available", () => {
    const coverage = buildDataHealthCoverage([], [], {
      selectedAccountCount: 9,
      deliveryEligibleAccountCount: 7,
      deliveryReadyAccountCount: 5,
      state: "partial",
      accounts: [
        {
          metaAdAccountId: "act_1",
          deliveryEligible: true,
          deliveryState: "ready",
        },
        {
          metaAdAccountId: "act_2",
          deliveryEligible: true,
          deliveryState: "stale",
        },
      ],
    });

    expect(
      coverage.find((item) => item.key === "delivery_ready_account"),
    ).toMatchObject({
      covered: 5,
      total: 7,
      ratio: 5 / 7,
      detail:
        "5/7 Ad Account đủ điều kiện delivery có snapshot mới và cùng ngày dữ liệu",
      missingAccountMetaIds: ["act_2"],
    });
  });

  it("keeps an unavailable delivery snapshot distinct from an actual 0% coverage", () => {
    const coverage = buildDataHealthCoverage([], [], {
      selectedAccountCount: 2,
      deliveryEligibleAccountCount: 0,
      deliveryReadyAccountCount: 0,
      state: "unavailable",
    });

    expect(
      coverage.find((item) => item.key === "delivery_ready_account"),
    ).toMatchObject({
      covered: 0,
      total: 0,
      ratio: null,
      state: "unavailable",
    });
  });
});
