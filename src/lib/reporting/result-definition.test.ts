import { describe, expect, it } from "vitest";

import {
  aggregateResultMetricsAvailable,
  DEFAULT_RESULT_DEFINITIONS,
  hydrateResultDefinitions,
  resolveCanonicalResults,
  resolveMappedResultMetricSource,
  resolvePrimaryResult,
  resolveReportingResultMetricSource,
  type ResultDefinition,
  validateResultMappings,
} from "./result-definition";

describe("result definition engine", () => {
  it("uses ordered first-match aliases without adding omni duplicates", () => {
    const result = resolveCanonicalResults({
      actions: [
        { actionType: "purchase", value: 7 },
        { actionType: "omni_purchase", value: 7 },
      ],
    }).find((item) => item.canonicalKey === "purchase");

    expect(result).toMatchObject({
      value: 7,
      selectedActionType: "purchase",
      source: "action",
      rawValues: [
        { actionType: "purchase", value: 7, selected: true },
        { actionType: "omni_purchase", value: 7, selected: false },
      ],
    });
  });

  it("keeps action values separate from count results", () => {
    const results = resolveCanonicalResults({
      actions: [{ actionType: "purchase", value: 3 }],
      actionValues: [{ actionType: "purchase", value: 450 }],
    });

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalKey: "purchase",
          value: 3,
          source: "action",
        }),
        expect.objectContaining({
          canonicalKey: "purchase_value",
          value: 450,
          source: "action_value",
        }),
      ]),
    );
  });

  it("uses campaign override before ordered optimization mappings", () => {
    const resolution = resolvePrimaryResult({
      campaignId: "campaign_1",
      objectiveKey: "sales",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      campaignOverrides: [
        {
          campaignId: "campaign_1",
          canonicalResultKey: "purchase_value",
          enabled: true,
        },
      ],
      mappings: [
        {
          id: "mapping_purchase",
          canonicalResultKey: "purchase",
          priority: 1,
          optimizationGoals: ["OFFSITE_CONVERSIONS"],
          enabled: true,
        },
      ],
    });

    expect(resolution).toMatchObject({
      source: "campaign_override",
      definition: { canonicalKey: "purchase_value" },
    });
  });

  it("falls through mapping, objective default, workspace default and unresolved", () => {
    expect(
      resolvePrimaryResult({
        campaignId: "campaign_1",
        objectiveKey: "sales",
        optimizationGoal: "VALUE",
        mappings: [
          {
            id: "value_mapping",
            canonicalResultKey: "purchase_value",
            priority: 2,
            optimizationGoals: ["VALUE"],
            enabled: true,
          },
        ],
      }),
    ).toMatchObject({
      source: "optimization_mapping",
      definition: { canonicalKey: "purchase_value" },
    });

    expect(
      resolvePrimaryResult({
        campaignId: "campaign_2",
        objectiveKey: "traffic",
      }),
    ).toMatchObject({
      source: "objective_default",
      definition: { canonicalKey: "link_click" },
    });

    const customDefinitions: ResultDefinition[] = [
      {
        ...DEFAULT_RESULT_DEFINITIONS[0],
        defaultForObjective: false,
      },
    ];
    expect(
      resolvePrimaryResult({
        campaignId: "campaign_3",
        objectiveKey: "custom",
        workspaceDefaultResultKey: "reach",
        definitions: customDefinitions,
      }),
    ).toMatchObject({
      source: "workspace_default",
      definition: { canonicalKey: "reach" },
    });
    expect(
      resolvePrimaryResult({
        campaignId: "campaign_4",
        objectiveKey: "custom",
        definitions: customDefinitions,
      }),
    ).toEqual({ definition: null, source: "unresolved" });
  });

  it("never exposes an aggregate Result or Cost/Result for all objectives", () => {
    expect(
      resolvePrimaryResult({
        campaignId: "campaign_1",
        objectiveKey: "all",
        workspaceDefaultResultKey: "install",
      }),
    ).toEqual({ definition: null, source: "all_objectives" });
    expect(
      aggregateResultMetricsAvailable({
        objectiveKey: "all",
        primaryResultKey: "install",
      }),
    ).toBe(false);
  });

  it("uses Install only as the app-promotion default", () => {
    expect(
      resolvePrimaryResult({
        campaignId: "app_campaign",
        objectiveKey: "app_promotion",
      }),
    ).toMatchObject({
      source: "objective_default",
      definition: { canonicalKey: "install" },
    });
    expect(
      resolvePrimaryResult({
        campaignId: "lead_campaign",
        objectiveKey: "leads",
      }),
    ).toMatchObject({
      definition: { canonicalKey: "lead" },
    });
  });

  it("hydrates ordered action and action-value aliases from persistence", () => {
    const definitions = hydrateResultDefinitions({
      definitions: DEFAULT_RESULT_DEFINITIONS.filter(
        (definition) =>
          definition.canonicalKey === "purchase" ||
          definition.canonicalKey === "purchase_value",
      ),
      mappings: [
        {
          id: "3",
          canonicalResultKey: "purchase",
          rawActionType: "omni_purchase",
          metricSource: "action",
          priority: 2,
          mappingSource: "owner",
          enabled: true,
        },
        {
          id: "1",
          canonicalResultKey: "purchase",
          rawActionType: "purchase",
          metricSource: "action",
          priority: 0,
          mappingSource: "system",
          enabled: true,
        },
        {
          id: "2",
          canonicalResultKey: "purchase_value",
          rawActionType: "purchase",
          metricSource: "action_value",
          priority: 0,
          mappingSource: "system",
          enabled: true,
        },
      ],
    });

    expect(hydrated(definitions, "purchase").rawActionTypes).toEqual([
      "purchase",
      "omni_purchase",
    ]);
    expect(
      hydrated(definitions, "purchase_value").rawValueActionTypes,
    ).toEqual(["purchase"]);
  });

  it("uses an owner-remapped action source for a currency Result", () => {
    const definitions = hydrateResultDefinitions({
      definitions: DEFAULT_RESULT_DEFINITIONS.filter(
        (definition) =>
          definition.canonicalKey === "purchase_value",
      ),
      mappings: [
        {
          id: "owner-action",
          canonicalResultKey: "purchase_value",
          rawActionType: "purchase",
          metricSource: "action",
          priority: 0,
          mappingSource: "owner",
          enabled: true,
        },
      ],
    });
    const definition = hydrated(definitions, "purchase_value");

    expect(definition.rawActionTypes).toEqual(["purchase"]);
    expect(definition.rawValueActionTypes).toEqual([]);
    expect(resolveMappedResultMetricSource(definition)).toBe("action");
    expect(resolveReportingResultMetricSource(definition)).toBe(
      "action",
    );
    expect(
      resolveCanonicalResults({
        actions: [{ actionType: "purchase", value: 3 }],
        actionValues: [{ actionType: "purchase", value: 450 }],
        definitions,
      }),
    ).toEqual([
      expect.objectContaining({
        canonicalKey: "purchase_value",
        source: "action",
        value: 3,
      }),
    ]);
  });

  it("keeps the default currency Result on action-value aliases", () => {
    const definition = DEFAULT_RESULT_DEFINITIONS.find(
      (item) => item.canonicalKey === "purchase_value",
    )!;

    expect(resolveMappedResultMetricSource(definition)).toBe(
      "action_value",
    );
    expect(resolveReportingResultMetricSource(definition)).toBe(
      "action_value",
    );
  });

  it("fails closed when persisted aliases are disabled or ambiguous", () => {
    const definition = DEFAULT_RESULT_DEFINITIONS.find(
      (item) => item.canonicalKey === "purchase_value",
    )!;
    const disabled = hydrateResultDefinitions({
      definitions: [definition],
      mappings: [
        {
          id: "disabled-value",
          canonicalResultKey: "purchase_value",
          rawActionType: "purchase",
          metricSource: "action_value",
          priority: 0,
          mappingSource: "owner",
          enabled: false,
        },
      ],
    })[0];
    const ambiguous = hydrateResultDefinitions({
      definitions: [definition],
      mappings: [
        {
          id: "owner-action",
          canonicalResultKey: "purchase_value",
          rawActionType: "purchase",
          metricSource: "action",
          priority: 0,
          mappingSource: "owner",
          enabled: true,
        },
        {
          id: "owner-value",
          canonicalResultKey: "purchase_value",
          rawActionType: "purchase",
          metricSource: "action_value",
          priority: 0,
          mappingSource: "owner",
          enabled: true,
        },
      ],
    })[0];

    expect(resolveMappedResultMetricSource(disabled)).toBeNull();
    expect(resolveReportingResultMetricSource(disabled)).toBeNull();
    expect(resolveMappedResultMetricSource(ambiguous)).toBeNull();
    expect(
      resolveCanonicalResults({
        actions: [{ actionType: "purchase", value: 3 }],
        actionValues: [{ actionType: "purchase", value: 450 }],
        definitions: [disabled, ambiguous],
      }),
    ).toEqual([]);
  });

  it("rejects cross-result raw action ownership and duplicate priorities", () => {
    const definitions = DEFAULT_RESULT_DEFINITIONS;
    expect(
      validateResultMappings({
        definitions,
        mappings: [
          {
            canonicalResultKey: "purchase",
            rawActionType: "purchase",
            metricSource: "action",
            priority: 0,
            enabled: true,
          },
          {
            canonicalResultKey: "lead",
            rawActionType: "purchase",
            metricSource: "action",
            priority: 0,
            enabled: true,
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      code: "RAW_ACTION_OWNERSHIP_CONFLICT",
    });

    expect(
      validateResultMappings({
        definitions,
        mappings: [
          {
            canonicalResultKey: "purchase",
            rawActionType: "purchase",
            metricSource: "action",
            priority: 0,
            enabled: true,
          },
          {
            canonicalResultKey: "purchase",
            rawActionType: "omni_purchase",
            metricSource: "action",
            priority: 0,
            enabled: true,
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      code: "RESULT_MAPPING_PRIORITY_CONFLICT",
    });
  });

  it("allows the same raw type in count and value sources", () => {
    expect(
      validateResultMappings({
        definitions: DEFAULT_RESULT_DEFINITIONS,
        mappings: [
          {
            canonicalResultKey: "purchase",
            rawActionType: "purchase",
            metricSource: "action",
            priority: 0,
            enabled: true,
          },
          {
            canonicalResultKey: "purchase_value",
            rawActionType: "purchase",
            metricSource: "action_value",
            priority: 0,
            enabled: true,
          },
        ],
      }),
    ).toMatchObject({ ok: true });
  });
});

function hydrated(
  definitions: readonly ResultDefinition[],
  canonicalKey: string,
) {
  const definition = definitions.find(
    (item) => item.canonicalKey === canonicalKey,
  );
  if (!definition) throw new Error(`Missing ${canonicalKey}`);
  return definition;
}
