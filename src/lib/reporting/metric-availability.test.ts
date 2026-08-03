import { describe, expect, it } from "vitest";

import { resolveMetricAvailability } from "./metric-availability";
import { getMetricDefinition } from "./metric-registry";

function metric(key: string) {
  const definition = getMetricDefinition(key);
  if (!definition) throw new Error(`Unknown metric fixture: ${key}`);
  return definition;
}

describe("resolveMetricAvailability", () => {
  it("preserves a verified zero instead of treating it as unavailable", () => {
    expect(
      resolveMetricAvailability(metric("spend"), {
        value: 0,
        objectiveKey: "traffic",
        currencyMode: "single",
        coverage: { includedAccounts: 2, selectedAccounts: 2 },
        dataThrough: "2026-08-01",
      }),
    ).toEqual({
      value: 0,
      state: "zero",
      formula: "Σ spend",
      source: "meta_delivery",
      coverage: { includedAccounts: 2, selectedAccounts: 2 },
      dataThrough: "2026-08-01",
    });
  });

  it("keeps unavailable exact-period Reach as an unavailable metric", () => {
    expect(
      resolveMetricAvailability(metric("reach"), {
        value: null,
        objectiveKey: "awareness",
        dataState: "unavailable",
      }),
    ).toMatchObject({
      value: null,
      state: "unavailable",
      reasonCode: "DATA_UNAVAILABLE",
      formula: "Meta exact-period Reach đúng scope/query grain",
    });
  });

  it("does not turn a partial zero into a verified zero", () => {
    expect(
      resolveMetricAvailability(metric("impressions"), {
        value: 0,
        objectiveKey: "traffic",
        dataState: "partial",
        coverage: { includedAccounts: 1, selectedAccounts: 2 },
      }),
    ).toMatchObject({
      value: null,
      state: "partial",
      reasonCode: "PARTIAL_DATA",
    });
  });

  it("blocks money metrics in split currency while keeping count metrics available", () => {
    expect(
      resolveMetricAvailability(metric("spend"), {
        value: 125,
        objectiveKey: "traffic",
        currencyMode: "split",
      }),
    ).toMatchObject({
      value: null,
      state: "unavailable",
      reasonCode: "SPLIT_CURRENCY",
    });
    expect(
      resolveMetricAvailability(metric("impressions"), {
        value: 1_250,
        objectiveKey: "traffic",
        currencyMode: "split",
      }),
    ).toMatchObject({
      value: 1_250,
      state: "ready",
    });
  });

  it("fails closed when a derived metric has no usable denominator", () => {
    expect(
      resolveMetricAvailability(metric("cost_per_result"), {
        value: 20,
        denominator: 0,
        objectiveKey: "leads",
        primaryResultKey: "lead",
        currencyMode: "single",
      }),
    ).toMatchObject({
      value: null,
      state: "unavailable",
      reasonCode: "MISSING_DENOMINATOR",
    });
  });
});
