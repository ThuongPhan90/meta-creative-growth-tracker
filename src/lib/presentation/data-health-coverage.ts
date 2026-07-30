import type {
  CreativeRow,
  EventHealth,
} from "@/types/view-models";

export type CoverageDimension = {
  key: "campaign" | "ad" | "creative" | "event";
  label: string;
  covered: number;
  total: number;
  ratio: number;
  detail: string;
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
  creatives: readonly CreativeRow[],
  events: readonly EventHealth[],
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

  return [
    {
      key: "campaign",
      label: "Campaign coverage",
      covered: campaignCovered,
      total: familyTotal,
      ratio: ratio(campaignCovered, familyTotal),
      detail: `${campaignCovered}/${familyTotal} Creative Family có liên kết Campaign`,
    },
    {
      key: "ad",
      label: "Ad coverage",
      covered: adCovered,
      total: familyTotal,
      ratio: ratio(adCovered, familyTotal),
      detail: `${adCovered}/${familyTotal} Creative Family có liên kết Ad`,
    },
    {
      key: "creative",
      label: "Creative coverage",
      covered: creativeCovered,
      total: familyTotal,
      ratio: ratio(creativeCovered, familyTotal),
      detail: `${creativeCovered}/${familyTotal} Creative Family có ID canonical`,
    },
    {
      key: "event",
      label: "Event coverage",
      covered: eventCovered,
      total: eventTotal,
      ratio: ratio(eventCovered, eventTotal),
      detail: `${eventCovered}/${eventTotal} mapping Install/Registration theo OS sẵn sàng`,
    },
  ];
}
