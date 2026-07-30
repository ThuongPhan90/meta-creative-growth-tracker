import { describe, expect, it } from "vitest";
import {
  buildCompatibilityHref,
  buildContextHref,
  buildNavigationHref,
  parseNavigationQuery,
} from "./query";

describe("navigation query contract", () => {
  it("parses the shared filters and route-local detail state", () => {
    const query = new URLSearchParams({
      from: "2026-07-01",
      to: "2026-07-30",
      account: "act_123",
      campaign: "cmp_456",
      os: "android",
      format: "video",
      performance: "winner",
      data_status: "fresh",
      currency: "usd",
      compare: "previous_period",
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
      account: "act_123",
      campaign: "cmp_456",
      os: "android",
      format: "video",
      performance: "winner",
      data_status: "fresh",
      currency: "USD",
      compare: "previous_period",
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

    expect(parseNavigationQuery(query)).toEqual({ account: "act_1" });
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
      currency: "VND",
      compare: "previous_period",
      selected: "creative-family-1",
      tab: "preview",
      compare_ids: "cf_111111111111111111111111",
    });

    expect(
      buildNavigationHref("/sources?tab=connection", current),
    ).toBe(
      "/sources?tab=connection&from=2026-07-01&to=2026-07-30&account=act_123&currency=VND&compare=previous_period",
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
