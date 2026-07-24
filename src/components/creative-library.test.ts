import { describe, expect, it } from "vitest";

import type { CreativeRow } from "@/types/view-models";
import {
  countActiveCreativeAssets,
  CREATIVE_BATCH_SIZE,
  getCreativeAdStatusPresentation,
  prioritizeCreatives,
  resolveSelectedCreative,
} from "./creative-library-logic";

function creative(
  id: string,
  input: Partial<CreativeRow> = {},
): CreativeRow {
  return {
    id,
    name: id,
    assetKey: `video:${id}`,
    aliases: [],
    format: "Video",
    platform: "Android",
    linkLabel: "Ads",
    linkCount: 0,
    currentAdCount: 0,
    activeAdCount: 0,
    readiness: "Chưa gắn Ads",
    performanceLabel: "Chưa có dữ liệu",
    imageUrl: "/creative-placeholder.svg",
    duration: null,
    ratio: null,
    pageName: null,
    eventMapping: { install: null, registration: null },
    performance: null,
    ...input,
  };
}

describe("creative ad priority", () => {
  it("places active Ads before paused, historical and unlinked creative", () => {
    const result = prioritizeCreatives([
      creative("unlinked"),
      creative("historical", { linkCount: 2 }),
      creative("paused", { linkCount: 2, currentAdCount: 2 }),
      creative("active-low", {
        linkCount: 1,
        currentAdCount: 1,
        activeAdCount: 1,
      }),
      creative("active-high", {
        linkCount: 3,
        currentAdCount: 3,
        activeAdCount: 3,
      }),
    ]);

    expect(result.map((item) => item.id)).toEqual([
      "active-high",
      "active-low",
      "paused",
      "historical",
      "unlinked",
    ]);
  });

  it("uses operational blue/neutral states independently from performance", () => {
    expect(
      getCreativeAdStatusPresentation({
        activeAdCount: 2,
        currentAdCount: 3,
        linkCount: 4,
      }),
    ).toEqual({ label: "2 đang chạy", tone: "active" });
    expect(
      getCreativeAdStatusPresentation({
        activeAdCount: 0,
        currentAdCount: 2,
        linkCount: 2,
      }),
    ).toEqual({ label: "2 không chạy", tone: "paused" });
  });

  it("counts each active physical asset once across performance rows", () => {
    expect(
      countActiveCreativeAssets([
        creative("android", {
          assetKey: "video:shared",
          activeAdCount: 1,
        }),
        creative("ios", {
          assetKey: "video:shared",
          activeAdCount: 1,
        }),
        creative("other", {
          assetKey: "video:other",
          activeAdCount: 1,
        }),
      ]),
    ).toBe(2);
  });

  it("keeps the initial render window compact for large libraries", () => {
    expect(CREATIVE_BATCH_SIZE).toBe(100);
  });

  it("moves the detail panel to the first visible result after filtering", () => {
    const visible = [creative("welcome"), creative("registration")];

    expect(resolveSelectedCreative(visible, "onboarding")?.id).toBe(
      "welcome",
    );
    expect(resolveSelectedCreative(visible, "registration")?.id).toBe(
      "registration",
    );
    expect(resolveSelectedCreative(visible, null)).toBeNull();
    expect(resolveSelectedCreative([], "onboarding")).toBeNull();
  });
});
