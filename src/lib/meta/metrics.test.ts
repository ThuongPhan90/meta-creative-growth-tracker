import { describe, expect, it } from "vitest";
import { getMetaActionMapping } from "./config";
import {
  extractActionMetric,
  parseActionMetrics,
  parseInsightMetrics,
} from "./metrics";

describe("Meta action metric parsing", () => {
  it("uses the first configured alias present to avoid omni double counting", () => {
    const result = parseActionMetrics({
      actions: [
        { action_type: "mobile_app_install", value: "12" },
        { action_type: "omni_app_install", value: "12" },
        { action_type: "complete_registration", value: "5" },
      ],
    });

    expect(result).toEqual({
      metaAttributedInstalls: 12,
      metaAttributedRegistrations: 5,
    });
  });

  it("supports deployment-specific ordered action aliases", () => {
    const mapping = getMetaActionMapping({
      INSTALL_ACTION_TYPES: "custom_install,mobile_app_install",
      REGISTRATION_ACTION_TYPES: "custom_registration",
    });
    const result = parseActionMetrics(
      {
        actions: [
          { action_type: "custom_install", value: "8" },
          { action_type: "mobile_app_install", value: "10" },
          { action_type: "custom_registration", value: "3" },
        ],
      },
      mapping,
    );

    expect(result.metaAttributedInstalls).toBe(8);
    expect(result.metaAttributedRegistrations).toBe(3);
  });

  it("can intentionally sum aliases when the caller opts in", () => {
    expect(
      extractActionMetric(
        [
          { action_type: "a", value: "2" },
          { action_type: "b", value: "3" },
        ],
        { actionTypes: ["a", "b"], strategy: "sum-matches" },
      ),
    ).toBe(5);
  });

  it("ignores negative, invalid, and missing values", () => {
    expect(
      extractActionMetric(
        [
          { action_type: "install", value: "-2" },
          { action_type: "install", value: "not-a-number" },
          { action_type: "install" },
        ],
        { actionTypes: ["install"], strategy: "first-match" },
      ),
    ).toBe(0);
  });
});

describe("parseInsightMetrics", () => {
  it("derives transparent app and video metrics from raw numerators", () => {
    const result = parseInsightMetrics({
      spend: "100",
      impressions: "1000",
      reach: "800",
      frequency: "1.25",
      inline_link_clicks: "30",
      actions: [
        { action_type: "mobile_app_install", value: "20" },
        { action_type: "complete_registration", value: "5" },
      ],
      video_3_sec_watched_actions: [
        { action_type: "video_view", value: "400" },
      ],
      video_p100_watched_actions: [
        { action_type: "video_view", value: "100" },
      ],
    });

    expect(result).toMatchObject({
      spend: 100,
      impressions: 1000,
      reach: 800,
      frequency: 1.25,
      inlineLinkClicks: 30,
      linkCtrPercent: 3,
      metaAttributedInstalls: 20,
      metaAttributedRegistrations: 5,
      costPerMetaAttributedInstall: 5,
      costPerMetaAttributedRegistration: 20,
      threeSecondVideoViews: 400,
      completedVideoViews: 100,
      hookRatePercent: 40,
      holdRatePercent: 25,
    });
  });

  it("returns null ratios instead of claiming performance without delivery", () => {
    const result = parseInsightMetrics({});

    expect(result.linkCtrPercent).toBeNull();
    expect(result.costPerMetaAttributedInstall).toBeNull();
    expect(result.costPerMetaAttributedRegistration).toBeNull();
    expect(result.hookRatePercent).toBeNull();
    expect(result.holdRatePercent).toBeNull();
  });
});
