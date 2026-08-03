import { describe, expect, it } from "vitest";

import type { CreativeRow, EventHealth } from "@/types/view-models";

import { buildDataHealthCoverage } from "./data-health-coverage";

function creative({
  id,
  creativeFamilyId,
  campaignIds = [],
  adIds = [],
}: {
  id: string;
  creativeFamilyId?: string;
  campaignIds?: string[];
  adIds?: string[];
}): CreativeRow {
  return {
    id,
    ...(creativeFamilyId ? { creativeFamilyId } : {}),
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
      creativeFamilyId: creativeFamilyId ?? id,
      assetId: id,
      metaCreativeIds: [],
      campaignIds,
      adIds,
      adAccountIds: [],
      pageIds: [],
    },
  };
}

function dimension(
  coverage: ReturnType<typeof buildDataHealthCoverage>,
  key:
    | "campaign"
    | "ad"
    | "creative"
    | "event"
    | "delivery_ready_account",
) {
  const value = coverage.find((item) => item.key === key);
  if (!value) throw new Error(`Missing ${key} coverage dimension`);
  return value;
}

describe("V6 Data Quality coverage acceptance", () => {
  it("uses the canonical Creative Family as the denominator instead of inflating coverage from asset rows", () => {
    const coverage = buildDataHealthCoverage(
      [
        creative({ id: "asset_1", creativeFamilyId: "cf_1" }),
        creative({
          id: "asset_2",
          creativeFamilyId: "cf_1",
          campaignIds: ["campaign_1"],
          adIds: ["ad_1"],
        }),
        creative({ id: "asset_3", creativeFamilyId: "cf_2" }),
      ],
      [],
    );

    expect(dimension(coverage, "campaign")).toMatchObject({
      covered: 1,
      total: 2,
      ratio: 0.5,
      missingFamilyIds: ["cf_2"],
    });
    expect(dimension(coverage, "ad")).toMatchObject({
      covered: 1,
      total: 2,
      ratio: 0.5,
      missingFamilyIds: ["cf_2"],
    });
    expect(dimension(coverage, "creative")).toMatchObject({
      covered: 2,
      total: 2,
      ratio: 1,
    });
  });

  it("does not turn an unknown 0/0 denominator into a misleading 100% coverage claim", () => {
    const coverage = buildDataHealthCoverage([], []);

    expect(
      coverage.map(({ key, covered, total, ratio }) => ({
        key,
        covered,
        total,
        ratio,
      })),
    ).toEqual([
      { key: "campaign", covered: 0, total: 0, ratio: 0 },
      { key: "ad", covered: 0, total: 0, ratio: 0 },
      { key: "creative", covered: 0, total: 0, ratio: 0 },
      { key: "event", covered: 0, total: 0, ratio: 0 },
    ]);
    expect(coverage.every((item) => item.ratio !== 1)).toBe(true);
  });

  it("counts Result Mapping only at the ready Objective-by-OS grain", () => {
    const events: EventHealth[] = [
      { name: "Install", android: "ready", ios: "warning", total: 10 },
      {
        name: "CompleteRegistration",
        android: "pending",
        ios: "ready",
        total: 5,
      },
    ];

    expect(dimension(buildDataHealthCoverage([], events), "event")).toMatchObject({
      covered: 2,
      total: 4,
      ratio: 0.5,
      detail: "2/4 mapping Result theo Objective sẵn sàng",
    });
  });

  it("does not count a row without an explicit canonical Family ID as Creative-covered", () => {
    const coverage = buildDataHealthCoverage(
      [
        creative({
          id: "asset_without_family",
          campaignIds: ["campaign_1"],
          adIds: ["ad_1"],
        }),
        creative({ id: "asset_with_family", creativeFamilyId: "cf_2" }),
      ],
      [],
    );

    expect(dimension(coverage, "creative")).toMatchObject({
      covered: 1,
      total: 2,
      ratio: 0.5,
      missingFamilyIds: ["asset_without_family"],
    });
  });

  it("uses only delivery-eligible accounts as the explicit denominator and never promotes 0/0 to full coverage", () => {
    const partial = dimension(
      buildDataHealthCoverage([], [], {
        selectedAccountCount: 9,
        deliveryEligibleAccountCount: 7,
        deliveryReadyAccountCount: 5,
        state: "partial",
        accounts: [
          {
            metaAdAccountId: "act_ready",
            deliveryEligible: true,
            deliveryState: "ready",
          },
          {
            metaAdAccountId: "act_stale",
            deliveryEligible: true,
            deliveryState: "stale",
          },
          {
            metaAdAccountId: "act_out_of_scope",
            deliveryEligible: false,
            deliveryState: "unavailable",
          },
        ],
      }),
      "delivery_ready_account",
    );
    const noEligibleAccounts = dimension(
      buildDataHealthCoverage([], [], {
        selectedAccountCount: 3,
        deliveryEligibleAccountCount: 0,
        deliveryReadyAccountCount: 0,
        state: "ready",
      }),
      "delivery_ready_account",
    );

    expect(partial).toMatchObject({
      covered: 5,
      total: 7,
      ratio: 5 / 7,
      state: "partial",
      missingAccountMetaIds: ["act_stale"],
      detail:
        "5/7 Ad Account đủ điều kiện delivery có snapshot mới và cùng ngày dữ liệu",
    });
    expect(noEligibleAccounts).toMatchObject({
      covered: 0,
      total: 0,
      ratio: null,
      state: "ready",
      detail: "Không có Ad Account đủ điều kiện delivery trong scope hiện tại",
    });
    expect(noEligibleAccounts.ratio).not.toBe(1);
  });

  it("preserves unavailable delivery as unavailable instead of manufacturing a coverage percentage", () => {
    const unavailable = dimension(
      buildDataHealthCoverage([], [], {
        selectedAccountCount: 3,
        deliveryEligibleAccountCount: 2,
        deliveryReadyAccountCount: 0,
        state: "unavailable",
      }),
      "delivery_ready_account",
    );

    expect(unavailable).toMatchObject({
      covered: 0,
      total: 2,
      ratio: null,
      state: "unavailable",
      detail:
        "Snapshot delivery chưa khả dụng cho scope hiện tại; hệ thống không suy diễn coverage 0% hoặc 100%.",
    });
  });
});
