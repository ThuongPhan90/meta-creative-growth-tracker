import type { CreativeRow } from "@/types/view-models";

export const CREATIVE_BATCH_SIZE = 100;

export type CreativeAdStatusTone =
  | "active"
  | "paused"
  | "historical"
  | "unlinked";

export function getCreativeAdStatusPresentation(
  creative: Pick<
    CreativeRow,
    "activeAdCount" | "currentAdCount" | "linkCount"
  >,
): { label: string; tone: CreativeAdStatusTone } {
  if (creative.activeAdCount > 0) {
    return {
      label: `${creative.activeAdCount.toLocaleString("vi-VN")} đang chạy`,
      tone: "active",
    };
  }
  if (creative.currentAdCount > 0) {
    return {
      label: `${creative.currentAdCount.toLocaleString("vi-VN")} không chạy`,
      tone: "paused",
    };
  }
  if (creative.linkCount > 0) {
    return {
      label: `${creative.linkCount.toLocaleString("vi-VN")} liên kết cũ`,
      tone: "historical",
    };
  }
  return { label: "Chưa gắn Ads", tone: "unlinked" };
}

export function prioritizeCreatives(
  creatives: readonly CreativeRow[],
): CreativeRow[] {
  const tier = (creative: CreativeRow) =>
    creative.activeAdCount > 0
      ? 0
      : creative.currentAdCount > 0
        ? 1
        : creative.linkCount > 0
          ? 2
          : 3;

  return creatives
    .map((creative, index) => ({ creative, index }))
    .sort((left, right) => {
      const tierDifference = tier(left.creative) - tier(right.creative);
      if (tierDifference !== 0) return tierDifference;

      const activeDifference =
        right.creative.activeAdCount - left.creative.activeAdCount;
      if (activeDifference !== 0) return activeDifference;

      const spendDifference =
        (right.creative.performance?.spend ?? 0) -
        (left.creative.performance?.spend ?? 0);
      if (spendDifference !== 0) return spendDifference;

      return left.index - right.index;
    })
    .map(({ creative }) => creative);
}

export function countActiveCreativeAssets(
  creatives: readonly CreativeRow[],
): number {
  return new Set(
    creatives
      .filter((creative) => creative.activeAdCount > 0)
      .map((creative) => creative.assetKey),
  ).size;
}

export function resolveSelectedCreative(
  creatives: readonly CreativeRow[],
  selectedId: string | null,
): CreativeRow | null {
  if (selectedId === null) return null;
  return (
    creatives.find((creative) => creative.id === selectedId) ??
    creatives.at(0) ??
    null
  );
}
