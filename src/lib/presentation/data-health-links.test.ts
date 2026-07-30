import { describe, expect, it } from "vitest";

import { normalizeDataHealthResource } from "@/lib/data-contract";
import type { CreativeRow } from "@/types/view-models";
import { dataHealthEntityHref } from "./data-health-links";

const familyId = "cf_0123456789abcdef01234567";
const creative: CreativeRow = {
  id: "variant-1",
  creativeFamilyId: familyId,
  name: "V29-VA",
  assetKey: "video:video-1",
  aliases: ["V29-VA"],
  format: "Video",
  platform: "Android",
  linkLabel: "Đang chạy",
  linkCount: 1,
  currentAdCount: 1,
  activeAdCount: 1,
  readiness: "Sẵn sàng",
  performanceLabel: "Đã có dữ liệu",
  imageUrl: "/creative-placeholder.svg",
  duration: "00:15",
  ratio: "9:16",
  pageName: "Growth Page",
  eventMapping: { install: true, registration: true },
  entityLinks: {
    creativeFamilyId: familyId,
    assetId: "asset-1",
    metaCreativeIds: ["creative-1"],
    adIds: ["ad-1"],
    campaignIds: ["campaign-1"],
    adAccountIds: ["act_123"],
    pageIds: ["page-1"],
  },
};

describe("Data Health affected entity links", () => {
  it.each([
    [
      null,
      "connection",
      "/sources?tab=connection",
    ],
    [
      "business:business-1",
      "business",
      "/sources?tab=businesses&selected=business-1",
    ],
    [
      "account:act_123",
      "ad_account",
      "/sources?tab=ad-accounts&selected=act_123",
    ],
    [
      "campaign:1200123",
      "campaign",
      "/campaigns/1200123",
    ],
    [
      "adset:adset-1",
      "ad_set",
      null,
    ],
    [
      "ad:ad-1",
      "ad",
      `/creatives/${familyId}?tab=usage`,
    ],
    [
      "creative:creative-1",
      "meta_creative",
      `/creatives/${familyId}?tab=metadata`,
    ],
    [
      "asset:asset-1",
      "asset",
      `/creatives/${familyId}?tab=preview`,
    ],
    [
      "page:page-1",
      "page",
      "/sources?tab=pages&selected=page-1",
    ],
  ] as const)(
    "maps resource %s through canonical type %s without inventing a route",
    (resource, entityType, expectedHref) => {
      const entity = normalizeDataHealthResource(resource)[0];
      expect(entity.entityType).toBe(entityType);
      expect(
        dataHealthEntityHref(entity, { creatives: [creative] }),
      ).toBe(expectedHref);
    },
  );

  it("does not guess a Creative route when the relation is ambiguous", () => {
    const secondFamily: CreativeRow = {
      ...creative,
      id: "variant-2",
      creativeFamilyId: "cf_abcdef0123456789abcdef01",
      entityLinks: {
        ...creative.entityLinks!,
        creativeFamilyId: "cf_abcdef0123456789abcdef01",
      },
    };

    expect(
      dataHealthEntityHref(
        {
          entityType: "ad",
          entityId: "ad-1",
          label: null,
        },
        { creatives: [creative, secondFamily] },
      ),
    ).toBeNull();
    expect(
      dataHealthEntityHref({
        entityType: "ad_set",
        entityId: "adset-1",
        label: null,
      }),
    ).toBeNull();
  });

  it("covers canonical types that have a direct settings or detail route", () => {
    expect(
      dataHealthEntityHref({
        entityType: "creative_family",
        entityId: familyId,
        label: null,
      }),
    ).toBe(`/creatives/${familyId}`);
    expect(
      dataHealthEntityHref({
        entityType: "event_mapping",
        entityId: "install",
        label: null,
      }),
    ).toBe("/settings?tab=events");
    expect(
      dataHealthEntityHref({
        entityType: "post",
        entityId: "post-1",
        label: null,
      }),
    ).toBeNull();
  });

  it("preserves shared reporting context without leaking issue state", () => {
    const href = dataHealthEntityHref(
      {
        entityType: "ad",
        entityId: "ad-1",
        label: null,
      },
      {
        creatives: [creative],
        query: {
          from: "2026-07-01",
          to: "2026-07-30",
          currency: "VND",
          compare: "previous_period",
          selected: "issue_old",
          tab: "technical",
        },
      },
    );
    const url = new URL(href as string, "https://tracker.example");

    expect(url.pathname).toBe(`/creatives/${familyId}`);
    expect(url.searchParams.get("tab")).toBe("usage");
    expect(url.searchParams.get("from")).toBe("2026-07-01");
    expect(url.searchParams.get("to")).toBe("2026-07-30");
    expect(url.searchParams.get("currency")).toBe("VND");
    expect(url.searchParams.get("compare")).toBe("previous_period");
    expect(url.searchParams.has("selected")).toBe(false);
  });
});
