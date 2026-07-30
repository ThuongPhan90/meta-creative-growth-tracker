import { describe, expect, it } from "vitest";

import type {
  CreativeRow,
  Freshness,
  SyncRunView,
} from "@/types/view-models";
import {
  canonicalDetailId,
  creativeFamilyContract,
  dataHealthIssueContract,
  dataHealthIssueDetails,
} from "./contracts";

const freshness: Freshness = {
  lastSyncedAt: "2026-07-30T08:00:00.000Z",
  dataThroughAt: "2026-07-30T07:55:00.000Z",
  syncStatus: "healthy",
  freshnessSeconds: 300,
  syncMode: "scheduled",
};

describe("detail API contracts", () => {
  it("accepts only canonical route identifiers", () => {
    expect(
      canonicalDetailId(
        "creative-family",
        "cf_0123456789abcdef01234567",
      ),
    ).toBe("cf_0123456789abcdef01234567");
    expect(canonicalDetailId("creative-family", "video name")).toBeNull();
    expect(canonicalDetailId("campaign", "120045678901234")).toBe(
      "120045678901234",
    );
    expect(canonicalDetailId("campaign", "Summer campaign")).toBeNull();
    expect(
      canonicalDetailId(
        "data-health-issue",
        "issue_0123456789abcdef01234567",
      ),
    ).toBe("issue_0123456789abcdef01234567");
  });

  it("groups Creative variants under one Creative Family", () => {
    const familyId = "cf_0123456789abcdef01234567";
    const base = {
      creativeFamilyId: familyId,
      name: "V29-VA",
      assetKey: "video:123",
      aliases: ["V29-VA"],
      format: "Video",
      linkLabel: "Đang chạy",
      linkCount: 2,
      currentAdCount: 2,
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
        assetId: "asset_1",
        metaCreativeIds: ["creative_1"],
        adIds: ["ad_1"],
        campaignIds: ["campaign_1"],
        adAccountIds: ["act_1"],
        pageIds: ["page_1"],
      },
    } satisfies Omit<CreativeRow, "id" | "platform">;
    const rows: CreativeRow[] = [
      { ...base, id: "variant-android", platform: "Android" },
      { ...base, id: "variant-ios", platform: "iOS" },
    ];

    const detail = creativeFamilyContract(familyId, rows, freshness);

    expect(detail).toMatchObject({
      creative_family_id: familyId,
      asset_id: "asset_1",
      entity_links: {
        campaign_ids: ["campaign_1"],
      },
      freshness: {
        sync_status: "healthy",
      },
    });
    expect(detail?.variants).toHaveLength(2);
  });

  it("aggregates repeated sync warnings into a stable issue detail", () => {
    const runs: SyncRunView[] = [
      {
        id: "run-1",
        kind: "Đồng bộ",
        status: "partial",
        startedAt: "30/07/2026",
        finishedAt: "30/07/2026",
        startedAtIso: "2026-07-30T07:00:00.000Z",
        finishedAtIso: "2026-07-30T07:02:00.000Z",
        summary: "1 cảnh báo",
        warnings: [
          {
            code: "META_RESOURCE_FILTER_FALLBACK",
            resource: "act_123/ads",
            message: "Technical warning one",
          },
        ],
      },
      {
        id: "run-2",
        kind: "Đồng bộ",
        status: "partial",
        startedAt: "30/07/2026",
        finishedAt: "30/07/2026",
        startedAtIso: "2026-07-30T08:00:00.000Z",
        finishedAtIso: "2026-07-30T08:02:00.000Z",
        summary: "1 cảnh báo",
        warnings: [
          {
            code: "META_RESOURCE_FILTER_FALLBACK",
            resource: "act_123/ads",
            message: "Technical warning two",
          },
        ],
      },
    ];
    const issueId = dataHealthIssueDetails(runs)[0]?.issue.issueId;
    expect(issueId).toMatch(/^issue_[a-f0-9]{24}$/);

    const detail = dataHealthIssueContract(
      issueId as string,
      runs,
      freshness,
    );

    expect(detail).toMatchObject({
      issue_id: issueId,
      occurrence_count: 2,
      affected_group_count: 1,
      affected_entities: [
        {
          entity_type: "ad_account",
          entity_id: "act_123",
        },
      ],
    });
    expect(detail?.occurrences).toHaveLength(2);
    expect(detail?.user_message).not.toContain("META_RESOURCE");
  });
});
