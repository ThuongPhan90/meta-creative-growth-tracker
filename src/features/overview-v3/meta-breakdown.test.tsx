import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { MetaBreakdownModel } from "@/lib/reporting";

import { MetaBreakdownV3 } from "./meta-breakdown";

const model: MetaBreakdownModel = {
  currency: "VND",
  dimensions: {
    ad_account: {
      state: "ready",
      rows: [
        {
          id: "act_1",
          label: "Foxscore · act_1",
          spend: 100000,
          impressions: 5000,
          linkClicks: 50,
        },
      ],
    },
    objective: { state: "ready", rows: [] },
    campaign: { state: "ready", rows: [] },
    placement: {
      state: "unavailable",
      rows: [],
      reason: "placement_breakdown_unavailable",
    },
    meta_platform: { state: "ready", rows: [] },
  },
};

describe("MetaBreakdownV3", () => {
  it("defaults to Ad Account and exposes only the permitted Meta breakdown choices", () => {
    const markup = renderToStaticMarkup(<MetaBreakdownV3 model={model} />);

    expect(markup).toContain("Theo Ad Account");
    expect(markup).toContain('aria-label="Phân bổ theo"');
    expect(markup).toContain('<option value="ad_account" selected="">Ad Account</option>');
    expect(markup).toContain("Mục tiêu");
    expect(markup).toContain("Campaign");
    expect(markup).toContain("Placement");
    expect(markup).toContain("Meta Platform");
    expect(markup).toContain("Foxscore · act_1");
    expect(markup).toContain("VND");
  });
});
