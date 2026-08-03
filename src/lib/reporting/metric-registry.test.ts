import { describe, expect, it } from "vitest";

import {
  defaultMetricKeysForObjective,
  getMetricDefinition,
  resolveMetricEligibility,
} from "./metric-registry";

describe("metric registry", () => {
  it("declares delivery formulas, sources, fields and denominators explicitly", () => {
    expect(getMetricDefinition("frequency")).toMatchObject({
      kind: "delivery",
      source: "meta_delivery",
      formula: "Σ impressions / exact-period Reach",
      unit: "ratio",
      denominator: "exact_period_reach",
      requiredFields: ["impressions", "exact_period_reach"],
    });
    expect(getMetricDefinition("reach")?.requiredFields).toEqual([
      "exact_period_reach",
    ]);
  });

  it("keeps primary-result metrics gated while allowing Purchase Value/ROAS as Sales supporting metrics", () => {
    const primaryResult = getMetricDefinition("primary_result")!;
    const roas = getMetricDefinition("meta_roas")!;

    expect(
      resolveMetricEligibility(primaryResult, {
        objectiveKey: "all",
        primaryResultKey: "purchase",
      }),
    ).toEqual({ eligible: false, reasonCode: "OBJECTIVE_NOT_ELIGIBLE" });
    expect(
      resolveMetricEligibility(primaryResult, { objectiveKey: "sales" }),
    ).toEqual({ eligible: false, reasonCode: "PRIMARY_RESULT_REQUIRED" });
    expect(
      resolveMetricEligibility(roas, {
        objectiveKey: "sales",
        primaryResultKey: "purchase",
      }),
    ).toEqual({ eligible: true });
    expect(
      resolveMetricEligibility(roas, {
        objectiveKey: "sales",
        primaryResultKey: "purchase_value",
      }),
    ).toEqual({ eligible: true });
  });

  it("exposes the V5 default KPI sets without selecting ineligible Result metrics", () => {
    expect(defaultMetricKeysForObjective("all")).toEqual([
      "spend",
      "impressions",
      "link_clicks",
      "link_ctr",
    ]);
    expect(defaultMetricKeysForObjective("sales")).toEqual([
      "spend",
      "primary_result",
      "cost_per_result",
      "meta_roas",
    ]);
  });
});
