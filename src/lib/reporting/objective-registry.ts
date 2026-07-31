export type ObjectiveDefinition = {
  key: string;
  label: string;
  rawObjectiveKeys: readonly string[];
  legacyKeys?: readonly string[];
};

export type ResolvedObjective = {
  key: string;
  label: string;
  rawObjectiveKey: string | null;
  known: boolean;
};

export const DEFAULT_OBJECTIVE_REGISTRY: readonly ObjectiveDefinition[] =
  [
    {
      key: "awareness",
      label: "Nhận diện",
      rawObjectiveKeys: [
        "OUTCOME_AWARENESS",
        "BRAND_AWARENESS",
        "REACH",
      ],
    },
    {
      key: "traffic",
      label: "Lưu lượng truy cập",
      rawObjectiveKeys: ["OUTCOME_TRAFFIC", "LINK_CLICKS"],
    },
    {
      key: "engagement",
      label: "Tương tác",
      rawObjectiveKeys: [
        "OUTCOME_ENGAGEMENT",
        "POST_ENGAGEMENT",
        "VIDEO_VIEWS",
        "MESSAGES",
      ],
    },
    {
      key: "leads",
      label: "Khách hàng tiềm năng",
      rawObjectiveKeys: ["OUTCOME_LEADS", "LEAD_GENERATION"],
      legacyKeys: ["lead_generation"],
    },
    {
      key: "app_promotion",
      label: "Quảng bá ứng dụng",
      rawObjectiveKeys: ["OUTCOME_APP_PROMOTION", "APP_INSTALLS"],
    },
    {
      key: "sales",
      label: "Doanh số",
      rawObjectiveKeys: [
        "OUTCOME_SALES",
        "CONVERSIONS",
        "PRODUCT_CATALOG_SALES",
      ],
    },
  ];

function normalized(value: string) {
  return value.trim().toUpperCase();
}

export function resolveObjective(
  value: string | null | undefined,
  registry: readonly ObjectiveDefinition[] = DEFAULT_OBJECTIVE_REGISTRY,
): ResolvedObjective {
  const input = value?.trim() ?? "";
  const lookup = normalized(input);
  const definition = registry.find(
    (item) =>
      normalized(item.key) === lookup ||
      item.rawObjectiveKeys.some((key) => normalized(key) === lookup) ||
      item.legacyKeys?.some((key) => normalized(key) === lookup),
  );

  if (definition) {
    const isCanonical = normalized(definition.key) === lookup;
    return {
      key: definition.key,
      label: definition.label,
      rawObjectiveKey: isCanonical || !input ? null : input,
      known: true,
    };
  }

  return {
    key: input ? input.toLowerCase() : "unknown",
    label: "Mục tiêu khác",
    rawObjectiveKey: input || null,
    known: false,
  };
}

export function objectiveLabel(
  value: string | null | undefined,
  registry: readonly ObjectiveDefinition[] = DEFAULT_OBJECTIVE_REGISTRY,
) {
  return resolveObjective(value, registry).label;
}

/**
 * Expands one canonical Objective into the normalized values that may be
 * stored in Meta Campaign `objective`. An empty list means no filter.
 */
export function objectiveDatabaseKeys(
  value: string | null | undefined,
  registry: readonly ObjectiveDefinition[] = DEFAULT_OBJECTIVE_REGISTRY,
) {
  const input = value?.trim() ?? "";
  if (!input || input.toLowerCase() === "all") return [];
  const resolved = resolveObjective(input, registry);
  const definition = registry.find(
    (item) => item.key === resolved.key,
  );
  if (!definition) {
    return [normalized(resolved.rawObjectiveKey ?? resolved.key)];
  }
  return [
    ...new Set(
      [
        definition.key,
        ...definition.rawObjectiveKeys,
        ...(definition.legacyKeys ?? []),
      ].map(normalized),
    ),
  ];
}
