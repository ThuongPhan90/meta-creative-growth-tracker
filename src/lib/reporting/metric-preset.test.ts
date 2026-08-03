import { describe, expect, it } from "vitest";

import { DEFAULT_RESULT_DEFINITIONS } from "./result-definition";
import {
  resolveDisplayMetrics,
  sanitizeMetricDisplayPresets,
  validateMetricDisplayPresets,
} from "./metric-preset";
import { buildDynamicResultMetrics } from "./result-metrics";
import type { ReportingContext } from "./report-context";

function context(
  overrides: Partial<ReportingContext> = {},
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
    actionReportTime: "mixed",
    syncVersion: "run-1",
    ...overrides,
  };
}

function salesMetrics({
  purchase,
  purchaseValue,
  spend = 100,
}: {
  purchase: number;
  purchaseValue: number;
  spend?: number;
}) {
  return buildDynamicResultMetrics({
    context: context(),
    definitions: DEFAULT_RESULT_DEFINITIONS,
    canonicalResults: [
      {
        canonicalKey: "purchase",
        objectiveKey: "sales",
        value: purchase,
        configured: true,
        hasData: true,
      },
      {
        canonicalKey: "purchase_value",
        objectiveKey: "sales",
        value: purchaseValue,
        configured: true,
        hasData: true,
      },
    ],
    spend,
    impressions: 1_000,
    reach: 800,
    clicks: 50,
    value: purchaseValue,
  });
}

describe("metric display preset contract", () => {
  it("canonicalizes explicit legacy aliases and restores locked core metrics", () => {
    const result = validateMetricDisplayPresets({
      version: 1,
      presets: {
        "sales:purchase": [
          "spend",
          "result:purchase",
          "meta_roas",
        ],
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        version: 1,
        presets: {
          "sales:purchase": [
            "spend",
            "result:purchase",
            "efficiency:purchase",
            "efficiency:purchase_value",
          ],
        },
      },
    });
  });

  it("rejects free-form identities and scopes that could become a dashboard builder", () => {
    expect(
      validateMetricDisplayPresets({
        version: 1,
        presets: { "sales:purchase": ["account:act_123"] },
      }),
    ).toMatchObject({ ok: false, code: "UNKNOWN_METRIC_IDENTITY" });
    expect(
      validateMetricDisplayPresets({
        version: 1,
        presets: {
          "sales:purchase": [
            "spend",
            "result:purchase",
            "efficiency:purchase",
            "link_ctr",
            "link_clicks",
            "impressions",
            "reach",
          ],
        },
      }),
    ).toMatchObject({ ok: false, code: "TOO_MANY_DISPLAY_METRICS" });
  });

  it("rejects an unknown Objective or Primary Result context even when its metric list is empty", () => {
    expect(
      validateMetricDisplayPresets({
        version: 1,
        presets: { "unknown:purchase": [] },
      }),
    ).toMatchObject({ ok: false, code: "INVALID_METRIC_PRESET" });
    expect(
      validateMetricDisplayPresets({
        version: 1,
        presets: { "sales:not_a_result": [] },
      }),
    ).toMatchObject({ ok: false, code: "INVALID_METRIC_PRESET" });
  });

  it("preserves a structurally valid custom mapping until its live registry is loaded", () => {
    const purchase = DEFAULT_RESULT_DEFINITIONS.find(
      (definition) => definition.canonicalKey === "purchase",
    );
    expect(purchase).toBeDefined();
    const customDefinitions = [
      ...DEFAULT_RESULT_DEFINITIONS,
      {
        ...purchase!,
        id: "result_qualified_purchase",
        canonicalKey: "qualified_purchase",
        label: "Qualified Purchase",
        shortLabel: "Qualified Purchase",
      },
    ];
    const input = {
      version: 1,
      presets: {
        "sales:qualified_purchase": ["efficiency:qualified_purchase"],
      },
    };

    expect(
      validateMetricDisplayPresets(input, {
        resultDefinitions: customDefinitions,
      }),
    ).toMatchObject({ ok: true });
    expect(sanitizeMetricDisplayPresets(input)).toEqual({
      version: 1,
      presets: {
        "sales:qualified_purchase": [
          "spend",
          "result:qualified_purchase",
          "efficiency:qualified_purchase",
        ],
      },
    });
  });

  it("uses Purchase Value/ROAS as a supporting Sales diagnostic without changing Purchase primary", () => {
    const current = salesMetrics({ purchase: 10, purchaseValue: 1_000 });
    const previous = salesMetrics({ purchase: 8, purchaseValue: 600 });
    const resolved = resolveDisplayMetrics({
      resultMetrics: current,
      previousResultMetrics: previous,
      objectiveKey: "sales",
      primaryResultKey: "purchase",
      comparisonMode: "previous_period",
    });

    expect(resolved.metrics.map((metric) => metric.key)).toEqual([
      "spend",
      "result:purchase",
      "efficiency:purchase",
      "efficiency:purchase_value",
    ]);
    expect(resolved.context.primaryResultKey).toBe("purchase");
    expect(
      resolved.metrics.find((metric) => metric.key === "efficiency:purchase"),
    ).toMatchObject({
      label: "Cost/Purchase",
      direction: "lower_is_better",
      comparison: {
        state: "ready",
        tone: "positive",
      },
    });
    expect(
      resolved.metrics.find(
        (metric) => metric.key === "efficiency:purchase_value",
      ),
    ).toMatchObject({
      label: "ROAS (Meta)",
      value: 10,
      canonicalResultKey: "purchase_value",
      direction: "higher_is_better",
      comparison: {
        state: "ready",
        tone: "positive",
      },
    });
  });

  it("selects Registration deterministically as App Promotion supporting result", () => {
    const appContext = context({
      objectiveKey: "app_promotion",
      primaryResultKey: "install",
    });
    const resultMetrics = buildDynamicResultMetrics({
      context: appContext,
      definitions: DEFAULT_RESULT_DEFINITIONS,
      canonicalResults: [
        {
          canonicalKey: "install",
          objectiveKey: "app_promotion",
          value: 12,
          configured: true,
          hasData: true,
        },
        {
          canonicalKey: "complete_registration",
          objectiveKey: "app_promotion",
          value: 5,
          configured: true,
          hasData: true,
        },
      ],
      spend: 120,
      impressions: 1_200,
      reach: 900,
      clicks: 80,
      value: null,
    });
    const resolved = resolveDisplayMetrics({
      resultMetrics,
      objectiveKey: "app_promotion",
      primaryResultKey: "install",
    });

    expect(resolved.metrics.map((metric) => metric.key)).toEqual([
      "spend",
      "result:install",
      "efficiency:install",
      "result:complete_registration",
    ]);
    expect(
      resolved.availableMetrics.find(
        (metric) => metric.key === "efficiency:complete_registration",
      ),
    ).toMatchObject({
      eligible: true,
      direction: "lower_is_better",
      slotRole: "optional",
    });
  });

  it("does not create a percentage comparison from a zero baseline", () => {
    const current = salesMetrics({ purchase: 1, purchaseValue: 100, spend: 0 });
    const previous = salesMetrics({ purchase: 1, purchaseValue: 100, spend: 0 });
    const resolved = resolveDisplayMetrics({
      resultMetrics: current,
      previousResultMetrics: previous,
      objectiveKey: "sales",
      primaryResultKey: "purchase",
    });
    expect(resolved.metrics[0]?.comparison).toMatchObject({
      state: "zero_baseline",
      deltaPercent: null,
      tone: "neutral",
    });
  });

  it("blocks monetary supporting Sales metrics in split-currency mode", () => {
    const splitContext = context({ currencyMode: "split" });
    const resultMetrics = buildDynamicResultMetrics({
      context: splitContext,
      definitions: DEFAULT_RESULT_DEFINITIONS,
      canonicalResults: [
        {
          canonicalKey: "purchase",
          objectiveKey: "sales",
          value: 10,
          configured: true,
          hasData: true,
        },
        {
          canonicalKey: "purchase_value",
          objectiveKey: "sales",
          value: 1_000,
          configured: true,
          hasData: true,
        },
      ],
      spend: 100,
      impressions: 1_000,
      reach: 800,
      clicks: 50,
      value: 1_000,
    });
    const resolved = resolveDisplayMetrics({
      resultMetrics,
      objectiveKey: "sales",
      primaryResultKey: "purchase",
    });

    expect(
      resolved.availableMetrics.find(
        (metric) => metric.key === "result:purchase_value",
      ),
    ).toMatchObject({
      value: null,
      state: "unavailable",
      eligible: false,
      reasonCode: "SPLIT_CURRENCY",
    });
    expect(
      resolved.availableMetrics.find(
        (metric) => metric.key === "efficiency:purchase_value",
      ),
    ).toMatchObject({
      value: null,
      state: "unavailable",
      eligible: false,
      reasonCode: "SPLIT_CURRENCY",
    });
  });
});
