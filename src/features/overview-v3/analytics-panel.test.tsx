import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DisplayMetric } from "@/lib/reporting/metric-preset";

import { AnalyticsPanelV3 } from "./analytics-panel";

function metric({
  key,
  label,
  kind = "delivery",
}: Pick<DisplayMetric, "key" | "label"> & {
  kind?: DisplayMetric["kind"];
}): DisplayMetric {
  return {
    key,
    identity: (
      kind === "delivery" ? `delivery:${key}` : key
    ) as DisplayMetric["identity"],
    kind,
    label,
    value: 1,
    state: "ready",
    source: "meta_delivery",
    formula: "Verified formula",
    valueType: "count",
    direction: "neutral",
    slotRole: "core",
    eligible: true,
    locked: true,
    recommended: false,
    current: { value: 1, state: "ready" },
    previous: null,
    comparison: {
      mode: "none",
      state: "not_requested",
      previousValue: null,
      deltaValue: null,
      deltaPercent: null,
      tone: "neutral",
    },
  };
}

describe("AnalyticsPanelV3", () => {
  it("renders a verified delivery-native trend for the all-Objectives scope", () => {
    const html = renderToStaticMarkup(
      createElement(AnalyticsPanelV3, {
        currency: "VND",
        selectedCard: metric({ key: "link_clicks", label: "Link Clicks" }),
        trend: [
          {
            date: "2026-07-01",
            currency: "VND",
            spend: 500,
            impressions: 10_000,
            linkClicks: 250,
            resultValues: {},
            efficiencyValues: {},
          },
        ],
      }),
    );

    expect(html).toContain('aria-label="Xu hướng Link Clicks"');
    expect(html).toContain("Link Clicks · 1 mốc dữ liệu");
    expect(html).toContain(">250<");
    expect(html).not.toContain("Chưa có chuỗi dữ liệu Meta đủ điều kiện");
  });

  it("does not fabricate a cross-Objective Result trend from delivery data", () => {
    const html = renderToStaticMarkup(
      createElement(AnalyticsPanelV3, {
        currency: "VND",
        selectedCard: metric({
          key: "result:lead",
          label: "Lead",
          kind: "result",
        }),
        trend: [
          {
            date: "2026-07-01",
            currency: "VND",
            spend: 500,
            impressions: 10_000,
            linkClicks: 250,
            resultValues: {},
            efficiencyValues: {},
          },
        ],
      }),
    );

    expect(html).toContain(
      "Chưa có chuỗi dữ liệu Meta đủ điều kiện cho Lead trong kỳ đã chọn.",
    );
    expect(html).not.toContain('aria-label="Xu hướng Lead"');
  });
});
