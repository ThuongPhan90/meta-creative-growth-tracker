import type {
  DataHealthCreativeReference,
  EventHealth,
} from "@/types/view-models";

export type CoverageDimension = {
  key:
    | "campaign"
    | "ad"
    | "creative"
    | "event"
    | "delivery_ready_account";
  label: string;
  covered: number;
  total: number;
  ratio: number | null;
  detail: string;
  missingFamilyIds: string[];
  missingAccountMetaIds?: string[];
  state?: "ready" | "partial" | "unavailable";
};

/**
 * The delivery denominator is the number of operational accounts with active
 * Ads, as resolved by the current live-delivery snapshot. It is intentionally
 * separate from the Creative Family denominator used by link coverage.
 */
export type DeliveryReadyAccountCoverage = {
  selectedAccountCount: number;
  deliveryEligibleAccountCount: number;
  deliveryReadyAccountCount: number;
  state: "ready" | "partial" | "unavailable";
  accounts?: readonly {
    metaAdAccountId: string;
    deliveryEligible: boolean;
    deliveryState: "ready" | "stale" | "unavailable";
  }[];
};

function ratio(covered: number, total: number) {
  return total > 0 ? covered / total : 0;
}

/**
 * Coverage here is deliberately based on records already synchronized into
 * the tracker. It does not claim that the tracker knows the complete Meta
 * catalog when Meta has not returned a denominator.
 */
export function buildDataHealthCoverage(
  creatives: readonly DataHealthCreativeReference[],
  events: readonly EventHealth[],
  delivery?: DeliveryReadyAccountCoverage,
): CoverageDimension[] {
  const families = new Map<
    string,
    {
      canonical: boolean;
      campaignLinked: boolean;
      adLinked: boolean;
    }
  >();

  for (const creative of creatives) {
    const familyId = creative.creativeFamilyId?.trim() || creative.id;
    const existing = families.get(familyId) ?? {
      canonical: false,
      campaignLinked: false,
      adLinked: false,
    };
    existing.canonical ||= Boolean(creative.creativeFamilyId?.trim());
    existing.campaignLinked ||= Boolean(
      creative.entityLinks?.campaignIds.length,
    );
    existing.adLinked ||= Boolean(creative.entityLinks?.adIds.length);
    families.set(familyId, existing);
  }

  const familyValues = [...families.values()];
  const familyEntries = [...families.entries()];
  const familyTotal = familyValues.length;
  const campaignCovered = familyValues.filter(
    (family) => family.campaignLinked,
  ).length;
  const adCovered = familyValues.filter((family) => family.adLinked).length;
  const creativeCovered = familyValues.filter(
    (family) => family.canonical,
  ).length;
  const eventTotal = events.length * 2;
  const eventCovered = events.reduce(
    (sum, event) =>
      sum +
      [event.android, event.ios].filter((status) => status === "ready")
        .length,
    0,
  );

  const dimensions: CoverageDimension[] = [
    {
      key: "campaign",
      label: "Campaign coverage",
      covered: campaignCovered,
      total: familyTotal,
      ratio: ratio(campaignCovered, familyTotal),
      detail: `${campaignCovered}/${familyTotal} Creative Family có liên kết Campaign`,
      missingFamilyIds: familyEntries
        .filter(([, family]) => !family.campaignLinked)
        .map(([familyId]) => familyId),
    },
    {
      key: "ad",
      label: "Ad coverage",
      covered: adCovered,
      total: familyTotal,
      ratio: ratio(adCovered, familyTotal),
      detail: `${adCovered}/${familyTotal} Creative Family có liên kết Ad`,
      missingFamilyIds: familyEntries
        .filter(([, family]) => !family.adLinked)
        .map(([familyId]) => familyId),
    },
    {
      key: "creative",
      label: "Creative coverage",
      covered: creativeCovered,
      total: familyTotal,
      ratio: ratio(creativeCovered, familyTotal),
      detail: `${creativeCovered}/${familyTotal} Creative Family có ID canonical`,
      missingFamilyIds: familyEntries
        .filter(([, family]) => !family.canonical)
        .map(([familyId]) => familyId),
    },
    {
      key: "event",
      label: "Result mapping coverage",
      covered: eventCovered,
      total: eventTotal,
      ratio: ratio(eventCovered, eventTotal),
      detail: `${eventCovered}/${eventTotal} mapping Result theo Objective sẵn sàng`,
      missingFamilyIds: [],
    },
  ];

  if (delivery) {
    const eligible = Math.max(0, delivery.deliveryEligibleAccountCount);
    const ready = Math.min(
      eligible,
      Math.max(0, delivery.deliveryReadyAccountCount),
    );
    const unavailable = delivery.state === "unavailable";
    const missingAccountMetaIds = (delivery.accounts ?? [])
      .filter(
        (account) =>
          account.deliveryEligible && account.deliveryState !== "ready",
      )
      .map((account) => account.metaAdAccountId)
      .filter(Boolean);
    dimensions.push({
      key: "delivery_ready_account",
      label: "Delivery-ready account coverage",
      covered: ready,
      total: eligible,
      ratio: unavailable || eligible === 0 ? null : ratio(ready, eligible),
      detail:
        unavailable
          ? "Snapshot delivery chưa khả dụng cho scope hiện tại; hệ thống không suy diễn coverage 0% hoặc 100%."
          : eligible > 0
          ? `${ready}/${eligible} Ad Account đủ điều kiện delivery có snapshot mới và cùng ngày dữ liệu`
          : delivery.selectedAccountCount > 0
            ? "Không có Ad Account đủ điều kiện delivery trong scope hiện tại"
            : "Scope hiện tại chưa có Ad Account để đánh giá delivery",
      missingFamilyIds: [],
      missingAccountMetaIds,
      state: delivery.state,
    });
  }

  return dimensions;
}
