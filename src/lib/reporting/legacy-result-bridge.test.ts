import { describe, expect, it } from "vitest";

import { demoCreatives } from "@/lib/demo-data";

import type { ReportingContext } from "./report-context";
import { DEFAULT_RESULT_DEFINITIONS } from "./result-definition";
import {
  bridgeLegacyTrendPoints,
  withCanonicalCreativeResultValues,
} from "./legacy-result-bridge";

function context(
  objectiveKey: string,
  primaryResultKey: string,
): ReportingContext {
  return {
    businessIds: [],
    adAccountIds: ["act_demo"],
    dateFrom: "2026-07-01",
    dateTo: "2026-07-30",
    compareMode: "none",
    objectiveKey,
    primaryResultKey,
    currency: "VND",
    currencyMode: "single",
    reportingTimezoneMode: "account_local",
    attributionSettingKey: "account_default",
    actionReportTime: "mixed",
    syncVersion: "sync_demo",
  };
}

describe("legacy Result bridge boundary", () => {
  it("translates App Promotion demo delivery and rating into canonical containers", () => {
    const source = demoCreatives[0];
    const bridged = withCanonicalCreativeResultValues({
      rows: [source],
      context: context("app_promotion", "install"),
      definitions: DEFAULT_RESULT_DEFINITIONS,
      legacyBridge: true,
    })[0];

    expect(bridged.performance?.resultValues).toMatchObject({
      install: source.performance?.installs,
      complete_registration:
        source.performance?.registrations,
    });
    expect(bridged.performance?.evaluation).toMatchObject({
      resultKey: "install",
      actualValue:
        source.performance?.ratingExplanation?.actualValue,
      benchmarkValue:
        source.performance?.ratingExplanation?.benchmarkValue,
    });
  });

  it("does not reinterpret legacy Install as a non-Install selected Result", () => {
    const source = demoCreatives[0];
    const bridged = withCanonicalCreativeResultValues({
      rows: [source],
      context: context("leads", "lead"),
      definitions: DEFAULT_RESULT_DEFINITIONS,
      legacyBridge: true,
    })[0];

    expect(bridged.performance?.resultValues).not.toHaveProperty(
      "lead",
    );
    expect(bridged.performance?.evaluation).toBeNull();
  });

  it("builds generic efficiency values for the Result selected by the registry", () => {
    const points = bridgeLegacyTrendPoints({
      points: [
        {
          date: "2026-07-01",
          currency: "VND",
          spend: 1_000_000,
          impressions: 20_000,
          linkClicks: 400,
          installs: 10,
          registrations: 2,
        },
      ],
      context: context("app_promotion", "install"),
      definitions: DEFAULT_RESULT_DEFINITIONS,
    });

    expect(points[0]).toMatchObject({
      resultValues: { install: 10 },
      efficiencyValues: { install: 100_000 },
    });
    expect(points[0]).not.toHaveProperty("cpi");
  });
});
