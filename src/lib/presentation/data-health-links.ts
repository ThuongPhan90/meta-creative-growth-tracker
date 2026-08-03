import {
  buildNavigationHref,
  type NavigationQueryInput,
} from "@/lib/navigation";
import type {
  DataHealthCreativeReference,
  DataHealthAffectedEntity,
} from "@/types/view-models";

export type DataHealthEntityLinkContext = {
  query?: NavigationQueryInput;
  creatives?: readonly DataHealthCreativeReference[];
};

function resolvedCreativeFamilyId(
  entity: DataHealthAffectedEntity,
  creatives: readonly DataHealthCreativeReference[],
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
    entity.entityType === "campaign"
  ) {
    destination = /^\d{1,32}$/.test(entity.entityId)
      ? `/campaigns/${id}`
      : `/campaigns?q=${id}`;
  }
  else if (entity.entityType === "ad_set") {
    destination = "/campaigns";
  }
  else if (
    entity.entityType === "creative_family"
  ) {
    destination = /^cf_[a-f0-9]{24}$/.test(entity.entityId)
      ? `/creatives/${id}`
      : `/creatives?q=${id}`;
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
    } else {
      destination = `/creatives?q=${id}`;
    }
  }
  else if (entity.entityType === "event_mapping") {
    destination = "/settings?tab=results";
  }
  else if (entity.entityType === "post") {
    destination = "/creatives";
  }

  // Canonical entity types should already be exhausted above. Keep a safe,
  // related collection fallback so a future type can never create a dead end.
  if (!destination) destination = `/data-health?q=${id}`;
  return context.query
    ? buildNavigationHref(destination, context.query)
    : destination;
}
