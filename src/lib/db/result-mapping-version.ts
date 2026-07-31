import { createHash } from "node:crypto";

export type VersionedResultMapping = {
  canonicalResultKey: string;
  rawActionType: string;
  metricSource: "action" | "action_value";
  priority: number;
  enabled: boolean;
};

/**
 * Produces a stable version for the semantic mapping inputs used by the
 * first-match result resolver. Database ids and mapping provenance are
 * intentionally excluded because neither changes result attribution.
 */
export function computeResultMappingVersion(
  mappings: readonly VersionedResultMapping[],
): string {
  const canonical = mappings
    .map((mapping) => ({
      canonicalResultKey: mapping.canonicalResultKey.trim(),
      rawActionType: mapping.rawActionType.trim(),
      metricSource: mapping.metricSource,
      priority: mapping.priority,
      enabled: mapping.enabled,
    }))
    .sort(
      (left, right) =>
        left.canonicalResultKey.localeCompare(
          right.canonicalResultKey,
        ) ||
        left.metricSource.localeCompare(right.metricSource) ||
        left.priority - right.priority ||
        left.rawActionType.localeCompare(right.rawActionType) ||
        Number(left.enabled) - Number(right.enabled),
    );
  const digest = createHash("sha256")
    .update(JSON.stringify(canonical), "utf8")
    .digest("hex");
  return `result-map-v1:${digest}`;
}
