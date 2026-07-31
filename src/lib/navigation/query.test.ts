import { describe, expect, it } from "vitest";
import {
  buildCompatibilityHref,
  buildContextHref,
  buildNavigationHref,
  parseNavigationQuery,
  reportingContextHiddenFields,
} from "./query";

describe("navigation query contract", () => {
  it("canonicalizes repeated plural scope values without dropping accounts", () => {
    const params = new URLSearchParams();
    params.append("business_ids", "bm_1");
    params.append("business_ids", "bm_2");
    params.append("account_ids", "act_1");
    params.append("account_ids", "act_2");

    expect(parseNavigationQuery(params)).toMatchObject({
      business_ids: "bm_1,bm_2",
      account_ids: "act_1,act_2",
    });
  });

  it("parses the shared filters and route-local detail state", () => {
    const query = new URLSearchParams({
      from: "2026-07-01",
      to: "2026-07-30",
      business_ids: "biz_1,biz_2",
      account_ids: "act_123,act_456",
      account: "act_123",
      objective: "sales",
      result: "purchase",
      campaign: "cmp_456",
      os: "android",
      format: "video",
      performance: "winner",
      data_status: "fresh",
      currency: "usd",
      compare: "previous_period",
      attribution: "account_default",
      action_report_time: "mixed",
      sync_version: "sync_20260730",
      selected: "creative-family-1",
      tab: "performance",
      compare_ids:
        "cf_111111111111111111111111,cf_222222222222222222222222",
      metric: "cpi",
      sort: "asc",
      ignored: "value",
    });

    expect(parseNavigationQuery(query)).toEqual({
      from: "2026-07-01",
      to: "2026-07-30",
      business_ids: "biz_1,biz_2",
      account_ids: "act_123,act_456",
      account: "act_123",
      objective: "sales",
      result: "purchase",
      campaign: "cmp_456",
      os: "android",
      format: "video",
      performance: "winner",
      data_status: "fresh",
      currency: "USD",
      compare: "previous_period",
      attribution: "account_default",
      action_report_time: "mixed",
      sync_version: "sync_20260730",
      selected: "creative-family-1",
      tab: "performance",
      compare_ids:
        "cf_111111111111111111111111,cf_222222222222222222222222",
      metric: "cpi",
      sort: "asc",
    });
  });

  it("drops invalid dates, compare values, currencies, and duplicate values", () => {
    const query = new URLSearchParams();
    query.append("from", "2026-02-30");
    query.append("to", " ");
    query.append("account", " act_1 ");
    query.append("account", "act_2");
    query.append("currency", "US dollars");
    query.append("compare", "cf_111111111111111111111111");
    query.append("compare_ids", "not-a-family");
    query.append("metric", "javascript:alert(1)");
    query.append("sort", "sideways");
    query.append("business_ids", "good_business,<script>");
    query.append("account_ids", "act_1,act_1, javascript:alert(1)");
    query.append("objective", "Sales Objective");
    query.append("result", "../purchase");
    query.append("action_report_time", "click");
    query.append("sync_version", "javascript:alert(1)");

    expect(parseNavigationQuery(query)).toEqual({
      business_ids: "good_business",
      account_ids: "act_1",
      account: "act_1",
    });
  });

  it("canonicalizes multi-scope URL state and keeps it across pages", () => {
    const current = new URLSearchParams({
      business_ids: "biz_2,biz_1,biz_2",
      account_ids: "act_2,act_1,act_2",
      objective: "lead_generation",
      result: "lead",
      sync_version: "run_123",
    });

    expect(parseNavigationQuery(current)).toEqual({
      business_ids: "biz_2,biz_1",
      account_ids: "act_2,act_1",
      objective: "lead_generation",
      result: "lead",
      sync_version: "run_123",
    });
    expect(buildNavigationHref("/campaigns", current)).toBe(
      "/campaigns?business_ids=biz_2%2Cbiz_1&account_ids=act_2%2Cact_1&objective=lead_generation&result=lead&sync_version=run_123",
    );
    expect(reportingContextHiddenFields(current)).toEqual({
      business_ids: "biz_2,biz_1",
      account_ids: "act_2,act_1",
      objective: "lead_generation",
      result: "lead",
      sync_version: "run_123",
    });
  });

  it("keeps validated Creative drill-down state only inside the current screen", () => {
    const current = new URLSearchParams({
      from: "2026-07-01",
      metric: "registrations",
      sort: "desc",
    });

    expect(
      buildContextHref("/creatives?view=table", current),
    ).toBe(
      "/creatives?view=table&from=2026-07-01&metric=registrations&sort=desc",
    );
    expect(buildNavigationHref("/sources", current)).toBe(
      "/sources?from=2026-07-01",
    );
  });

  it("keeps reporting context across primary navigation", () => {
    const current = new URLSearchParams({
      from: "2026-07-01",
      to: "2026-07-30",
      account: "act_123",
      business_ids: "biz_123",
      account_ids: "act_123,act_456",
      objective: "app_promotion",
      result: "install",
      currency: "VND",
      compare: "previous_period",
      selected: "creative-family-1",
      tab: "preview",
      compare_ids: "cf_111111111111111111111111",
    });

    expect(
      buildNavigationHref("/sources?tab=connection", current),
    ).toBe(
      "/sources?tab=connection&from=2026-07-01&to=2026-07-30&business_ids=biz_123&account_ids=act_123%2Cact_456&account=act_123&objective=app_promotion&result=install&currency=VND&compare=previous_period",
    );
  });

  it("keeps detail state for in-screen links and applies overrides", () => {
    const current = new URLSearchParams({
      from: "2026-07-01",
      selected: "creative-family-1",
      tab: "preview",
    });

    expect(
      buildContextHref("/creatives", current, {
        tab: "rating",
        selected: null,
      }),
    ).toBe("/creatives?from=2026-07-01&tab=rating");
  });

  it("preserves legacy query values while destination defaults win", () => {
    expect(
      buildCompatibilityHref("/sources?tab=connection", {
        tab: "old",
        error: "META_OAUTH_FAILED",
      }),
    ).toBe("/sources?error=META_OAUTH_FAILED&tab=connection");
  });
});
