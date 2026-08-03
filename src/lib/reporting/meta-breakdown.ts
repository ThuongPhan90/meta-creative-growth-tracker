import { objectiveLabel } from "./objective-registry";

export const META_BREAKDOWN_DIMENSIONS = [
  "ad_account",
  "objective",
  "campaign",
  "placement",
  "meta_platform",
] as const;

export type MetaBreakdownDimension =
  (typeof META_BREAKDOWN_DIMENSIONS)[number];

export type MetaBreakdownSourceRow = {
  adAccountMetaId: string;
  adAccountName: string | null;
  campaignMetaId: string;
  campaignName: string | null;
  /** Canonical Objective only when the stored Meta Objective has a registry mapping. */
  objectiveKey: string | null;
  publisherPlatform: string;
  platformPosition: string;
  currency: string;
  spend: number;
  impressions: number;
  linkClicks: number;
};

export type MetaBreakdownUnavailableReason =
  | "no_data"
  | "split_currency"
  | "unknown_currency"
  | "detail_unavailable"
  | "entity_identity_unavailable"
  | "placement_breakdown_unavailable"
  | "meta_platform_breakdown_unavailable";

export type MetaBreakdownRow = {
  id: string;
  label: string;
  spend: number;
  impressions: number;
  linkClicks: number;
};

export type MetaBreakdownDimensionData = {
  state: "ready" | "partial" | "unavailable";
  rows: MetaBreakdownRow[];
  reason?: MetaBreakdownUnavailableReason;
};

export type MetaBreakdownModel = {
  currency: string | null;
  dimensions: Record<MetaBreakdownDimension, MetaBreakdownDimensionData>;
};

function emptyDimension(
  reason: MetaBreakdownUnavailableReason,
): MetaBreakdownDimensionData {
  return { state: "unavailable", rows: [], reason };
}

function emptyModel(reason: MetaBreakdownUnavailableReason): MetaBreakdownModel {
  return {
    currency: null,
    dimensions: Object.fromEntries(
      META_BREAKDOWN_DIMENSIONS.map((dimension) => [
        dimension,
        emptyDimension(reason),
      ]),
    ) as Record<MetaBreakdownDimension, MetaBreakdownDimensionData>,
  };
}

function text(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function currency(value: string | null | undefined) {
  const normalized = text(value).toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function number(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function humanizeMetaValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function metaPlatformLabel(value: string) {
  switch (value.trim().toLowerCase()) {
    case "facebook":
      return "Facebook";
    case "instagram":
      return "Instagram";
    case "messenger":
      return "Messenger";
    case "audience_network":
      return "Audience Network";
    default:
      return null;
  }
}

function aggregate(
  rows: readonly MetaBreakdownSourceRow[],
  select: (row: MetaBreakdownSourceRow) => {
    id: string;
    label: string;
  },
) {
  const grouped = new Map<string, MetaBreakdownRow>();
  for (const row of rows) {
    const group = select(row);
    const current = grouped.get(group.id) ?? {
      id: group.id,
      label: group.label,
      spend: 0,
      impressions: 0,
      linkClicks: 0,
    };
    current.spend += number(row.spend);
    current.impressions += number(row.impressions);
    current.linkClicks += number(row.linkClicks);
    grouped.set(group.id, current);
  }
  return [...grouped.values()].sort(
    (left, right) =>
      right.spend - left.spend || left.label.localeCompare(right.label, "vi"),
  );
}

/**
 * Builds the compact Overview breakdown only from entity-level, additive Meta
 * delivery facts. It deliberately fails closed for a dimension if a sync
 * fallback omitted that exact dimension (stored as `ALL`).
 */
export function buildMetaBreakdown(
  sourceRows: readonly MetaBreakdownSourceRow[],
): MetaBreakdownModel {
  if (sourceRows.length === 0) return emptyModel("no_data");

  const currencies = new Set<string>();
  let invalidCurrency = false;
  for (const row of sourceRows) {
    const value = currency(row.currency);
    if (value) currencies.add(value);
    else invalidCurrency = true;
  }
  if (invalidCurrency) return emptyModel("unknown_currency");
  if (currencies.size !== 1) return emptyModel("split_currency");
  const selectedCurrency = [...currencies][0] ?? null;

  const identitiesReady = sourceRows.every(
    (row) =>
      Boolean(text(row.adAccountMetaId)) && Boolean(text(row.campaignMetaId)),
  );
  if (!identitiesReady) {
    return {
      currency: selectedCurrency,
      dimensions: Object.fromEntries(
        META_BREAKDOWN_DIMENSIONS.map((dimension) => [
          dimension,
          emptyDimension("entity_identity_unavailable"),
        ]),
      ) as Record<MetaBreakdownDimension, MetaBreakdownDimensionData>,
    };
  }

  const unmappedObjective = sourceRows.some((row) => !text(row.objectiveKey));
  const placementReady = sourceRows.every(
    (row) => {
      const value = text(row.platformPosition).toLowerCase();
      return value.length > 0 && value !== "all";
    },
  );
  const metaPlatformReady = sourceRows.every((row) =>
    Boolean(metaPlatformLabel(row.publisherPlatform)),
  );

  return {
    currency: selectedCurrency,
    dimensions: {
      ad_account: {
        state: "ready",
        rows: aggregate(sourceRows, (row) => {
          const id = text(row.adAccountMetaId);
          const name = text(row.adAccountName);
          return {
            id,
            label: name ? `${name} · ${id}` : id,
          };
        }),
      },
      objective: {
        state: unmappedObjective ? "partial" : "ready",
        rows: aggregate(sourceRows, (row) => {
          const key = text(row.objectiveKey);
          return key
            ? { id: key, label: objectiveLabel(key) }
            : {
                id: "meta-objective-unmapped",
                label: "Mục tiêu Meta chưa map",
              };
        }),
      },
      campaign: {
        state: "ready",
        rows: aggregate(sourceRows, (row) => {
          const id = text(row.campaignMetaId);
          const name = text(row.campaignName);
          return {
            id,
            label: name ? `${name} · ${id}` : id,
          };
        }),
      },
      placement: placementReady
        ? {
            state: "ready",
            rows: aggregate(sourceRows, (row) => {
              const value = text(row.platformPosition);
              return { id: value, label: humanizeMetaValue(value) || value };
            }),
          }
        : emptyDimension("placement_breakdown_unavailable"),
      meta_platform: metaPlatformReady
        ? {
            state: "ready",
            rows: aggregate(sourceRows, (row) => {
              const value = text(row.publisherPlatform).toLowerCase();
              return {
                id: value,
                label: metaPlatformLabel(value) ?? value,
              };
            }),
          }
        : emptyDimension("meta_platform_breakdown_unavailable"),
    },
  };
}

/** Use for non-detail contexts such as demo mode or an unavailable snapshot. */
export function unavailableMetaBreakdown(
  reason: Extract<
    MetaBreakdownUnavailableReason,
    "detail_unavailable" | "no_data" | "split_currency" | "unknown_currency"
  > = "detail_unavailable",
) {
  return emptyModel(reason);
}
