import {
  buildNavigationHref,
  type NavigationQueryInput,
} from "@/lib/navigation";
import type { DataHealthAffectedEntity } from "@/types/view-models";

export function dataHealthEntityHref(
  entity: DataHealthAffectedEntity,
  context?: NavigationQueryInput,
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
  else if (entity.entityType === "campaign") {
    destination = `/campaigns/${id}`;
  }
  else if (entity.entityType === "creative_family") {
    destination = `/creatives/${id}`;
  }

  if (!destination) return null;
  return context ? buildNavigationHref(destination, context) : destination;
}
