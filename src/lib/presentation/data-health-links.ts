import {
  buildNavigationHref,
  type NavigationQueryInput,
} from "@/lib/navigation";
import type {
  CreativeRow,
  DataHealthAffectedEntity,
} from "@/types/view-models";

export type DataHealthEntityLinkContext = {
  query?: NavigationQueryInput;
  creatives?: readonly CreativeRow[];
};

function resolvedCreativeFamilyId(
  entity: DataHealthAffectedEntity,
  creatives: readonly CreativeRow[],
) {
  const familyIds = new Set<string>();
  for (const creative of creatives) {
    const links = creative.entityLinks;
    if (!links) continue;
    const matches =
      (entity.entityType === "meta_creative" &&
        links.metaCreativeIds.includes(entity.entityId)) ||
      (entity.entityType === "asset" &&
        links.assetId === entity.entityId) ||
      (entity.entityType === "ad" &&
        links.adIds.includes(entity.entityId));
    if (matches) {
      familyIds.add(
        creative.creativeFamilyId ?? links.creativeFamilyId,
      );
    }
  }
  return familyIds.size === 1 ? [...familyIds][0] : null;
}

export function dataHealthEntityHref(
  entity: DataHealthAffectedEntity,
  context: DataHealthEntityLinkContext = {},
) {
  const id = encodeURIComponent(entity.entityId);
  let destination: string | null = null;
  if (entity.entityType === "ad_account") {
    destination = `/sources?tab=ad-accounts&selected=${id}`;
  }
  else if (entity.entityType === "business") {
    destination = `/sources?tab=businesses&selected=${id}`;
  }
  else if (entity.entityType === "page") {
    destination = `/sources?tab=pages&selected=${id}`;
  }
  else if (entity.entityType === "connection") {
    destination = "/sources?tab=connection";
  }
  else if (
    entity.entityType === "campaign" &&
    /^\d{1,32}$/.test(entity.entityId)
  ) {
    destination = `/campaigns/${id}`;
  }
  else if (
    entity.entityType === "creative_family" &&
    /^cf_[a-f0-9]{24}$/.test(entity.entityId)
  ) {
    destination = `/creatives/${id}`;
  }
  else if (
    entity.entityType === "meta_creative" ||
    entity.entityType === "asset" ||
    entity.entityType === "ad"
  ) {
    const creativeFamilyId = resolvedCreativeFamilyId(
      entity,
      context.creatives ?? [],
    );
    if (creativeFamilyId) {
      const tab =
        entity.entityType === "ad"
          ? "usage"
          : entity.entityType === "meta_creative"
            ? "metadata"
            : "preview";
      destination = `/creatives/${encodeURIComponent(
        creativeFamilyId,
      )}?tab=${tab}`;
    }
  }
  else if (entity.entityType === "event_mapping") {
    destination = "/settings?tab=events";
  }

  if (!destination) return null;
  return context.query
    ? buildNavigationHref(destination, context.query)
    : destination;
}
