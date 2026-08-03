import { describe, expect, it } from "vitest";

import {
  buildContextHref,
  buildNavigationHref,
  reportingContextHiddenFields,
} from "./query";
import { PRIMARY_NAVIGATION } from "./routes";

const REPORTING_CONTEXT = {
  from: "2026-07-03",
  to: "2026-08-01",
  business_ids: "bm_1,bm_2",
  account_ids: "act_1,act_2",
  objective: "sales",
  result: "purchase",
  currency: "VND",
  compare: "previous_period",
  attribution: "account_default",
  action_report_time: "mixed",
  sync_version: "sync_20260801",
} as const;

const CURRENT_QUERY = new URLSearchParams({
  ...REPORTING_CONTEXT,
  selected: "cf_123",
  tab: "analysis",
  compare_ids: "cf_111111111111111111111111",
  metric: "roas",
  sort: "desc",
});

function searchParams(href: string) {
  return new URL(href, "https://tracker.test").searchParams;
}

function expectReportingContext(params: URLSearchParams) {
  for (const [key, value] of Object.entries(REPORTING_CONTEXT)) {
    expect(params.get(key), key).toBe(value);
  }
}

describe("V6 reporting-context navigation acceptance", () => {
  it("preserves every shareable reporting context field across every primary navigation destination", () => {
    for (const item of PRIMARY_NAVIGATION) {
      const params = searchParams(buildNavigationHref(item.href, CURRENT_QUERY));

      expectReportingContext(params);
      expect(params.get("selected")).toBeNull();
      expect(params.get("compare_ids")).toBeNull();
      expect(params.get("metric")).toBeNull();
      expect(params.get("sort")).toBeNull();
    }
  });

  it("keeps the reporting context when a route-local drawer is reset", () => {
    const params = searchParams(
      buildContextHref("/creatives", CURRENT_QUERY, {
        selected: null,
        tab: null,
      }),
    );

    expectReportingContext(params);
    expect(params.get("selected")).toBeNull();
    expect(params.get("tab")).toBeNull();
    expect(params.get("metric")).toBe("roas");
    expect(params.get("sort")).toBe("desc");
  });

  it("keeps non-native reporting fields as hidden form state so Apply cannot drop them", () => {
    expect(reportingContextHiddenFields(CURRENT_QUERY)).toEqual({
      business_ids: "bm_1,bm_2",
      account_ids: "act_1,act_2",
      objective: "sales",
      result: "purchase",
      attribution: "account_default",
      action_report_time: "mixed",
      sync_version: "sync_20260801",
    });
  });
});
