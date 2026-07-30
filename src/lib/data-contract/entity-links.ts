import type { EntityLink } from "@/types/view-models";

export type EntityLinkInput = {
  creativeFamilyId: string;
  assetId: string;
  metaCreativeIds?: readonly string[];
  adIds?: readonly string[];
  campaignIds?: readonly string[];
  adAccountIds?: readonly string[];
  pageIds?: readonly string[];
};

function canonicalId(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} cannot be empty`);
  return trimmed;
}

function stableUnique(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

export function createEntityLink(input: EntityLinkInput): EntityLink {
  return {
    creativeFamilyId: canonicalId(
      input.creativeFamilyId,
      "creativeFamilyId",
    ),
    assetId: canonicalId(input.assetId, "assetId"),
    metaCreativeIds: stableUnique(input.metaCreativeIds),
    adIds: stableUnique(input.adIds),
    campaignIds: stableUnique(input.campaignIds),
    adAccountIds: stableUnique(input.adAccountIds),
    pageIds: stableUnique(input.pageIds),
  };
}
