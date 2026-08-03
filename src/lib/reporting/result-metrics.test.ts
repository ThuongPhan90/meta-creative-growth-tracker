import { describe, expect, it } from "vitest";

import type { ReportingContext } from "./report-context";
import {
  DEFAULT_RESULT_DEFINITIONS,
  type ResultDefinition,
} from "./result-definition";
import {
  buildDynamicResultMetrics,
  withDeliveryBackedResultValues,
} from "./result-metrics";

function context(
  input: Partial<ReportingContext> = {},
): ReportingContext {
  return {
    businessIds: ["business_1"],
    adAccountIds: ["act_1"],
    dateFrom: "2026-07-01",
    dateTo: "2026-07-31",
    compareMode: "previous_period",
    objectiveKey: "sales",
    primaryResultKey: "purchase",
    currency: "USD",
    currencyMode: "single",
    reportingTimezoneMode: "account_local",
    attributionSettingKey: "account_default",
    actionReportTime: "conversion",
    syncVersion: "sync_1",
    ...input,
  };
}

describe("dynamic result metrics", () => {
  it("builds delivery KPIs from the same scoped totals in a stable order", () => {
    const model = buildDynamicResultMetrics({
      context: context({
        objectiveKey: "all",
        primaryResultKey: undefined,
      }),
      definitions: [],
      canonicalResults: [],
      spend: 100,
      impressions: 1_000,
      reach: 800,
      clicks: 100,
      value: null,
    });

    expect(model.kpiCards.map((card) => card.key)).toEqual([
      "spend",
      "impressions",
      "link_clicks",
      "link_ctr",
      "link_cpc",
      "reach",
      "frequency",
      "cpm",
    ]);
    expect(
      model.kpiCards.filter((card) => card.key.startsWith("link_")),
    ).toEqual([
      expect.objectContaining({
        key: "link_clicks",
        value: 100,
        valueType: "count",
        formula: "Meta-reported Link Clicks",
      }),
      expect.objectContaining({
        key: "link_ctr",
        value: 10,
        valueType: "percent",
        formula: "Link Clicks / Impressions × 100",
      }),
      expect.objectContaining({
        key: "link_cpc",
        value: 1,
        valueType: "currency",
        formula: "Spend / Link Clicks",
      }),
    ]);
  });

  it("keeps verified zero delivery values while marking zero denominators unavailable", () => {
    const model = buildDynamicResultMetrics({
      context: context({
        objectiveKey: "all",
        primaryResultKey: undefined,
      }),
      definitions: [],
      canonicalResults: [],
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      value: null,
    });

    expect(
      model.kpiCards.find((card) => card.key === "spend"),
    ).toMatchObject({ value: 0 });
    expect(
      model.kpiCards.find((card) => card.key === "link_clicks"),
    ).toMatchObject({ value: 0 });
    for (const key of ["link_ctr", "link_cpc", "frequency", "cpm"]) {
      expect(model.kpiCards.find((card) => card.key === key)).toMatchObject({
        value: null,
        unavailableReason: "zero_denominator",
      });
    }
  });

  it("builds correctly labelled Result, Cost, columns and scatter for one result", () => {
    const model = buildDynamicResultMetrics({
      context: context(),
      definitions: DEFAULT_RESULT_DEFINITIONS,
      canonicalResults: [
        {
          canonicalKey: "purchase",
          objectiveKey: "sales",
          value: 4,
          hasData: true,
        },
      ],
      spend: 100,
      impressions: 10_000,
      reach: 8_000,
      clicks: 200,
      value: 600,
    });

    expect(model.kpiCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "result:purchase",
          label: "Meta-attributed Purchase",
          value: 4,
          attribution: "meta_attributed",
        }),
        expect.objectContaining({
          key: "efficiency:purchase",
          label: "Cost/Purchase",
          value: 25,
          attribution: "meta_attributed",
        }),
      ]),
    );
    expect(model.dynamicTableColumns).toEqual([
      expect.objectContaining({
        key: "result:purchase",
        label: "Meta-attributed Purchase",
        sortable: true,
      }),
      expect.objectContaining({
        key: "efficiency:purchase",
        label: "Cost/Purchase",
        sortable: true,
      }),
    ]);
    expect(model.scatter).toMatchObject({
      enabled: true,
      x: { metric: "spend", label: "Spend" },
      y: {
        metric: "efficiency:purchase",
        label: "Cost/Purchase",
      },
      bubbleSize: {
        metric: "result:purchase",
        label: "Meta-attributed Purchase",
      },
    });
    expect(model.metadata).toMatchObject({
      resultAttribution: "meta_attributed",
      costSortMode: "single_result",
      primaryResultKey: "purchase",
    });
  });

  it("never creates aggregate Result, Cost or cost sorting across objectives", () => {
    const model = buildDynamicResultMetrics({
      context: context({
        objectiveKey: "all",
        primaryResultKey: undefined,
      }),
      definitions: DEFAULT_RESULT_DEFINITIONS,
      canonicalResults: [
        {
          canonicalKey: "lead",
          objectiveKey: "leads",
          value: 10,
          spend: 200,
          hasData: true,
        },
        {
          canonicalKey: "purchase",
          objectiveKey: "sales",
          value: 2,
          spend: 100,
          hasData: true,
        },
      ],
      spend: 300,
      impressions: 20_000,
      reach: 15_000,
      clicks: 500,
      value: 400,
    });

    expect(
      model.kpiCards.some(
        (card) =>
          card.key.startsWith("result:") ||
          card.key.startsWith("efficiency:"),
      ),
    ).toBe(false);
    expect(model.dynamicTableColumns).toEqual([]);
    expect(model.scatter).toMatchObject({
      enabled: false,
      unavailableReason: "all_objectives",
    });
    expect(model.metadata.costSortMode).toBe(
      "disabled_cross_objective",
    );
    expect(model.crossObjectiveSections).toEqual([
      expect.objectContaining({
        objectiveKey: "leads",
        objectiveLabel: "Khách hàng tiềm năng",
        costSortAllowed: false,
        results: [
          expect.objectContaining({
            canonicalKey: "lead",
            value: 10,
            efficiencyLabel: "Cost/Lead",
            costPerResult: 20,
            attribution: "meta_attributed",
          }),
        ],
      }),
      expect.objectContaining({
        objectiveKey: "sales",
        objectiveLabel: "Doanh số",
        costSortAllowed: false,
        results: [
          expect.objectContaining({
            canonicalKey: "purchase",
            value: 2,
            efficiencyLabel: "Cost/Purchase",
            costPerResult: 50,
            attribution: "meta_attributed",
          }),
        ],
      }),
    ]);
  });

  it("keeps Spend-only Objective sections when every Result is disabled", () => {
    const model = buildDynamicResultMetrics({
      context: context({
        objectiveKey: "all",
        primaryResultKey: undefined,
      }),
      definitions: [],
      canonicalResults: [],
      objectiveSpendByObjective: {
        awareness: 100,
        traffic: 200,
      },
      spend: 300,
      impressions: 1_000,
      reach: null,
      clicks: 50,
      value: null,
    });

    expect(model.crossObjectiveSections).toEqual([
      expect.objectContaining({
        objectiveKey: "awareness",
        spend: 100,
        results: [],
      }),
      expect.objectContaining({
        objectiveKey: "traffic",
        spend: 200,
        results: [],
      }),
    ]);
  });

  it("keeps Spend-only Objective sections unavailable in split-currency mode", () => {
    const model = buildDynamicResultMetrics({
      context: context({
        objectiveKey: "all",
        primaryResultKey: undefined,
        currency: undefined,
        currencyMode: "split",
      }),
      definitions: [],
      canonicalResults: [],
      objectiveSpendByObjective: {
        awareness: null,
        traffic: null,
      },
      spend: 300,
      impressions: 1_000,
      reach: null,
      clicks: 50,
      value: null,
    });

    expect(model.crossObjectiveSections).toEqual([
      expect.objectContaining({
        objectiveKey: "awareness",
        spend: null,
        results: [],
      }),
      expect.objectContaining({
        objectiveKey: "traffic",
        spend: null,
        results: [],
      }),
    ]);
  });

  it("does not fabricate Cost/Result for a non-cost efficiency definition", () => {
    const model = buildDynamicResultMetrics({
      context: context({
        objectiveKey: "all",
        primaryResultKey: undefined,
      }),
      definitions: DEFAULT_RESULT_DEFINITIONS,
      canonicalResults: [
        {
          canonicalKey: "purchase_value",
          objectiveKey: "sales",
          value: 400,
          spend: 100,
          hasData: true,
        },
      ],
      spend: 100,
      impressions: 1_000,
      reach: 800,
      clicks: 50,
      value: 400,
    });

    expect(model.crossObjectiveSections[0]?.results[0]).toMatchObject({
      canonicalKey: "purchase_value",
      efficiencyLabel: "Meta-attributed ROAS",
      costPerResult: null,
    });
  });

  it("exposes only results that have data or are configured", () => {
    const model = buildDynamicResultMetrics({
      context: context({
        objectiveKey: "leads",
        primaryResultKey: "messaging_conversation",
      }),
      definitions: DEFAULT_RESULT_DEFINITIONS,
      canonicalResults: [
        {
          canonicalKey: "lead",
          objectiveKey: "leads",
          value: null,
        },
        {
          canonicalKey: "messaging_conversation",
          objectiveKey: "leads",
          value: null,
          configured: true,
        },
        {
          canonicalKey: "complete_registration",
          objectiveKey: "leads",
          value: 0,
          hasData: true,
        },
      ],
      spend: 100,
      impressions: 1_000,
      reach: 800,
      clicks: 50,
      value: null,
    });

    expect(
      model.availableResults.map((result) => result.canonicalKey),
    ).toEqual([
      "messaging_conversation",
      "complete_registration",
    ]);
    expect(
      model.availableResults.some(
        (result) => result.canonicalKey === "lead",
      ),
    ).toBe(false);
  });

  it("does not create monetary cost, CPM or scatter in split-currency mode", () => {
    const model = buildDynamicResultMetrics({
      context: context({
        currency: undefined,
        currencyMode: "split",
      }),
      definitions: DEFAULT_RESULT_DEFINITIONS,
      canonicalResults: [
        {
          canonicalKey: "purchase",
          objectiveKey: "sales",
          value: 4,
          hasData: true,
        },
      ],
      spend: 100,
      impressions: 10_000,
      reach: 8_000,
      clicks: 200,
      value: 600,
    });

    expect(
      model.kpiCards.find((card) => card.key === "spend"),
    ).toMatchObject({
      value: null,
      unavailableReason: "split_currency",
    });
    expect(
      model.kpiCards.find((card) => card.key === "link_cpc"),
    ).toMatchObject({
      value: null,
      unavailableReason: "split_currency",
    });
    expect(
      model.kpiCards.find((card) => card.key === "link_ctr"),
    ).toMatchObject({
      value: 2,
    });
    expect(
      model.kpiCards.find(
        (card) => card.key === "efficiency:purchase",
      ),
    ).toMatchObject({
      value: null,
      unavailableReason: "split_currency",
    });
    expect(
      model.dynamicTableColumns.some(
        (column) => column.key === "efficiency:purchase",
      ),
    ).toBe(false);
    expect(model.scatter).toMatchObject({
      enabled: false,
      unavailableReason: "split_currency",
    });
    expect(model.metadata.costSortMode).toBe(
      "disabled_split_currency",
    );
  });

  it("uses the configured efficiency formula instead of assuming CPI", () => {
    const rateDefinition: ResultDefinition = {
      id: "result_lead_rate",
      canonicalKey: "lead_rate",
      label: "Meta-attributed Qualified Lead",
      shortLabel: "Qualified Lead",
      objectiveKeys: ["leads"],
      rawActionTypes: ["qualified_lead"],
      unit: "count",
      efficiencyMetric: "rate",
      direction: "higher_is_better",
      defaultForObjective: true,
      minimumResults: 5,
      minimumImpressions: 100,
      enabled: true,
    };
    const model = buildDynamicResultMetrics({
      context: context({
        objectiveKey: "leads",
        primaryResultKey: "lead_rate",
      }),
      definitions: [rateDefinition],
      canonicalResults: [
        {
          canonicalKey: "lead_rate",
          objectiveKey: "leads",
          value: 20,
          configured: true,
        },
      ],
      spend: 100,
      impressions: 1_000,
      reach: 800,
      clicks: 100,
      value: null,
    });

    expect(
      model.kpiCards.find(
        (card) => card.key === "efficiency:lead_rate",
      ),
    ).toMatchObject({
      label: "Qualified Lead Rate",
      value: 20,
      valueType: "percent",
      formula:
        "Meta-attributed Qualified Lead / Link Clicks × 100",
    });
  });

  it("uses exact delivery fields for Awareness results without duplicating the Reach KPI", () => {
    const canonicalResults = withDeliveryBackedResultValues({
      values: [
        {
          canonicalKey: "reach",
          objectiveKey: "awareness",
          value: null,
          configured: true,
        },
      ],
      objectiveKey: "awareness",
      impressions: 1_000,
      reach: 800,
      linkClicks: 25,
    });
    const model = buildDynamicResultMetrics({
      context: context({
        objectiveKey: "awareness",
        primaryResultKey: "reach",
      }),
      definitions: DEFAULT_RESULT_DEFINITIONS,
      canonicalResults,
      spend: 100,
      impressions: 1_000,
      reach: 800,
      clicks: 25,
      value: null,
    });

    const reachCards = model.kpiCards.filter(
      (card) => card.label === "Reach",
    );
    expect(reachCards).toHaveLength(1);
    expect(reachCards[0]).toMatchObject({
      key: "reach",
      value: 800,
      attribution: "delivery",
      formula: "Meta-reported period Reach",
      canonicalResultKey: "reach",
    });
    expect(
      model.dynamicTableColumns.find(
        (column) => column.key === "result:reach",
      ),
    ).toMatchObject({
      attribution: "delivery",
      formula: "Meta-reported Reach",
    });
  });
});
